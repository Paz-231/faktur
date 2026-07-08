import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// ═══════════════════════════════════════════════════════════
// Invoices API — Ausgangsrechnungen
// ═══════════════════════════════════════════════════════════

// List all outgoing invoices for a user
export const list = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("outgoingInvoices")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();
  },
});

// Get single invoice
export const get = query({
  args: { invoiceId: v.id("outgoingInvoices") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.invoiceId);
  },
});

// Create new invoice (from auftrag — auftragId required)
export const create = mutation({
  args: {
    userId: v.id("users"),
    auftragId: v.id("auftrags"),
    number: v.string(),
    type: v.string(),
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
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const invoiceId = await ctx.db.insert("outgoingInvoices", {
      ...args,
      status: "final",
      lockedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // Audit log
    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "invoice_created",
      details: `${args.type} ${args.number} — €${args.grossAmount.toFixed(2)}`,
      timestamp: now,
    });

    return invoiceId;
  },
});

// Mark invoice as paid — only allowed when status is "final"
export const markPaid = mutation({
  args: {
    invoiceId: v.id("outgoingInvoices"),
    paidDate: v.string(),
  },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) throw new Error("Rechnung nicht gefunden");

    // Guard: only final invoices can be marked as paid
    if (invoice.status !== "final") {
      throw new Error(`Rechnung kann nicht als bezahlt markiert werden (Status: ${invoice.status})`);
    }

    await ctx.db.patch(args.invoiceId, {
      status: "paid",
      paidDate: args.paidDate,
      updatedAt: Date.now(),
    });

    await ctx.db.insert("auditLog", {
      userId: invoice.userId,
      action: "invoice_paid",
      details: `${invoice.number} — paid on ${args.paidDate}`,
      timestamp: Date.now(),
    });
  },
});

// Storno an invoice — only allowed when status is "final" or "paid"
export const storno = mutation({
  args: {
    invoiceId: v.id("outgoingInvoices"),
  },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) throw new Error("Rechnung nicht gefunden");

    // Guard: only final or paid invoices can be storniert
    if (invoice.status !== "final" && invoice.status !== "paid") {
      throw new Error(`Rechnung kann nicht storniert werden (Status: ${invoice.status})`);
    }
    if (invoice.stornoOf) throw new Error("Storno-Rechnung kann nicht storniert werden");

    // Generate storno number (ST- prefix, same sequence as invoices)
    const year = new Date().getFullYear();
    const existing = await ctx.db
      .query("numberSequences")
      .withIndex("userId_year", (q) => q.eq("userId", invoice.userId).eq("year", year))
      .first();

    let stornoNumber: string;
    if (existing) {
      const nextNum = existing.nextNumber;
      await ctx.db.patch(existing._id, { nextNumber: nextNum + 1 });
      stornoNumber = `ST-${year}-${String(nextNum).padStart(6, "0")}`;
    } else {
      await ctx.db.insert("numberSequences", {
        userId: invoice.userId,
        year,
        nextNumber: 2,
        createdAt: Date.now(),
      });
      stornoNumber = `ST-${year}-000001`;
    }

    // Mark original as storno
    await ctx.db.patch(args.invoiceId, {
      status: "storno",
      stornoNumber,
      updatedAt: Date.now(),
    });

    // Create storno invoice (also immediately final/immutable)
    const now = Date.now();
    await ctx.db.insert("outgoingInvoices", {
      ...invoice,
      number: stornoNumber,
      type: "Storno",
      status: "final",
      lockedAt: now,
      stornoOf: invoice.number,
      stornoNumber: undefined,
      paidDate: undefined,
      createdAt: now,
      updatedAt: now,
    });

    // Audit log
    await ctx.db.insert("auditLog", {
      userId: invoice.userId,
      action: "invoice_storno",
      details: `${invoice.number} → ${stornoNumber}`,
      timestamp: now,
    });
  },
});

// Get next invoice number for a year
export const getNextNumber = mutation({
  args: { userId: v.id("users"), year: v.number() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("numberSequences")
      .withIndex("userId_year", (q) => q.eq("userId", args.userId).eq("year", args.year))
      .first();

    if (existing) {
      const nextNum = existing.nextNumber;
      await ctx.db.patch(existing._id, { nextNumber: nextNum + 1 });
      return `RE-${args.year}-${String(nextNum).padStart(6, "0")}`;
    } else {
      await ctx.db.insert("numberSequences", {
        userId: args.userId,
        year: args.year,
        nextNumber: 2,
        createdAt: Date.now(),
      });
      return `RE-${args.year}-000001`;
    }
  },
});
