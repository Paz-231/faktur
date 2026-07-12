import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const createToken = internalMutation({
  args: {
    email: v.string(),
    token: v.string(),
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("skillDownloads", {
      email: args.email,
      token: args.token,
      sessionId: args.sessionId,
      createdAt: Date.now(),
    });
  },
});

export const getByToken = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("skillDownloads")
      .withIndex("token", (q) => q.eq("token", args.token))
      .first();
  },
});

export const markDownloaded = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const entry = await ctx.db
      .query("skillDownloads")
      .withIndex("token", (q) => q.eq("token", args.token))
      .first();
    if (entry) {
      await ctx.db.patch(entry._id, { downloadedAt: Date.now() });
    }
  },
});
