import { v } from "convex/values";
import { query } from "./_generated/server";
import { getAuthUserId } from "./authHelper";
import { canUseRecurringOrders, recurringPlanError } from "../shared/planAccess";

export const getAccess = query({
  args: { sessionToken: v.string() },
  returns: v.object({
    allowed: v.boolean(),
    plan: v.string(),
    planStatus: v.string(),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx, args.sessionToken);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Benutzer nicht gefunden");
    const allowed = canUseRecurringOrders(user);
    return {
      allowed,
      plan: user.plan,
      planStatus: user.planStatus,
      ...(allowed ? {} : { reason: recurringPlanError(user) }),
    };
  },
});
