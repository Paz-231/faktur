import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

// ═══════════════════════════════════════════════════════════
// Auth API — Magic-Link Authentication
// ═══════════════════════════════════════════════════════════

function generateToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 64; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

// Token expiry: 15 minutes
const TOKEN_EXPIRY_MS = 15 * 60 * 1000;

// Step 1: Request magic link (user enters email on landing page)
export const requestMagicLink = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();
    if (!email.includes("@")) {
      throw new Error("Ungültige Email-Adresse");
    }

    // Generate secure random token
    const token = generateToken();
    const expiresAt = Date.now() + TOKEN_EXPIRY_MS;

    // Find or create user
    let user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();

    if (!user) {
      const userId = await ctx.db.insert("users", {
        email,
        name: email.split("@")[0],
        plan: "free",
        planStatus: "active",
        createdAt: Date.now(),
      });
      user = await ctx.db.get(userId);
    }

    // Store magic link token
    await ctx.db.patch(user!._id, {
      magicLinkToken: token,
      magicLinkExpiry: expiresAt,
    });

    // Build magic link URL
    const baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const magicLink = `${baseUrl}/auth/verify?token=${token}`;

    // Schedule email sending (internal action)
    await ctx.scheduler.runAfter(0, api.auth.sendMagicLinkEmail, {
      email,
      magicLink,
      userName: user!.name,
    });

    return { success: true, message: "Magic-Link gesendet" };
  },
});

// Step 2: Verify magic link token (user clicks link in email)
export const verifyMagicLink = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    if (!args.token) {
      return { valid: false, error: "Kein Token" };
    }

    // Find user by token
    const allUsers = await ctx.db.query("users").collect();
    const user = allUsers.find((u) => u.magicLinkToken === args.token);

    if (!user) {
      return { valid: false, error: "Token nicht gefunden" };
    }

    if (!user.magicLinkExpiry || Date.now() > user.magicLinkExpiry) {
      return { valid: false, error: "Token abgelaufen" };
    }

    return {
      valid: true,
      userId: user._id,
      email: user.email,
      name: user.name,
    };
  },
});

// Step 3: Complete login (store session token, clear magic link token)
export const completeLogin = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const allUsers = await ctx.db.query("users").collect();
    const user = allUsers.find((u) => u.magicLinkToken === args.token);

    if (!user || !user.magicLinkExpiry || Date.now() > user.magicLinkExpiry) {
      throw new Error("Token ungültig oder abgelaufen");
    }

    // Generate session token
    const sessionToken = generateToken();

    // Clear magic link token, update last login
    await ctx.db.patch(user._id, {
      magicLinkToken: undefined,
      magicLinkExpiry: undefined,
      lastLoginAt: Date.now(),
    });

    return {
      sessionToken,
      userId: user._id,
      email: user.email,
      name: user.name,
      plan: user.plan,
    };
  },
});

// Get current user by session (for dashboard auth check)
export const getCurrentUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    return {
      _id: user._id,
      email: user.email,
      name: user.name,
      plan: user.plan,
      planStatus: user.planStatus,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };
  },
});

// Internal: Send magic link email via Resend
export const sendMagicLinkEmail = internalMutation({
  args: {
    email: v.string(),
    magicLink: v.string(),
    userName: v.string(),
  },
  handler: async (ctx, args) => {
    // Use Resend API to send email
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      // Dev mode: log the link instead
      console.log(`[DEV] Magic link for ${args.email}: ${args.magicLink}`);
      return { success: false, dev: true, link: args.magicLink };
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || "Faktur <noreply@faktur.app>",
        to: args.email,
        subject: "Dein Faktur Login-Link",
        html: `
          <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 500px; margin: 0 auto; padding: 2rem;">
            <h1 style="color: #0D3B4C;">Faktur Login</h1>
            <p>Hallo ${args.userName},</p>
            <p>Klicke auf den folgenden Link um dich bei Faktur einzuloggen:</p>
            <p>
              <a href="${args.magicLink}"
                 style="display: inline-block; background: #E8A48C; color: #0D3B4C; padding: 1rem 2rem; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 1rem 0;">
                Einloggen →
              </a>
            </p>
            <p style="color: #999; font-size: 0.85rem;">
              Der Link ist 15 Minuten gültig.<br>
              Wenn du diesen Login nicht angefordert hast, ignoriere diese Email.
            </p>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      console.error("Resend error:", await response.text());
      return { success: false, error: "Email sending failed" };
    }

    return { success: true };
  },
});

// Update user profile
export const updateProfile = mutation({
  args: {
    userId: v.id("users"),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updates: any = {};
    if (args.name) updates.name = args.name;
    await ctx.db.patch(args.userId, updates);
    return { success: true };
  },
});
