import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// ═══════════════════════════════════════════════════════════
// Business Profile API — Unternehmensprofil + Steuerstatus
// ═══════════════════════════════════════════════════════════

export const get = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("businessProfiles")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .first();
  },
});

export const create = mutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    street: v.string(),
    postalCityCountry: v.string(),
    country: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    legalForm: v.string(),
    bankOwner: v.optional(v.string()),
    iban: v.optional(v.string()),
    bic: v.optional(v.string()),
    currentUid: v.optional(v.string()),
    currentTaxStatus: v.string(),
    currentTaxRate: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const profileId = await ctx.db.insert("businessProfiles", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });

    // Initial tax status history entry
    await ctx.db.insert("taxStatusHistory", {
      profileId,
      status: args.currentTaxStatus,
      rate: args.currentTaxRate,
      validFrom: new Date(now).toISOString().split("T")[0],
      validUntil: undefined,
      reason: "Initial setup",
      changedAt: now,
    });

    // Initial UID history if provided
    if (args.currentUid) {
      await ctx.db.insert("uidHistory", {
        profileId,
        uid: args.currentUid,
        validFrom: new Date(now).toISOString().split("T")[0],
        validUntil: undefined,
        changedAt: now,
      });
    }

    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "profile_created",
      details: `${args.name} — ${args.currentTaxStatus} (${args.currentTaxRate}%)`,
      timestamp: now,
    });

    return profileId;
  },
});

// Update existing profile (Basisdaten + Bank + UID — Steuerstatus via changeTaxStatus)
export const update = mutation({
  args: {
    profileId: v.id("businessProfiles"),
    name: v.optional(v.string()),
    street: v.optional(v.string()),
    postalCityCountry: v.optional(v.string()),
    country: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    legalForm: v.optional(v.string()),
    bankOwner: v.optional(v.string()),
    iban: v.optional(v.string()),
    bic: v.optional(v.string()),
    currentUid: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile) throw new Error("Profile not found");

    const { profileId, ...updates } = args;
    const clean: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(updates)) {
      if (val !== undefined) clean[k] = val;
    }

    // UID changed → record in history
    if (args.currentUid && args.currentUid !== profile.currentUid) {
      const today = new Date().toISOString().split("T")[0];
      const history = await ctx.db
        .query("uidHistory")
        .withIndex("profileId", (q) => q.eq("profileId", profileId))
        .collect();
      for (const entry of history) {
        if (!entry.validUntil) {
          await ctx.db.patch(entry._id, { validUntil: today });
        }
      }
      await ctx.db.insert("uidHistory", {
        profileId,
        uid: args.currentUid,
        validFrom: today,
        validUntil: undefined,
        changedAt: Date.now(),
      });
    }

    await ctx.db.patch(profileId, { ...clean, updatedAt: Date.now() });

    await ctx.db.insert("auditLog", {
      userId: profile.userId,
      action: "profile_updated",
      details: `Profil aktualisiert`,
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

// Change tax status (with validity date — old status gets validUntil)
export const changeTaxStatus = mutation({
  args: {
    profileId: v.id("businessProfiles"),
    status: v.string(),
    rate: v.number(),
    validFrom: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile) throw new Error("Profile not found");

    const now = Date.now();

    // Close previous status
    const history = await ctx.db
      .query("taxStatusHistory")
      .withIndex("profileId", (q) => q.eq("profileId", args.profileId))
      .collect();

    for (const entry of history) {
      if (!entry.validUntil) {
        // Set validUntil to day before new status
        const dayBefore = new Date(args.validFrom);
        dayBefore.setDate(dayBefore.getDate() - 1);
        await ctx.db.patch(entry._id, {
          validUntil: dayBefore.toISOString().split("T")[0],
        });
      }
    }

    // Add new entry
    await ctx.db.insert("taxStatusHistory", {
      profileId: args.profileId,
      status: args.status,
      rate: args.rate,
      validFrom: args.validFrom,
      validUntil: undefined,
      reason: args.reason,
      changedAt: now,
    });

    // Update profile current values
    await ctx.db.patch(args.profileId, {
      currentTaxStatus: args.status,
      currentTaxRate: args.rate,
      updatedAt: now,
    });

    // Audit
    await ctx.db.insert("auditLog", {
      userId: profile.userId,
      action: "tax_status_changed",
      details: `${args.status} (${args.rate}%) from ${args.validFrom}`,
      timestamp: now,
    });
  },
});

// Get tax status for a specific date
export const getTaxStatusForDate = query({
  args: { profileId: v.id("businessProfiles"), date: v.string() },
  handler: async (ctx, args) => {
    const history = await ctx.db
      .query("taxStatusHistory")
      .withIndex("profileId", (q) => q.eq("profileId", args.profileId))
      .collect();

    let active = null;
    for (const entry of history.sort((a, b) => a.validFrom.localeCompare(b.validFrom))) {
      if (entry.validFrom <= args.date) {
        active = entry;
      } else {
        break;
      }
    }
    return active;
  },
});
