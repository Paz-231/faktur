import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// ═══════════════════════════════════════════════════════════
// Waitlist API — Email-Capture für Landing Page
// ═══════════════════════════════════════════════════════════

export const join = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    // Check if email already exists
    const existing = await ctx.db
      .query("waitlist")
      .withIndex("email", (q) => q.eq("email", args.email))
      .first();

    if (existing) {
      return { success: true, message: "already_registered" };
    }

    await ctx.db.insert("waitlist", {
      email: args.email,
      createdAt: Date.now(),
    });

    return { success: true, message: "added" };
  },
});

export const count = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("waitlist").take(10000);
    return all.length;
  },
});
