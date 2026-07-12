import { internalMutation } from "./_generated/server";

// ═══════════════════════════════════════════════════════════
// Session-Wartung
//
// Login/Validierung/Logout leben vollständig in auth.ts
// (completeLogin / validateSession / destroySession).
// Das frühere öffentliche createSession({ userId }) war eine
// Account-Übernahme-Lücke und wurde entfernt.
// ═══════════════════════════════════════════════════════════

// Abgelaufene Sessions löschen — Cron alle 6 Stunden
export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("sessions")
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .take(500);

    for (const session of expired) {
      await ctx.db.delete(session._id);
    }

    console.log(`[Session Cleanup] Deleted ${expired.length} expired sessions`);
    return { deleted: expired.length };
  },
});
