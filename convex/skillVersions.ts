import { httpAction, mutation, query, action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

// ═══════════════════════════════════════════════════════════
// Skill Version Management — Upload, List, Download
// ═══════════════════════════════════════════════════════════

// Generate upload URL for new skill version (admin only)
export const generateUploadUrl = mutation({
  args: { adminKey: v.string() },
  handler: async (ctx, args) => {
    // Simple admin auth — set ADMIN_KEY in Convex env
    if (args.adminKey !== process.env.ADMIN_KEY) {
      throw new Error("Unauthorized");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

// Register a new skill version after upload
export const publishVersion = mutation({
  args: {
    adminKey: v.string(),
    version: v.string(),
    description: v.string(),
    storageId: v.string(),
    fileName: v.string(),
    sizeBytes: v.number(),
    checksum: v.string(),
    releaseNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.adminKey !== process.env.ADMIN_KEY) {
      throw new Error("Unauthorized");
    }

    // Mark all previous versions as not latest
    const all = await ctx.db
      .query("skillVersions")
      .withIndex("isLatest", (q) => q.eq("isLatest", true))
      .collect();
    for (const v of all) {
      await ctx.db.patch(v._id, { isLatest: false });
    }

    // Insert new version as latest
    const id = await ctx.db.insert("skillVersions", {
      version: args.version,
      description: args.description,
      storageId: args.storageId as any,
      fileName: args.fileName,
      sizeBytes: args.sizeBytes,
      checksum: args.checksum,
      isLatest: true,
      releaseNotes: args.releaseNotes,
      createdAt: Date.now(),
    });

    return { id, version: args.version };
  },
});

// Get latest version (public — no auth needed)
export const getLatest = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("skillVersions")
      .withIndex("isLatest", (q) => q.eq("isLatest", true))
      .first();
  },
});

// Get all versions (public — for changelog)
export const listVersions = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("skillVersions")
      .order("desc")
      .collect();
  },
});

// Download skill — validates purchase token, returns file URL
export const downloadSkill = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const version = url.searchParams.get("version"); // optional, defaults to latest

  if (!token) {
    return new Response(JSON.stringify({ error: "Missing token" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Verify purchase token
  const purchase = await ctx.runQuery(api.skillDownloadDB.getByToken, { token });
  if (!purchase) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Check expiry (7 days for initial, but allow re-download forever)
  // Actually: once purchased, customer can download forever
  // Token is permanent — just mark as downloaded

  // Get requested version or latest
  let skillVersion;
  if (version) {
    const all = await ctx.runQuery(api.skillVersions.listVersions, {});
    skillVersion = (all as any[]).find((v) => v.version === version);
  } else {
    skillVersion = await ctx.runQuery(api.skillVersions.getLatest, {});
  }

  if (!skillVersion) {
    return new Response(JSON.stringify({ error: "Version not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Get file URL from Convex storage
  const fileUrl = await ctx.storage.getUrl(skillVersion.storageId);

  if (!fileUrl) {
    return new Response(JSON.stringify({ error: "File not found in storage" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Mark as downloaded
  await ctx.runMutation(api.skillDownloadDB.markDownloaded, { token });

  // Redirect to file
  return new Response(null, {
    status: 302,
    headers: { Location: fileUrl },
  });
});

// Get download info (for customer portal)
export const getDownloadInfo = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new Response(JSON.stringify({ error: "Missing token" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Verify token
  const purchase = await ctx.runQuery(api.skillDownloadDB.getByToken, { token });
  if (!purchase) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Get latest version
  const latest = await ctx.runQuery(api.skillVersions.getLatest, {});
  const allVersions = await ctx.runQuery(api.skillVersions.listVersions, {});

  return new Response(JSON.stringify({
    email: purchase.email,
    purchasedAt: new Date(purchase.createdAt).toISOString(),
    latest: latest ? {
      version: latest.version,
      description: latest.description,
      fileName: latest.fileName,
      sizeBytes: latest.sizeBytes,
      createdAt: new Date(latest.createdAt).toISOString(),
      releaseNotes: latest.releaseNotes,
    } : null,
    allVersions: (allVersions as any[]).map((v) => ({
      version: v.version,
      description: v.description,
      fileName: v.fileName,
      sizeBytes: v.sizeBytes,
      createdAt: new Date(v.createdAt).toISOString(),
      isLatest: v.isLatest,
      releaseNotes: v.releaseNotes,
    })),
    downloadUrl: `${process.env.FRONTEND_URL || ""}/#skill-download?token=${token}`,
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
