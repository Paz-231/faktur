import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { getAuthUserId } from "./authHelper";

const lineItemValidator = v.object({
  pos: v.number(),
  description: v.string(),
  qty: v.number(),
  unit: v.string(),
  unitPrice: v.number(),
  total: v.number(),
  taxRate: v.optional(v.number()),
});

const defaultTaxRates: Record<string, number> = {
  kleinunternehmer: 0,
  ust_standard: 20,
  ust_ermaessigt: 10,
  reverse_charge: 0,
  befreit: 0,
};

export const updateTemplateContent = mutation({
  args: {
    sessionToken: v.string(),
    templateId: v.id("recurringOrderTemplates"),
    title: v.string(),
    customerId: v.optional(v.id("customers")),
    recipientName: v.string(),
    recipientStreet: v.string(),
    recipientCity: v.string(),
    recipientUid: v.optional(v.string()),
    taxMode: v.string(),
    taxRate: v.number(),
    taxNote: v.optional(v.string()),
    items: v.array(lineItemValidator),
    paymentTerms: v.string(),
    footer: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx, args.sessionToken);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Benutzer nicht gefunden");
    if (user.plan === "free") {
      throw new Error("Wiederkehrende Aufträge sind im Starter- und Pro-Plan verfügbar");
    }

    const template = await ctx.db.get(args.templateId);
    if (!template || template.userId !== userId) throw new Error("Serie nicht gefunden");
    if (template.status === "completed") {
      throw new Error("Beendete Serien können nicht mehr bearbeitet werden");
    }

    if (args.customerId) {
      const customer = await ctx.db.get(args.customerId);
      if (!customer || customer.userId !== userId) throw new Error("Kunde nicht gefunden");
    }

    const title = args.title.trim();
    const recipientName = args.recipientName.trim();
    const recipientStreet = args.recipientStreet.trim();
    const recipientCity = args.recipientCity.trim();
    if (!title) throw new Error("Titel ist erforderlich");
    if (!recipientName || !recipientStreet || !recipientCity) {
      throw new Error("Empfängerdaten sind unvollständig");
    }
    if (args.items.length === 0) throw new Error("Mindestens eine Position ist erforderlich");

    const fallbackTaxRate = defaultTaxRates[args.taxMode] ?? args.taxRate;
    const items = args.items.map((item, index) => {
      const description = item.description.trim();
      if (!description || item.qty <= 0 || item.unitPrice <= 0) {
        throw new Error(`Position ${index + 1} ist unvollständig`);
      }
      return {
        pos: index + 1,
        description,
        qty: item.qty,
        unit: item.unit,
        unitPrice: item.unitPrice,
        total: item.qty * item.unitPrice,
        taxRate: item.taxRate ?? fallbackTaxRate,
      };
    });

    const now = Date.now();
    await ctx.db.patch(template._id, {
      title,
      customerId: args.customerId,
      recipientName,
      recipientStreet,
      recipientCity,
      recipientUid: args.recipientUid?.trim() || undefined,
      taxMode: args.taxMode,
      taxRate: args.taxRate,
      taxNote: args.taxNote?.trim() || undefined,
      items,
      paymentTerms: args.paymentTerms.trim(),
      footer: args.footer?.trim() || undefined,
      errorMessage: undefined,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId,
      action: "recurring_order_updated",
      details: `${title} — Änderungen gelten für zukünftige Aufträge`,
      timestamp: now,
    });

    return null;
  },
});
