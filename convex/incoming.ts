import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "./authHelper";

// ═══════════════════════════════════════════════════════════
// Incoming Invoices API — Eingangsrechnungen
// ═══════════════════════════════════════════════════════════

export const list = query({
  args: { userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx, args.sessionToken);
    return await ctx.db
      .query("incomingInvoices")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(100);
  },
});

export const create = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    number: v.string(),
    date: v.string(),
    deliveryDate: v.optional(v.string()),
    issuerName: v.string(),
    issuerStreet: v.optional(v.string()),
    issuerCity: v.optional(v.string()),
    issuerUid: v.optional(v.string()),
    taxRate: v.number(),
    netAmount: v.number(),
    vatAmount: v.number(),
    grossAmount: v.number(),
    category: v.optional(v.string()),
    description: v.optional(v.string()),
    paymentTerms: v.optional(v.string()),
    iban: v.optional(v.string()),
    bic: v.optional(v.string()),
    fileStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx, args.sessionToken);
    const { sessionToken, ...rest } = args;
    const now = Date.now();
    const id = await ctx.db.insert("incomingInvoices", {
      ...rest,
      userId,
      status: "open",
      createdAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId,
      action: "incoming_created",
      details: `${args.issuerName} ${args.number} — €${args.grossAmount.toFixed(2)}`,
      timestamp: now,
    });

    return id;
  },
});

export const markPaid = mutation({
  args: {
    invoiceId: v.id("incomingInvoices"),
    sessionToken: v.string(),
    paidDate: v.string(),
    paidAmount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx, args.sessionToken);
    const inv = await ctx.db.get(args.invoiceId);
    if (!inv) throw new Error("Invoice not found");
    if (inv.userId !== userId) throw new Error("Zugriff verweigert");

    await ctx.db.patch(args.invoiceId, {
      status: "paid",
      paidDate: args.paidDate,
      paidAmount: args.paidAmount ?? inv.grossAmount,
    });

    await ctx.db.insert("auditLog", {
      userId: inv.userId,
      action: "incoming_paid",
      details: `${inv.number} — paid on ${args.paidDate}`,
      timestamp: Date.now(),
    });
  },
});

// Summary for dashboard
export const summary = query({
  args: { userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx, args.sessionToken);
    const all = await ctx.db
      .query("incomingInvoices")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect();

    const open = all.filter((i) => i.status === "open");
    const paid = all.filter((i) => i.status === "paid");

    return {
      total: all.length,
      openCount: open.length,
      openAmount: open.reduce((sum, i) => sum + i.grossAmount, 0),
      paidCount: paid.length,
      paidAmount: paid.reduce((sum, i) => sum + i.grossAmount, 0),
      totalGross: all.reduce((sum, i) => sum + i.grossAmount, 0),
      totalNet: all.reduce((sum, i) => sum + i.netAmount, 0),
      totalVat: all.reduce((sum, i) => sum + i.vatAmount, 0),
    };
  },
});
