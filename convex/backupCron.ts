import { httpAction, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";

// ═══════════════════════════════════════════════════════════
// Internal Backup Action — called by Convex's own cron system
// No ADMIN_KEY needed, no HTTP endpoint, fully internal.
// ═══════════════════════════════════════════════════════════

export const runDailyBackup = internalAction({
  args: {},
  handler: async (ctx): Promise<{
    success: boolean;
    backed: number;
    failed: number;
    totalUsers: number;
    timestamp: string;
  }> => {
    // Hole alle User
    const users = await ctx.runQuery(internal.backup.getAllUsers, {});

    let backed = 0;
    let failed = 0;

    for (const user of users) {
      try {
        // Sammle alle Daten für diesen User
        const [
          customers,
          auftrags,
          angebots,
          invoices,
          incomingInvoices,
          dunningLetters,
          numberSequences,
          settings,
          profile,
          auditLog,
        ] = await Promise.all([
          ctx.runQuery(internal.backup.getUsersCustomers, { userId: user._id }),
          ctx.runQuery(internal.backup.getUsersAuftrags, { userId: user._id }),
          ctx.runQuery(internal.backup.getUserAngebots, { userId: user._id }),
          ctx.runQuery(internal.backup.getUserInvoices, { userId: user._id }),
          ctx.runQuery(internal.backup.getUsersIncoming, { userId: user._id }),
          ctx.runQuery(internal.backup.getUserDunningLetters, { userId: user._id }),
          ctx.runQuery(internal.backup.getUserNumberSequences, { userId: user._id }),
          ctx.runQuery(internal.backup.getUsersSettings, { userId: user._id }),
          ctx.runQuery(internal.backup.getUsersProfile, { userId: user._id }),
          ctx.runQuery(internal.backup.getUserAuditLog, { userId: user._id }),
        ]);

        const backup = {
          metadata: {
            version: "1.0",
            exportedAt: new Date().toISOString(),
            email: user.email,
            userId: user._id,
            totalRecords:
              (customers as any[]).length + (auftrags as any[]).length + (angebots as any[]).length +
              (invoices as any[]).length + (incomingInvoices as any[]).length + (dunningLetters as any[]).length,
          },
          customers, auftrags, angebots, invoices, incomingInvoices,
          dunningLetters, numberSequences, settings, profile, auditLog,
        };

        const json = JSON.stringify(backup, null, 2);
        const fileName = `backup-${user.email}-${new Date().toISOString().split("T")[0]}.json`;

        // Store as file in Convex Storage
        const uploadUrl = await ctx.storage.generateUploadUrl();
        const uploadResp = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: json,
        });

        const storageResult = await uploadResp.json();
        const storageId = storageResult.storageId || storageResult._id;

        await ctx.runMutation(internal.backup.saveBackupRecord, {
          userId: user._id,
          storageId,
          fileName,
          sizeBytes: json.length,
          recordCount: backup.metadata.totalRecords,
          type: "auto",
        });

        backed++;
      } catch (err) {
        failed++;
      }
    }

    return {
      success: true,
      backed,
      failed,
      totalUsers: users.length,
      timestamp: new Date().toISOString(),
    };
  },
});

// ═══════════════════════════════════════════════════════════
// HTTP Action — kept for manual triggering if needed
// (optional, can be removed if not used)
// ═══════════════════════════════════════════════════════════

export const triggerBackup = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const adminKey = url.searchParams.get("key");

  if (adminKey !== process.env.ADMIN_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Run the same internal action
  const result = await ctx.runAction(internal.backupCron.runDailyBackup, {});
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
