import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { verifyStripeSignature } from "./stripe";

// ═══════════════════════════════════════════════════════════
// Skill Download API — 99€ einmalig, dann Download
// ═══════════════════════════════════════════════════════════

// Create Stripe Checkout for Skill (one-time payment, 99€)
export const createSkillCheckout = httpAction(async (ctx, request) => {
  const body = await request.json();
  const { email } = body as { email?: string };

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return new Response(JSON.stringify({ error: "Stripe not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const frontendUrl = process.env.FRONTEND_URL || "https://faktox.netlify.app";

  // Create Stripe Checkout Session (one-time payment)
  const resp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      "mode": "payment",
      "customer_email": email || "",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "eur",
      "line_items[0][price_data][unit_amount]": "9900", // €99.00
      "line_items[0][price_data][product_data][name]": "Faktox Invoice Agent — AI Skill",
      "line_items[0][price_data][product_data][description]": "Kompletter Rechnungs-Skill für Claude Code, Cursor & Co. 13 Python-Scripts, DACH-konform, mit AI Foto-Scan, Mahnwesen, Buchhaltungs-Report.",
      "success_url": `${frontendUrl}/#skill-success?session_id={CHECKOUT_SESSION_ID}`,
      "cancel_url": `${frontendUrl}/#skill`,
      "metadata[product]": "faktox-invoice-agent-skill",
      "metadata[email]": email || "",
    }),
  });

  const session = await resp.json();

  if (!session.url) {
    return new Response(JSON.stringify({ error: "Checkout creation failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ url: session.url }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
});

// Webhook handler for skill payment — generates download token
export const skillWebhook = httpAction(async (ctx, request) => {
  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return new Response("Missing signature", { status: 400 });
  }

  const body = await request.text();
  const webhookSecret = process.env.STRIPE_SKILL_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return new Response("Stripe not configured", { status: 500 });
  }

  // Verify webhook signature (HMAC-SHA256, v1 scheme)
  const valid = await verifyStripeSignature(body, sig, webhookSecret);
  if (!valid) {
    return new Response("Invalid signature", { status: 400 });
  }

  const event = JSON.parse(body);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const email = session.customer_email || session.metadata?.email || "";

    if (session.metadata?.product === "faktox-invoice-agent-skill") {
      // Generate download token
      const token = crypto.randomUUID();
      await ctx.runMutation(api.skillDownloadDB.createToken, {
        email,
        token,
        sessionId: session.id,
      });

      // Send download email
      const frontendUrl = process.env.FRONTEND_URL || "https://faktox.netlify.app";
      const resendKey = process.env.RESEND_API_KEY;
      if (resendKey) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env.RESEND_FROM_EMAIL || "Faktox <noreply@faktox.online>",
            to: email,
            subject: "Dein Faktox Invoice Agent Skill",
            html: `
              <h1 style="font-family: monospace; color: #0A0A0A;">Faktox Invoice Agent</h1>
              <p>Danke für deinen Kauf!</p>
              <p>Lade dein Skill-Paket hier herunter:</p>
              <a href="${frontendUrl}/#skill-download?token=${token}"
                 style="display: inline-block; padding: 12px 24px; background: #E8A48C; color: #0A0A0A; text-decoration: none; font-family: monospace;">
                Skill herunterladen
              </a>
              <p style="color: #666; font-size: 12px; margin-top: 16px;">
                Der Link ist 7 Tage gültig.<br>
                © 2026 maighty Labs — faktox.online
              </p>
            `,
          }),
        });
      }
    }
  }

  return new Response("ok", { status: 200 });
});

// Verify download token and return download URL
export const verifyDownload = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new Response(JSON.stringify({ error: "Missing token" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await ctx.runQuery(api.skillDownloadDB.getByToken, { token });

  if (!result) {
    return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Check expiry (7 days)
  const ageMs = Date.now() - result.createdAt;
  if (ageMs > 7 * 24 * 60 * 60 * 1000) {
    return new Response(JSON.stringify({ error: "Token expired" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Return download info
  return new Response(JSON.stringify({
    valid: true,
    email: result.email,
    downloadUrl: "https://github.com/Paz-231/faktox/releases/download/v1.0/faktox-invoice-agent.zip",
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
