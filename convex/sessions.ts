import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// ═══════════════════════════════════════════════════════════
// Session API — Server-side Session-Validierung
// ═══════════════════════════════════════════════════════════

// Create session after magic-link verification
export const createSession = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    // Generate secure session token
    const token = generateToken();
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days

    const sessionId = await ctx.db.insert("sessions", {
      userId: args.userId,
      token,
      expiresAt,
      createdAt: Date.now(),
    });

    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "session_created",
      details: "New session created",
      timestamp: Date.now(),
    });

    return { token, sessionId, expiresAt };
  },
});

// Validate session token — returns userId if valid
export const validateSession = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("token", (q) => q.eq("token", args.token))
      .first();

    if (!session) return null;

    // Check expiry
    if (Date.now() > session.expiresAt) return null;

    // Get user
    const user = await ctx.db.get(session.userId);
    if (!user) return null;

    return {
      userId: session.userId,
      email: user.email,
      name: user.name,
      plan: user.plan,
    };
  },
});

// Destroy session (logout)
export const destroySession = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("token", (q) => q.eq("token", args.token))
      .first();

    if (session) {
      await ctx.db.delete(session._id);
    }
  },
});

// Helper: generate secure random token
function generateToken(): string {
  const array = new Uint8Array(48);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, "0")).join("");
}
