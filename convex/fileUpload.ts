import { query, mutation, action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

// ═══════════════════════════════════════════════════════════
// File Upload API — Convex File Storage
// ═══════════════════════════════════════════════════════════
//
// Convex hat eingebaute File-Storage. Der Flow:
// 1. Frontend ruft generateUploadUrl() → bekommt一次性 URL
// 2. Frontend POSTet die Datei direkt zu Convex Storage
// 3. Fronted bekommt storageId zurück
// 4. Frontend ruft createIncomingFromScan() mit storageId → Vision Scan → Eingangsrechnung
//
// Unterstützt: PDF, JPG, PNG, WEBP, TIFF

// Step 1: Generate upload URL
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

// Step 2: Get file URL (for display/download)
export const getFileUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

// Step 3: Create incoming invoice from uploaded file
// Saves the file reference + metadata in the DB
export const createIncomingFromFile = mutation({
  args: {
    userId: v.id("users"),
    fileStorageId: v.id("_storage"),
    fileName: v.string(),
    fileType: v.string(),
    fileSize: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const id = await ctx.db.insert("incomingInvoices", {
      userId: args.userId,
      number: `PENDING-${now}`,
      date: new Date().toLocaleDateString("de-AT"),
      issuerName: "Aus Datei zu scannen",
      taxRate: 0,
      netAmount: 0,
      vatAmount: 0,
      grossAmount: 0,
      status: "pending_scan",
      fileStorageId: args.fileStorageId,
      description: args.fileName,
      createdAt: now,
    });

    // Schedule AI scan
    await ctx.scheduler.runAfter(0, api.fileUpload.scanInvoiceFile, {
      incomingId: id,
      fileStorageId: args.fileStorageId,
      userId: args.userId,
    });

    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "file_uploaded",
      details: `${args.fileName} (${args.fileType}, ${args.fileSize} bytes)`,
      timestamp: now,
    });

    return id;
  },
});

// Step 4: AI Scan — extrahiert Rechnungsdaten aus der hochgeladenen Datei
export const scanInvoiceFile = action({
  args: {
    incomingId: v.id("incomingInvoices"),
    fileStorageId: v.id("_storage"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Get file URL
    const fileUrl = await ctx.storage.getUrl(args.fileStorageId);
    if (!fileUrl) {
      console.error("File not found");
      return;
    }

    // Download file
    const response = await fetch(fileUrl);
    const blob = await response.blob();
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Determine mime type
    const contentType = response.headers.get("content-type") || "application/octet-stream";

    // Convert to base64 for Vision API (chunked — spreading 10MB into
    // String.fromCharCode would blow the call stack)
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
    }
    const base64 = btoa(binary);

    // Call Vision API via OpenRouter
    const apiKey = process.env.BUILT_IN_FORGE_API_KEY || process.env.OPENROUTER_API_KEY;
    const apiUrl = process.env.BUILT_IN_FORGE_API_URL || "https://openrouter.ai/api";
    const model = process.env.VISION_MODEL || "openai/gpt-4o";

    if (!apiKey) {
      console.log("[DEV] No API key — skipping scan");
      await ctx.runMutation(api.fileUpload.markScanFailed, {
        incomingId: args.incomingId,
        userId: args.userId,
      });
      return;
    }

    const visionResponse = await fetch(`${apiUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `You are an invoice scanner for Austrian and German invoices. Extract ALL visible data. Return JSON: {invoice_number, date (DD.MM.YYYY), issuer_name, issuer_street, issuer_city, issuer_uid, items[{description, qty, unit_price}], net_amount, vat_amount, gross_amount, tax_rate, category_guess, payment_terms, iban, bic}. Only fill what's visible. Return ONLY JSON.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extrahiere alle Rechnungsdaten aus diesem Dokument." },
              { type: "image_url", image_url: { url: `data:${contentType};base64,${base64}` } },
            ],
          },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });

    if (!visionResponse.ok) {
      console.error("Vision API error:", visionResponse.status);
      await ctx.runMutation(api.fileUpload.markScanFailed, {
        incomingId: args.incomingId,
        userId: args.userId,
      });
      return;
    }

    let extracted: any;
    try {
      const result = await visionResponse.json();
      const content: string = result.choices?.[0]?.message?.content || "";
      // Strip possible markdown fences before parsing
      const jsonText = content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
      extracted = JSON.parse(jsonText);
    } catch (err) {
      console.error("Failed to parse vision result:", err);
      await ctx.runMutation(api.fileUpload.markScanFailed, {
        incomingId: args.incomingId,
        userId: args.userId,
      });
      return;
    }

    // Sanitize: only pass fields the mutation validator knows, coerce types
    const str = (x: any) => (x === undefined || x === null ? undefined : String(x));
    const num = (x: any) => {
      const n = typeof x === "number" ? x : parseFloat(String(x).replace(",", "."));
      return Number.isFinite(n) ? n : 0;
    };

    await ctx.runMutation(api.fileUpload.applyScanResult, {
      incomingId: args.incomingId,
      userId: args.userId,
      data: {
        invoice_number: str(extracted.invoice_number) || "",
        date: str(extracted.date) || "",
        issuer_name: str(extracted.issuer_name) || "",
        issuer_street: str(extracted.issuer_street),
        issuer_city: str(extracted.issuer_city),
        issuer_uid: str(extracted.issuer_uid),
        net_amount: num(extracted.net_amount),
        vat_amount: num(extracted.vat_amount),
        gross_amount: num(extracted.gross_amount),
        tax_rate: num(extracted.tax_rate),
        category_guess: str(extracted.category_guess),
        payment_terms: str(extracted.payment_terms),
        iban: str(extracted.iban),
        bic: str(extracted.bic),
      },
    });
  },
});

// Mark scan as failed
export const markScanFailed = mutation({
  args: {
    incomingId: v.id("incomingInvoices"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.incomingId, {
      status: "scan_failed",
      issuerName: "Scan fehlgeschlagen — manuell erfassen",
    });

    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "scan_failed",
      details: `Incoming ${args.incomingId}`,
      timestamp: Date.now(),
    });
  },
});

// Apply scan result to incoming invoice
export const applyScanResult = mutation({
  args: {
    incomingId: v.id("incomingInvoices"),
    userId: v.id("users"),
    data: v.object({
      invoice_number: v.string(),
      date: v.string(),
      issuer_name: v.string(),
      issuer_street: v.optional(v.string()),
      issuer_city: v.optional(v.string()),
      issuer_uid: v.optional(v.string()),
      net_amount: v.number(),
      vat_amount: v.number(),
      gross_amount: v.number(),
      tax_rate: v.number(),
      category_guess: v.optional(v.string()),
      payment_terms: v.optional(v.string()),
      iban: v.optional(v.string()),
      bic: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const d = args.data;
    await ctx.db.patch(args.incomingId, {
      number: d.invoice_number || "UNKNOWN",
      date: d.date || new Date().toLocaleDateString("de-AT"),
      issuerName: d.issuer_name || "Unbekannt",
      issuerStreet: d.issuer_street,
      issuerCity: d.issuer_city,
      issuerUid: d.issuer_uid,
      netAmount: d.net_amount || 0,
      vatAmount: d.vat_amount || 0,
      grossAmount: d.gross_amount || 0,
      taxRate: d.tax_rate || 0,
      category: d.category_guess,
      paymentTerms: d.payment_terms,
      iban: d.iban,
      bic: d.bic,
      status: "open",
    });

    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "scan_completed",
      details: `${d.issuer_name} — €${d.gross_amount?.toFixed(2) || 0}`,
      timestamp: Date.now(),
    });
  },
});
