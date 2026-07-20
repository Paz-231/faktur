import { query, mutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId } from "./authHelper";

interface TaxBreakdownEntry {
  taxRate: number;
  netAmount: number;
  vatAmount: number;
  grossAmount: number;
}

const lineItemValidator = v.object({
  pos: v.number(),
  description: v.string(),
  qty: v.number(),
  unit: v.string(),
  unitPrice: v.number(),
  total: v.number(),
  taxRate: v.optional(v.number()),
});

function computeTaxBreakdown(items: { total: number; taxRate: number }[]): TaxBreakdownEntry[] {
  const groups: Record<number, { netAmount: number; vatAmount: number; grossAmount: number }> = {};
  for (const item of items) {
    const rate = item.taxRate || 0;
    if (!groups[rate]) groups[rate] = { netAmount: 0, vatAmount: 0, grossAmount: 0 };
    groups[rate].netAmount += item.total;
    const vat = rate > 0 ? (item.total * rate) / 100 : 0;
    groups[rate].vatAmount += vat;
    groups[rate].grossAmount += item.total + vat;
  }
  return Object.entries(groups)
    .map(([rate, amounts]) => ({ taxRate: Number(rate), ...amounts }))
    .sort((a, b) => b.taxRate - a.taxRate);
}

function defaultRateForMode(taxMode: string): number {
  const map: Record<string, number> = {
    kleinunternehmer: 0,
    ust_standard: 20,
    ust_ermaessigt: 10,
    reverse_charge: 0,
    befreit: 0,
  };
  return map[taxMode] ?? 0;
}

async function nextSequenceNumber(
  ctx: MutationCtx,
  userId: Id<"users">,
  year: number,
  prefix: string,
): Promise<string> {
  const existing = await ctx.db
    .query("numberSequences")
    .withIndex("userId_year", (q) => q.eq("userId", userId).eq("year", year))
    .first();
  if (existing) {
    const number = existing.nextNumber;
    await ctx.db.patch(existing._id, { nextNumber: number + 1 });
    return `${prefix}-${year}-${String(number).padStart(6, "0")}`;
  }
  await ctx.db.insert("numberSequences", {
    userId,
    year,
    nextNumber: 2,
    createdAt: Date.now(),
  });
  return `${prefix}-${year}-000001`;
}

const FREE_PLAN_MONTHLY_LIMIT = 3;

function startOfCurrentMonth(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

async function assertWithinMonthlyOrderLimit(ctx: MutationCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (!user || user.plan !== "free") return;
  const rows = await ctx.db
    .query("auftrags")
    .withIndex("userId_createdAt", (q) => q.eq("userId", userId).gte("createdAt", startOfCurrentMonth()))
    .take(FREE_PLAN_MONTHLY_LIMIT);
  if (rows.length >= FREE_PLAN_MONTHLY_LIMIT) {
    throw new Error(
      `Free-Plan Limit erreicht: ${FREE_PLAN_MONTHLY_LIMIT} Aufträge pro Monat. Upgrade auf Starter für unbegrenzte Aufträge.`,
    );
  }
}

async function assertWithinMonthlyInvoiceLimit(ctx: MutationCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (!user || user.plan !== "free") return;
  const rows = await ctx.db
    .query("outgoingInvoices")
    .withIndex("userId_createdAt", (q) => q.eq("userId", userId).gte("createdAt", startOfCurrentMonth()))
    .take(FREE_PLAN_MONTHLY_LIMIT);
  if (rows.length >= FREE_PLAN_MONTHLY_LIMIT) {
    throw new Error(
      `Free-Plan Limit erreicht: ${FREE_PLAN_MONTHLY_LIMIT} Rechnungen pro Monat. Upgrade auf Starter für unbegrenzte Rechnungen.`,
    );
  }
}

export const list = query({
  args: { userId: v.id("users"), sessionToken: v.string() },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx, args.sessionToken);
    return await ctx.db
      .query("auftrags")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(100);
  },
});

export const get = query({
  args: { auftragId: v.id("auftrags"), sessionToken: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx, args.sessionToken);
    const auftrag = await ctx.db.get(args.auftragId);
    if (!auftrag) return null;
    if (auftrag.userId !== userId) throw new Error("Zugriff verweigert");
    return auftrag;
  },
});

export const getNextNumber = mutation({
  args: { userId: v.id("users"), sessionToken: v.string(), year: v.number() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx, args.sessionToken);
    if (args.userId !== userId) throw new Error("Zugriff verweigert");
    return await nextSequenceNumber(ctx, userId, args.year, "AU");
  },
});

export const create = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    number: v.optional(v.string()),
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
    items: v.array(lineItemValidator),
    paymentTerms: v.string(),
    footer: v.optional(v.string()),
    angebotId: v.optional(v.id("angebots")),
  },
  returns: v.id("auftrags"),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx, args.sessionToken);
    if (args.userId !== userId) throw new Error("Zugriff verweigert");
    await assertWithinMonthlyOrderLimit(ctx, userId);

    if (args.customerId) {
      const customer = await ctx.db.get(args.customerId);
      if (!customer || customer.userId !== userId) throw new Error("Kunde nicht gefunden");
    }

    const now = Date.now();
    const number = args.number ?? (await nextSequenceNumber(ctx, userId, new Date().getFullYear(), "AU"));
    const defaultRate = defaultRateForMode(args.taxMode);
    const items = args.items.map((item, index) => ({
      ...item,
      pos: index + 1,
      total: item.qty * item.unitPrice,
      taxRate: item.taxRate ?? defaultRate,
    }));
    const taxBreakdown = computeTaxBreakdown(items as { total: number; taxRate: number }[]);
    let netAmount = 0;
    let vatAmount = 0;
    for (const item of items) {
      netAmount += item.total;
      const rate = item.taxRate || 0;
      if (rate > 0) vatAmount += (item.total * rate) / 100;
    }
    const grossAmount = netAmount + vatAmount;
    const { sessionToken: _sessionToken, userId: _clientUserId, ...rest } = args;
    const auftragId = await ctx.db.insert("auftrags", {
      ...rest,
      userId,
      number,
      items,
      taxBreakdown,
      netAmount,
      vatAmount,
      grossAmount,
      status: "draft",
      rechnungIds: [],
      createdAt: now,
      updatedAt: now,
    });

    if (args.angebotId) {
      const angebot = await ctx.db.get(args.angebotId);
      if (!angebot || angebot.userId !== userId) throw new Error("Angebot nicht gefunden");
      await ctx.db.patch(args.angebotId, {
        auftragId,
        status: "confirmed",
        confirmedDate: args.date,
      });
    }

    await ctx.db.insert("auditLog", {
      userId,
      action: "auftrag_created",
      details: `Auftrag ${number} — €${grossAmount.toFixed(2)}`,
      timestamp: now,
    });
    return auftragId;
  },
});

export const confirm = mutation({
  args: { auftragId: v.id("auftrags"), sessionToken: v.string() },
  returns: v.null(),
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
      userId,
      action: "auftrag_confirmed",
      details: `Auftrag ${auftrag.number} confirmed`,
      timestamp: Date.now(),
    });
    return null;
  },
});

export const discard = mutation({
  args: { auftragId: v.id("auftrags"), sessionToken: v.string() },
  returns: v.null(),
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
      userId,
      action: "auftrag_discarded",
      details: `Auftrag ${auftrag.number} discarded`,
      timestamp: Date.now(),
    });
    return null;
  },
});

export const reactivate = mutation({
  args: { auftragId: v.id("auftrags"), sessionToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx, args.sessionToken);
    const auftrag = await ctx.db.get(args.auftragId);
    if (!auftrag) throw new Error("Auftrag not found");
    if (auftrag.userId !== userId) throw new Error("Zugriff verweigert");
    if (auftrag.status !== "discarded") throw new Error("Nur verworfene Aufträge können reaktiviert werden");
    await ctx.db.patch(args.auftragId, {
      status: "draft",
      discardedDate: undefined,
      updatedAt: Date.now(),
    });
    await ctx.db.insert("auditLog", {
      userId,
      action: "auftrag_reactivated",
      details: `Auftrag ${auftrag.number} reaktiviert`,
      timestamp: Date.now(),
    });
    return null;
  },
});

export const unconfirm = mutation({
  args: { auftragId: v.id("auftrags"), sessionToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx, args.sessionToken);
    const auftrag = await ctx.db.get(args.auftragId);
    if (!auftrag) throw new Error("Auftrag not found");
    if (auftrag.userId !== userId) throw new Error("Zugriff verweigert");
    if (auftrag.status !== "confirmed") throw new Error("Auftrag ist nicht bestätigt");
    if ((auftrag.rechnungIds || []).length > 0) {
      throw new Error("Auftrag kann nicht zurückgesetzt werden — bereits Rechnungen generiert");
    }
    await ctx.db.patch(args.auftragId, {
      status: "draft",
      confirmedDate: undefined,
      sentDate: undefined,
      updatedAt: Date.now(),
    });
    await ctx.db.insert("auditLog", {
      userId,
      action: "auftrag_unconfirmed",
      details: `Auftrag ${auftrag.number} zurückgesetzt auf Entwurf`,
      timestamp: Date.now(),
    });
    return null;
  },
});

export const deleteAuftrag = mutation({
  args: { auftragId: v.id("auftrags"), sessionToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx, args.sessionToken);
    const auftrag = await ctx.db.get(args.auftragId);
    if (!auftrag) throw new Error("Auftrag not found");
    if (auftrag.userId !== userId) throw new Error("Zugriff verweigert");
    if ((auftrag.rechnungIds || []).length > 0) {
      throw new Error("Auftrag kann nicht gelöscht werden — bereits Rechnungen generiert");
    }
    const angebot = await ctx.db
      .query("angebots")
      .withIndex("auftragId", (q) => q.eq("auftragId", args.auftragId))
      .first();
    if (angebot) await ctx.db.delete(angebot._id);
    await ctx.db.delete(args.auftragId);
    await ctx.db.insert("auditLog", {
      userId,
      action: "auftrag_deleted",
      details: `Auftrag ${auftrag.number} gelöscht`,
      timestamp: Date.now(),
    });
    return null;
  },
});

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
    items: v.optional(v.array(lineItemValidator)),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx, args.sessionToken);
    const auftrag = await ctx.db.get(args.auftragId);
    if (!auftrag) throw new Error("Auftrag not found");
    if (auftrag.userId !== userId) throw new Error("Zugriff verweigert");
    if (auftrag.status !== "draft") throw new Error("Auftrag kann nur im Entwurf-Status bearbeitet werden");
    const { sessionToken: _sessionToken, auftragId, ...updates } = args;
    await ctx.db.patch(auftragId, { ...updates, updatedAt: Date.now() });
    await ctx.db.insert("auditLog", {
      userId,
      action: "auftrag_updated",
      details: `Auftrag ${auftrag.number} bearbeitet`,
      timestamp: Date.now(),
    });
    return null;
  },
});

export const createAngebotFromAuftrag = mutation({
  args: { auftragId: v.id("auftrags"), sessionToken: v.string() },
  returns: v.object({ angebotId: v.id("angebots"), angebotNumber: v.string() }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx, args.sessionToken);
    const auftrag = await ctx.db.get(args.auftragId);
    if (!auftrag) throw new Error("Auftrag not found");
    if (auftrag.userId !== userId) throw new Error("Zugriff verweigert");
    const year = new Date().getFullYear();
    const angebotNumber = await nextSequenceNumber(ctx, userId, year, "AN");
    const now = Date.now();
    const angebotId = await ctx.db.insert("angebots", {
      userId,
      number: angebotNumber,
      date: new Date().toLocaleDateString("de-AT"),
      deliveryDate: auftrag.deliveryDate,
      recipientName: auftrag.recipientName,
      recipientStreet: auftrag.recipientStreet,
      recipientCity: auftrag.recipientCity,
      recipientUid: auftrag.recipientUid,
      taxMode: auftrag.taxMode,
      taxRate: auftrag.taxRate,
      taxNote: auftrag.taxNote,
      taxBreakdown: auftrag.taxBreakdown,
      netAmount: auftrag.netAmount,
      vatAmount: auftrag.vatAmount,
      grossAmount: auftrag.grossAmount,
      items: auftrag.items,
      status: "draft",
      auftragId: args.auftragId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLog", {
      userId,
      action: "angebot_from_auftrag",
      details: `Angebot ${angebotNumber} from Auftrag ${auftrag.number}`,
      timestamp: now,
    });
    return { angebotId, angebotNumber };
  },
});

export const getDetail = query({
  args: { auftragId: v.id("auftrags"), sessionToken: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx, args.sessionToken);
    const auftrag = await ctx.db.get(args.auftragId);
    if (!auftrag) return null;
    if (auftrag.userId !== userId) throw new Error("Zugriff verweigert");
    const angebot = await ctx.db
      .query("angebots")
      .withIndex("auftragId", (q) => q.eq("auftragId", args.auftragId))
      .first();
    const rechnungen = [];
    for (const invoiceId of auftrag.rechnungIds || []) {
      const invoice = await ctx.db.get(invoiceId);
      if (invoice) rechnungen.push(invoice);
    }
    const stornos = rechnungen.filter((invoice) => invoice.stornoOf || invoice.stornoNumber);
    return { auftrag, angebot, rechnungen, stornos };
  },
});

export const createRechnungFromAuftrag = mutation({
  args: {
    auftragId: v.id("auftrags"),
    sessionToken: v.string(),
    type: v.string(),
  },
  returns: v.object({ rechnungId: v.id("outgoingInvoices"), number: v.string() }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx, args.sessionToken);
    const auftrag = await ctx.db.get(args.auftragId);
    if (!auftrag) throw new Error("Auftrag not found");
    if (auftrag.userId !== userId) throw new Error("Zugriff verweigert");
    if (auftrag.status === "discarded") throw new Error("Auftrag was discarded");
    await assertWithinMonthlyInvoiceLimit(ctx, userId);
    if (auftrag.status === "draft") {
      await ctx.db.patch(args.auftragId, {
        status: "confirmed",
        confirmedDate: new Date().toLocaleDateString("de-AT"),
        updatedAt: Date.now(),
      });
    }
    const year = new Date().getFullYear();
    const number = await nextSequenceNumber(ctx, userId, year, "RE");
    const now = Date.now();
    const rechnungId = await ctx.db.insert("outgoingInvoices", {
      userId,
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
      taxBreakdown: auftrag.taxBreakdown,
      netAmount: auftrag.netAmount,
      vatAmount: auftrag.vatAmount,
      grossAmount: auftrag.grossAmount,
      items: auftrag.items,
      status: "final",
      lockedAt: now,
      paymentTerms: auftrag.paymentTerms,
      footer: auftrag.footer,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(args.auftragId, {
      rechnungIds: [...(auftrag.rechnungIds || []), rechnungId],
      updatedAt: now,
    });
    await ctx.db.insert("auditLog", {
      userId,
      action: "rechnung_from_auftrag",
      details: `${number} from Auftrag ${auftrag.number}`,
      timestamp: now,
    });
    return { rechnungId, number };
  },
});
