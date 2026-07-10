import { query, mutation, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { getAuthUserId } from "./authHelper";

// ═══════════════════════════════════════════════════════════
// Aufträge API — Pflicht-Dokument vor jeder Rechnung
// ═══════════════════════════════════════════════════════════

// Atomically pull the next number from the per-user/per-year sequence.
// Runs inside the calling mutation's transaction — lückenlos garantiert.
async function nextSequenceNumber(
  ctx: MutationCtx,
  userId: Id<"users">,
  year: number,
  prefix: string
): Promise<string> {
  const existing = await ctx.db
    .query("numberSequences")
    .withIndex("userId_year", (q) => q.eq("userId", userId).eq("year", year))
    .first();

  let num: number;
  if (existing) {
    num = existing.nextNumber;
    await ctx.db.patch(existing._id, { nextNumber: num + 1 });
  } else {
    num = 1;
    await ctx.db.insert("numberSequences", {
      userId,
      year,
      nextNumber: 2,
      createdAt: Date.now(),
    });
  }
  return `${prefix}-${year}-${String(num).padStart(6, "0")}`;
}

// Free-plan limits: 3 Aufträge + 3 Rechnungen pro Monat
const FREE_PLAN_MONTHLY_LIMIT = 3;

function startOfCurrentMonth(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

// List all auftrags for a user
export const list = query({
  args: { userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx, args.sessionToken);
    return await ctx.db
      .query("auftrags")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(100);
  },
});

// Get single auftrag
export const get = query({
  args: { auftragId: v.id("auftrags"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx, args.sessionToken);
    const auftrag = await ctx.db.get(args.auftragId);
    if (!auftrag) return null;
    if (auftrag.userId !== userId) throw new Error("Zugriff verweigert");
    return auftrag;
  },
});

// Get next auftrag number
export const getNextNumber = mutation({
  args: { userId: v.id("users"), sessionToken: v.string(), year: v.number() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx, args.sessionToken);
    const existing = await ctx.db
      .query("numberSequences")
      .withIndex("userId_year", (q) => q.eq("userId", userId).eq("year", args.year))
      .first();

    if (existing) {
      const nextNum = existing.nextNumber;
      await ctx.db.patch(existing._id, { nextNumber: nextNum + 1 });
      return `AU-${args.year}-${String(nextNum).padStart(6, "0")}`;
    } else {
      await ctx.db.insert("numberSequences", {
        userId,
        year: args.year,
        nextNumber: 2,
        createdAt: Date.now(),
      });
      return `AU-${args.year}-000001`;
    }
  },
});

// Create auftrag
export const create = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    number: v.optional(v.string()), // wenn nicht gesetzt: atomar aus Nummernkreis
    date: v.string(),
    deliveryDate: v.optional(v.string()),
    periodStart: v.optional(v.string()),
    periodEnd: v.optional(v.string()),
    customerId: v.optional(v.id("customers")),
    recipientName: v.string(),
    recipientStreet: v.string(),
    recipientCity: v.string(),
    recipientUid: v.optional(v.string()),
    taxMode: v.string(),
    taxRate: v.number(),
    taxNote: v.optional(v.string()),
    netAmount: v.number(),
    vatAmount: v.number(),
    grossAmount: v.number(),
    items: v.array(v.object({
      pos: v.number(),
      description: v.string(),
      qty: v.number(),
      unit: v.string(),
      unitPrice: v.number(),
      total: v.number(),
    })),
    paymentTerms: v.string(),
    footer: v.optional(v.string()),
    angebotId: v.optional(v.id("angebots")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx, args.sessionToken);
    const now = Date.now();

    // Free-plan limit: max 3 Aufträge pro Monat
    const user = await ctx.db.get(args.userId);
    if (user && user.plan === "free") {
      const monthStart = startOfCurrentMonth();
      const monthAuftrags = await ctx.db
        .query("auftrags")
        .withIndex("userId", (q) => q.eq("userId", args.userId))
        .filter((q) => q.gte(q.field("createdAt"), monthStart))
        .collect();
      if (monthAuftrags.length >= FREE_PLAN_MONTHLY_LIMIT) {
        throw new Error(
          "Free-Plan Limit erreicht: 3 Aufträge pro Monat. Upgrade auf Starter für unbegrenzte Aufträge."
        );
      }
    }

    // Server-side atomic number — lückenloser Nummernkreis
    const number =
      args.number ?? (await nextSequenceNumber(ctx, args.userId, new Date().getFullYear(), "AU"));

    const { sessionToken, ...rest } = args;
    const auftragId = await ctx.db.insert("auftrags", {
      ...rest,
      userId,
      number,
      status: "draft",
      rechnungIds: [],
      createdAt: now,
      updatedAt: now,
    });

    // If created from angebot, link back
    if (args.angebotId) {
      await ctx.db.patch(args.angebotId, {
        auftragId,
        status: "confirmed",
        confirmedDate: args.date,
      });
    }

    await ctx.db.insert("auditLog", {
      userId,
      action: "auftrag_created",
      details: `Auftrag ${number} — €${args.grossAmount.toFixed(2)}`,
      timestamp: now,
    });

    return auftragId;
  },
});

// Confirm auftrag (→ can create rechnung)
export const confirm = mutation({
  args: { auftragId: v.id("auftrags"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx, args.sessionToken);
    const auftrag = await ctx.db.get(args.auftragId);
    if (!auftrag) throw new Error("Auftrag not found");
    if (auftrag.userId !== userId) throw new Error("Zugriff verweigert");
    if (auftrag.status === "discarded") throw new Error("Auftrag was discarded");

    await ctx.db.patch(args.auftragId, {
      status: "confirmed",
      confirmedDate: new Date().toLocaleDateString("de-AT"),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("auditLog", {
      userId: auftrag.userId,
      action: "auftrag_confirmed",
      details: `Auftrag ${auftrag.number} confirmed`,
      timestamp: Date.now(),
    });
  },
});

// Discard auftrag
export const discard = mutation({
  args: { auftragId: v.id("auftrags"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx, args.sessionToken);
    const auftrag = await ctx.db.get(args.auftragId);
    if (!auftrag) throw new Error("Auftrag not found");
    if (auftrag.userId !== userId) throw new Error("Zugriff verweigert");
    if (auftrag.status === "confirmed") throw new Error("Cannot discard confirmed auftrag");

    await ctx.db.patch(args.auftragId, {
      status: "discarded",
      discardedDate: new Date().toLocaleDateString("de-AT"),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("auditLog", {
      userId: auftrag.userId,
      action: "auftrag_discarded",
      details: `Auftrag ${auftrag.number} discarded`,
      timestamp: Date.now(),
    });
  },
});

// Unconfirm — setzt einen bestätigten Auftrag zurück auf Entwurf
// Nur erlaubt wenn noch keine Rechnung generiert wurde
export const unconfirm = mutation({
  args: { auftragId: v.id("auftrags"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx, args.sessionToken);
    const auftrag = await ctx.db.get(args.auftragId);
    if (!auftrag) throw new Error("Auftrag not found");
    if (auftrag.userId !== userId) throw new Error("Zugriff verweigert");
    if (auftrag.status !== "confirmed") throw new Error("Auftrag ist nicht bestätigt");

    // Prüfen ob bereits Rechnungen existieren
    const rechnungIds = auftrag.rechnungIds || [];
    if (rechnungIds.length > 0) {
      throw new Error("Auftrag kann nicht zurückgesetzt werden — bereits Rechnungen generiert");
    }

    await ctx.db.patch(args.auftragId, {
      status: "draft",
      confirmedDate: undefined,
      sentDate: undefined,
      updatedAt: Date.now(),
    });

    await ctx.db.insert("auditLog", {
      userId: auftrag.userId,
      action: "auftrag_unconfirmed",
      details: `Auftrag ${auftrag.number} zurückgesetzt auf Entwurf`,
      timestamp: Date.now(),
    });
  },
});

// Delete auftrag — komplett löschen (nur wenn keine Rechnung existiert)
export const deleteAuftrag = mutation({
  args: { auftragId: v.id("auftrags"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx, args.sessionToken);
    const auftrag = await ctx.db.get(args.auftragId);
    if (!auftrag) throw new Error("Auftrag not found");
    if (auftrag.userId !== userId) throw new Error("Zugriff verweigert");

    // Prüfen ob bereits Rechnungen existieren
    const rechnungIds = auftrag.rechnungIds || [];
    if (rechnungIds.length > 0) {
      throw new Error("Auftrag kann nicht gelöscht werden — bereits Rechnungen generiert");
    }

    // Verknüpftes Angebot ebenfalls löschen
    const angebot = await ctx.db
      .query("angebots")
      .withIndex("userId", (q) => q.eq("userId", auftrag.userId))
      .filter((q) => q.eq(q.field("auftragId"), args.auftragId))
      .first();

    if (angebot) {
      await ctx.db.delete(angebot._id);
    }

    await ctx.db.delete(args.auftragId);

    await ctx.db.insert("auditLog", {
      userId: auftrag.userId,
      action: "auftrag_deleted",
      details: `Auftrag ${auftrag.number} gelöscht`,
      timestamp: Date.now(),
    });
  },
});

// Update auftrag — nur im Entwurf-Status
export const update = mutation({
  args: {
    auftragId: v.id("auftrags"),
    sessionToken: v.string(),
    date: v.optional(v.string()),
    deliveryDate: v.optional(v.string()),
    recipientName: v.optional(v.string()),
    recipientStreet: v.optional(v.string()),
    recipientCity: v.optional(v.string()),
    recipientUid: v.optional(v.string()),
    taxMode: v.optional(v.string()),
    taxRate: v.optional(v.number()),
    taxNote: v.optional(v.string()),
    netAmount: v.optional(v.number()),
    vatAmount: v.optional(v.number()),
    grossAmount: v.optional(v.number()),
    paymentTerms: v.optional(v.string()),
    items: v.optional(v.array(v.object({
      pos: v.number(),
      description: v.string(),
      qty: v.number(),
      unit: v.string(),
      unitPrice: v.number(),
      total: v.number(),
    }))),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx, args.sessionToken);
    const auftrag = await ctx.db.get(args.auftragId);
    if (!auftrag) throw new Error("Auftrag not found");
    if (auftrag.userId !== userId) throw new Error("Zugriff verweigert");
    if (auftrag.status !== "draft") throw new Error("Auftrag kann nur im Entwurf-Status bearbeitet werden");

    const { sessionToken, auftragId, ...updates } = args;
    await ctx.db.patch(auftragId, {
      ...updates,
      updatedAt: Date.now(),
    });

    await ctx.db.insert("auditLog", {
      userId: auftrag.userId,
      action: "auftrag_updated",
      details: `Auftrag ${auftrag.number} bearbeitet`,
      timestamp: Date.now(),
    });
  },
});

// Generate Angebot from Auftrag
export const createAngebotFromAuftrag = mutation({
  args: { auftragId: v.id("auftrags"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx, args.sessionToken);
    const auftrag = await ctx.db.get(args.auftragId);
    if (!auftrag) throw new Error("Auftrag not found");
    if (auftrag.userId !== userId) throw new Error("Zugriff verweigert");

    // Generate angebot number (AN- prefix, shared sequence)
    const year = new Date().getFullYear();
    const existing = await ctx.db
      .query("numberSequences")
      .withIndex("userId_year", (q) => q.eq("userId", auftrag.userId).eq("year", year))
      .first();

    let angebotNumber: string;
    if (existing) {
      const nextNum = existing.nextNumber;
      await ctx.db.patch(existing._id, { nextNumber: nextNum + 1 });
      angebotNumber = `AN-${year}-${String(nextNum).padStart(6, "0")}`;
    } else {
      await ctx.db.insert("numberSequences", {
        userId: auftrag.userId,
        year,
        nextNumber: 2,
        createdAt: Date.now(),
      });
      angebotNumber = `AN-${year}-000001`;
    }

    const now = Date.now();
    const angebotId = await ctx.db.insert("angebots", {
      userId: auftrag.userId,
      number: angebotNumber,
      date: new Date().toLocaleDateString("de-AT"),
      validUntil: undefined,
      deliveryDate: auftrag.deliveryDate,
      recipientName: auftrag.recipientName,
      recipientStreet: auftrag.recipientStreet,
      recipientCity: auftrag.recipientCity,
      recipientUid: auftrag.recipientUid,
      taxMode: auftrag.taxMode,
      taxRate: auftrag.taxRate,
      taxNote: auftrag.taxNote,
      netAmount: auftrag.netAmount,
      vatAmount: auftrag.vatAmount,
      grossAmount: auftrag.grossAmount,
      items: auftrag.items,
      status: "draft",
      auftragId: args.auftragId, // linked back to auftrag
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: auftrag.userId,
      action: "angebot_from_auftrag",
      details: `Angebot ${angebotNumber} from Auftrag ${auftrag.number}`,
      timestamp: now,
    });

    return { angebotId, angebotNumber };
  },
});

// Get full detail: auftrag + angebot + rechnungen + storno
export const getDetail = query({
  args: { auftragId: v.id("auftrags"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx, args.sessionToken);
    const auftrag = await ctx.db.get(args.auftragId);
    if (!auftrag) return null;
    if (auftrag.userId !== userId) throw new Error("Zugriff verweigert");

    // Find linked angebot (by auftragId)
    const angebot = await ctx.db
      .query("angebots")
      .withIndex("userId", (q) => q.eq("userId", auftrag.userId))
      .filter((q) => q.eq(q.field("auftragId"), args.auftragId))
      .first();

    // Find linked rechnungen
    const rechnungIds = auftrag.rechnungIds || [];
    const rechnungen = [];
    for (const rid of rechnungIds) {
      const r = await ctx.db.get(rid);
      if (r) rechnungen.push(r);
    }

    // Find storno rechnungen (rechnungen with stornoOf set)
    const stornos = rechnungen.filter((r) => r.stornoOf || r.stornoNumber);

    return {
      auftrag,
      angebot,
      rechnungen,
      stornos,
    };
  },
});

// Create rechnung from auftrag
export const createRechnungFromAuftrag = mutation({
  args: {
    auftragId: v.id("auftrags"),
    sessionToken: v.string(),
    type: v.string(), // "Rechnung" | "Honorarnote"
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx, args.sessionToken);
    const auftrag = await ctx.db.get(args.auftragId);
    if (!auftrag) throw new Error("Auftrag not found");
    if (auftrag.userId !== userId) throw new Error("Zugriff verweigert");
    if (auftrag.status === "discarded") throw new Error("Auftrag was discarded");

    // Free-plan limit: max 3 Rechnungen pro Monat
    const user = await ctx.db.get(auftrag.userId);
    if (user && user.plan === "free") {
      const monthStart = startOfCurrentMonth();
      const monthInvoices = await ctx.db
        .query("outgoingInvoices")
        .withIndex("userId", (q) => q.eq("userId", auftrag.userId))
        .filter((q) => q.gte(q.field("createdAt"), monthStart))
        .collect();
      if (monthInvoices.length >= FREE_PLAN_MONTHLY_LIMIT) {
        throw new Error(
          "Free-Plan Limit erreicht: 3 Rechnungen pro Monat. Upgrade auf Starter für unbegrenzte Rechnungen."
        );
      }
    }

    // Auto-confirm if still draft (Flow A: direct to rechnung)
    if (auftrag.status === "draft") {
      await ctx.db.patch(args.auftragId, {
        status: "confirmed",
        confirmedDate: new Date().toLocaleDateString("de-AT"),
        updatedAt: Date.now(),
      });
    }

    // Get next rechnung number
    const year = new Date().getFullYear();
    const existing = await ctx.db
      .query("numberSequences")
      .withIndex("userId_year", (q) => q.eq("userId", auftrag.userId).eq("year", year))
      .first();

    let number: string;
    if (existing) {
      const nextNum = existing.nextNumber;
      await ctx.db.patch(existing._id, { nextNumber: nextNum + 1 });
      number = `RE-${year}-${String(nextNum).padStart(6, "0")}`;
    } else {
      await ctx.db.insert("numberSequences", {
        userId: auftrag.userId,
        year,
        nextNumber: 2,
        createdAt: Date.now(),
      });
      number = `RE-${year}-000001`;
    }

    const now = Date.now();
    const rechnungId = await ctx.db.insert("outgoingInvoices", {
      userId: auftrag.userId,
      auftragId: args.auftragId,
      number,
      type: args.type,
      date: new Date().toLocaleDateString("de-AT"),
      deliveryDate: auftrag.deliveryDate,
      periodStart: auftrag.periodStart,
      periodEnd: auftrag.periodEnd,
      customerId: auftrag.customerId,
      recipientName: auftrag.recipientName,
      recipientStreet: auftrag.recipientStreet,
      recipientCity: auftrag.recipientCity,
      recipientUid: auftrag.recipientUid,
      taxMode: auftrag.taxMode,
      taxRate: auftrag.taxRate,
      taxNote: auftrag.taxNote,
      netAmount: auftrag.netAmount,
      vatAmount: auftrag.vatAmount,
      grossAmount: auftrag.grossAmount,
      items: auftrag.items,
      // IMUTABLE: Rechnung ist sofort final beim Generieren.
      // Keine Bearbeitung möglich — nur Storno oder markPaid.
      status: "final",
      lockedAt: now,
      paymentTerms: auftrag.paymentTerms,
      footer: auftrag.footer,
      createdAt: now,
      updatedAt: now,
    });

    // Link rechnung to auftrag
    const currentRechnungIds = auftrag.rechnungIds || [];
    await ctx.db.patch(args.auftragId, {
      rechnungIds: [...currentRechnungIds, rechnungId],
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: auftrag.userId,
      action: "rechnung_from_auftrag",
      details: `${number} from Auftrag ${auftrag.number}`,
      timestamp: now,
    });

    return { rechnungId, number };
  },
});
