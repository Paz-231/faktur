import { QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";

// ═══════════════════════════════════════════════════════════
// Auth Helper — Server-side Session-Validierung
// Alle Queries/Mutations MUSSEN diesen Helper nutzen statt
// args.userId vom Client zu vertrauen.
// ═══════════════════════════════════════════════════════════

/**
 * Validiert einen Session-Token server-side und gibt die userId zurueck.
 * Wirft einen Error wenn der Token ungueltig oder abgelaufen ist.
 *
 * Usage in mutations:
 *   const userId = await getAuthUserId(ctx, args.sessionToken);
 *
 * Usage in queries:
 *   const userId = await getAuthUserId(ctx, args.sessionToken);
 */
export async function getAuthUserId(
  ctx: QueryCtx | MutationCtx,
  sessionToken: string
): Promise<any> {
  if (!sessionToken) {
    throw new Error("Nicht authentifiziert — kein Session-Token");
  }

  const session = await ctx.db
    .query("sessions")
    .withIndex("token", (q) => q.eq("token", sessionToken))
    .first();

  if (!session) {
    throw new Error("Sitzung ungültig — bitte erneut einloggen");
  }

  if (Date.now() > session.expiresAt) {
    throw new Error("Sitzung abgelaufen — bitte erneut einloggen");
  }

  // Verify user still exists
  const user = await ctx.db.get(session.userId);
  if (!user) {
    throw new Error("Benutzer nicht gefunden");
  }

  return session.userId;
}

/**
 * Same as getAuthUserId but also returns the user document.
 */
export async function getAuthUser(
  ctx: QueryCtx | MutationCtx,
  sessionToken: string
) {
  if (!sessionToken) {
    throw new Error("Nicht authentifiziert — kein Session-Token");
  }

  const session = await ctx.db
    .query("sessions")
    .withIndex("token", (q) => q.eq("token", sessionToken))
    .first();

  if (!session) {
    throw new Error("Sitzung ungültig — bitte erneut einloggen");
  }

  if (Date.now() > session.expiresAt) {
    throw new Error("Sitzung abgelaufen — bitte erneut einloggen");
  }

  const user = await ctx.db.get(session.userId);
  if (!user) {
    throw new Error("Benutzer nicht gefunden");
  }

  return user;
}

/**
 * Validator for sessionToken argument.
 */
export const sessionTokenArg = v.string();
