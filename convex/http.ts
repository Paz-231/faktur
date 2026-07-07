import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { stripeWebhook } from "./stripe";
import { createSkillCheckout, skillWebhook, verifyDownload } from "./skillDownload";
import { downloadSkill, getDownloadInfo } from "./skillVersions";
import { exportAllData } from "./backup";
import { triggerBackup } from "./backupCron";

// ═══════════════════════════════════════════════════════════
// HTTP Router — alle öffentlichen Endpoints
// Erreichbar unter https://<deployment>.convex.site/<path>
// ═══════════════════════════════════════════════════════════

const http = httpRouter();

// CORS preflight for browser POST requests (JSON content-type triggers preflight)
const corsPreflight = httpAction(async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
});

// Stripe webhooks
http.route({ path: "/stripeWebhook", method: "POST", handler: stripeWebhook });
http.route({ path: "/skillWebhook", method: "POST", handler: skillWebhook });

// Skill purchase + download
http.route({ path: "/createSkillCheckout", method: "POST", handler: createSkillCheckout });
http.route({ path: "/createSkillCheckout", method: "OPTIONS", handler: corsPreflight });
http.route({ path: "/verifyDownload", method: "GET", handler: verifyDownload });
http.route({ path: "/downloadSkill", method: "GET", handler: downloadSkill });
http.route({ path: "/getDownloadInfo", method: "GET", handler: getDownloadInfo });

// Data export + backup
http.route({ path: "/exportAllData", method: "GET", handler: exportAllData });
http.route({ path: "/triggerBackup", method: "GET", handler: triggerBackup });

export default http;
