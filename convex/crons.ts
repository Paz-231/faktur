import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

// ═══════════════════════════════════════════════════════════
// Convex Internal Cron — automated maintenance tasks
// ═══════════════════════════════════════════════════════════

const crons = cronJobs();

// Daily backup at 03:00 UTC (= 05:00 CET summer)
crons.daily(
  "faktox-daily-backup",
  { hourUTC: 3, minuteUTC: 0 },
  internal.backupCron.runDailyBackup,
);

// Session cleanup: delete expired sessions every 6 hours
crons.interval(
  "faktox-session-cleanup",
  { hours: 6 },
  internal.sessions.cleanupExpired,
);

export default crons;
