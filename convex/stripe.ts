import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

// ═══════════════════════════════════════════════════════════
// Stripe Webhook Handler — Convex HTTP Action
// ═══════════════════════════════════════════════════════════
//
// Stripe sendet webhooks hierher bei:
// - checkout.session.completed → User hat abonniert
// - customer.subscription.updated → Plan geändert
// - customer.subscription.deleted → Abo gekündigt
//
// Setup:
// 1. Stripe Webhook Endpoint: https://<deployment>.convex.site/stripeWebhook
// 2. Events: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted
// 3. Copy signing secret → STRIPE_WEBHOOK_SECRET env var

// Verify a Stripe webhook signature (v1 scheme, HMAC-SHA256 via Web Crypto —
// the Convex runtime has no Node crypto, so we don't use the Stripe SDK here)
export async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string,
  toleranceSeconds = 300
): Promise<boolean> {
  const parts = new Map<string, string[]>();
  for (const kv of sigHeader.split(",")) {
    const [k, val] = kv.split("=", 2);
    if (!k || !val) continue;
    const list = parts.get(k.trim()) || [];
    list.push(val.trim());
    parts.set(k.trim(), list);
  }

  const timestamp = parts.get("t")?.[0];
  const signatures = parts.get("v1") || [];
  if (!timestamp || signatures.length === 0) return false;

  // Reject stale events (replay protection)
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${payload}`));
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time-ish comparison
  return signatures.some((sig) => {
    if (sig.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) {
      diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    return diff === 0;
  });
}

export const stripeWebhook = httpAction(async (ctx, request) => {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature") || "";

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return new Response(JSON.stringify({ error: "Stripe not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Verify webhook signature
  const valid = await verifyStripeSignature(body, signature, webhookSecret);
  if (!valid) {
    console.error("Webhook signature verification failed");
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const event = JSON.parse(body);

  // Handle events
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;

      // Skill purchases are handled by the skill webhook logic
      if (session.metadata?.product === "faktox-invoice-agent-skill") break;

      const customerId = session.customer as string;
      const subscriptionId = session.subscription as string;
      const customerEmail = session.customer_details?.email || session.customer_email || "";
      const metadata = session.metadata || {};

      // Find user by email
      const user = await ctx.runQuery(api.auth.getUserByEmail, { email: customerEmail });
      if (!user) {
        console.error("User not found for email:", customerEmail);
        break;
      }

      // Determine plan from metadata
      const plan = metadata.plan || "starter";
      await ctx.runMutation(api.auth.updateSubscription, {
        userId: user._id,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        plan,
        planStatus: "active",
      });

      console.log(`Subscription activated: ${customerEmail} → ${plan}`);
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object;
      const customerId = subscription.customer as string;
      const status = subscription.status;
      const priceId = subscription.items?.data?.[0]?.price?.id;

      // Determine plan from price ID
      const plan = priceIdToPlan(priceId);

      // Find user by Stripe customer ID
      const user = await ctx.runQuery(api.auth.getUserByStripeCustomer, { customerId });
      if (user) {
        await ctx.runMutation(api.auth.updateSubscription, {
          userId: user._id,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          plan,
          planStatus: status === "active" ? "active" : status,
        });
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const customerId = subscription.customer as string;

      const user = await ctx.runQuery(api.auth.getUserByStripeCustomer, { customerId });
      if (user) {
        await ctx.runMutation(api.auth.updateSubscription, {
          userId: user._id,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          plan: "free",
          planStatus: "canceled",
        });
      }
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

// ─── Helpers ────────────────────────────────────────────────

function priceIdToPlan(priceId: string | undefined): string {
  if (!priceId) return "free";
  // These will be set by the setup script
  const starterPriceId = process.env.STRIPE_PRICE_STARTER;
  const proPriceId = process.env.STRIPE_PRICE_PRO;
  if (priceId === proPriceId) return "pro";
  if (priceId === starterPriceId) return "starter";
  return "free";
}
