import { query, mutation, action, internalQuery, internalAction, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { getAuthUserId } from "./authHelper";

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

// Internal query for action auth — Actions have ActionCtx (no ctx.db),
// so we can't use getAuthUserId directly. This query wraps the auth check.
const _authCheck = internalQuery({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    return await getAuthUserId(ctx, args.sessionToken);
  },
});

async function actionAuth(ctx: any, sessionToken: string): Promise<string | null> {
  // Use the public validateSession query — returns null instead of throwing
  const user = await ctx.runQuery(api.auth.validateSession, { token: sessionToken });
  if (!user) return null;
  return user.userId;
}

// Step 1: Generate upload URL
export const generateUploadUrl = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx, args.sessionToken);
    return await ctx.storage.generateUploadUrl();
  },
});

// Step 2: Get file URL (for display/download)
export const getFileUrl = query({
  args: { storageId: v.id("_storage"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx, args.sessionToken);
    return await ctx.storage.getUrl(args.storageId);
  },
});

// Step 3: Create incoming invoice from uploaded file
// Saves the file reference + metadata in the DB
export const createIncomingFromFile = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    fileStorageId: v.id("_storage"),
    fileName: v.string(),
    fileType: v.string(),
    fileSize: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx, args.sessionToken);
    const now = Date.now();
    const id = await ctx.db.insert("incomingInvoices", {
      userId,
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
    await ctx.scheduler.runAfter(0, internal.fileUpload.scanInvoiceFile, {
      incomingId: id,
      fileStorageId: args.fileStorageId,
      userId,
    });

    await ctx.db.insert("auditLog", {
      userId,
      action: "file_uploaded",
      details: `${args.fileName} (${args.fileType}, ${args.fileSize} bytes)`,
      timestamp: now,
    });

    return id;
  },
});

// Step 4: AI Scan — extrahiert Rechnungsdaten aus der hochgeladenen Datei
export const scanInvoiceFile = internalAction({
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
      await ctx.runMutation(internal.fileUpload.markScanFailed, {
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
      await ctx.runMutation(internal.fileUpload.markScanFailed, {
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
      await ctx.runMutation(internal.fileUpload.markScanFailed, {
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

    await ctx.runMutation(internal.fileUpload.applyScanResult, {
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

// ═══════════════════════════════════════════════════════════
// Outgoing Invoice Scan — Foto/Stundenzettel → Rechnungsdaten
// ═══════════════════════════════════════════════════════════

// Scan a file (photo/PDF) and extract invoice data for an OUTGOING invoice
// (e.g. timesheet photo → recipient, items, amounts)
export const scanOutgoingFile = action({
  args: {
    sessionToken: v.string(),
    fileStorageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const userId = await actionAuth(ctx, args.sessionToken);
    if (!userId) return { error: "Sitzung abgelaufen — bitte erneut einloggen" };

    const fileUrl = await ctx.storage.getUrl(args.fileStorageId);
    if (!fileUrl) return { error: "Datei nicht gefunden" };

    const response = await fetch(fileUrl);
    const blob = await response.blob();
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const contentType = response.headers.get("content-type") || "application/octet-stream";

    // Convert to base64
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
    }
    const base64 = btoa(binary);

    const apiKey = process.env.BUILT_IN_FORGE_API_KEY || process.env.OPENROUTER_API_KEY;
    const apiUrl = process.env.BUILT_IN_FORGE_API_URL || "https://openrouter.ai/api";
    const model = process.env.VISION_MODEL || "openai/gpt-4o";

    if (!apiKey) {
      return { error: "Kein API-Key konfiguriert — Vision-Scan nicht verfügbar. Bitte OPENROUTER_API_KEY in Convex setzen." };
    }

    let visionResponse: Response;
    try {
      visionResponse = await fetch(`${apiUrl}/v1/chat/completions`, {
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
              content: `You are an invoice/timesheet scanner for Austrian and German freelancers. The user uploads a photo of a timesheet, handwritten notes, or a draft invoice. Extract the data needed to CREATE an outgoing invoice (Honorarnote or Rechnung). Return JSON: {recipient_name, recipient_street, recipient_city, recipient_uid, items:[{description, qty, unit_price, unit}], net_amount, vat_rate, tax_mode, payment_terms, date, delivery_date, invoice_type}. unit should be one of: Stunden, Stück, Monate, Pauschal, Tag, Quadratmeter. tax_mode should be one of: kleinunternehmer, ust_standard, ust_ermaessigt, reverse_charge, befreit. invoice_type should be "Rechnung" or "Honorarnote". Only fill what's visible. Return ONLY JSON.`,
            },
            {
              role: "user",
              content: [
                { type: "text", text: "Extrahiere alle Daten für die Rechnungserstellung aus diesem Dokument." },
                { type: "image_url", image_url: { url: `data:${contentType};base64,${base64}` } },
              ],
            },
          ],
          temperature: 0.1,
          response_format: { type: "json_object" },
        }),
      });
    } catch (fetchErr: any) {
      return { error: `Netzwerkfehler beim Kontaktieren der KI-API: ${fetchErr.message || "unbekannt"}` };
    }

    if (!visionResponse.ok) {
      const errBody = await visionResponse.text().catch(() => "");
      return { error: `KI-API Fehler ${visionResponse.status}: ${errBody.substring(0, 200)}` };
    }

    let result: any;
    try {
      result = await visionResponse.json();
    } catch {
      return { error: "KI-API Antwort konnte nicht gelesen werden (ungültiges JSON)." };
    }
    const content: string = result.choices?.[0]?.message?.content || "";
    if (!content) {
      return { error: "KI-API hat keine Antwort geliefert." };
    }

    let extracted: any;
    try {
      const jsonText = content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
      extracted = JSON.parse(jsonText);
    } catch {
      return { error: "KI-Antwort konnte nicht als JSON geparst werden." };
    }

    // Clean up file after scan
    await ctx.storage.delete(args.fileStorageId);

    return {
      recipient_name: extracted.recipient_name || "",
      recipient_street: extracted.recipient_street || "",
      recipient_city: extracted.recipient_city || "",
      recipient_uid: extracted.recipient_uid || "",
      items: (extracted.items || []).map((item: any) => ({
        description: String(item.description || ""),
        qty: Number(item.qty) || 1,
        unit_price: Number(String(item.unit_price).replace(",", ".")) || 0,
        unit: String(item.unit || "Stunden"),
      })),
      net_amount: Number(String(extracted.net_amount).replace(",", ".")) || 0,
      vat_rate: Number(extracted.vat_rate) || 0,
      tax_mode: String(extracted.tax_mode || "kleinunternehmer"),
      payment_terms: String(extracted.payment_terms || ""),
      date: String(extracted.date || ""),
      delivery_date: String(extracted.delivery_date || ""),
      invoice_type: String(extracted.invoice_type || "Rechnung"),
    };
  },
});

// Parse voice/dictation text → invoice data
export const parseVoiceToInvoice = action({
  args: {
    sessionToken: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await actionAuth(ctx, args.sessionToken);
    if (!userId) return { error: "Sitzung abgelaufen — bitte erneut einloggen" };

    const apiKey = process.env.BUILT_IN_FORGE_API_KEY || process.env.OPENROUTER_API_KEY;
    const apiUrl = process.env.BUILT_IN_FORGE_API_URL || "https://openrouter.ai/api";
    const model = process.env.VISION_MODEL || "openai/gpt-4o";

    if (!apiKey) {
      return { error: "Kein API-Key konfiguriert. Bitte OPENROUTER_API_KEY in Convex setzen." };
    }

    let llmResponse: Response;
    try {
      llmResponse = await fetch(`${apiUrl}/v1/chat/completions`, {
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
              content: `You are an invoice parser for Austrian and German freelancers. The user dictates or types what they want to invoice. Extract invoice data. Return JSON: {recipient_name, recipient_street, recipient_city, recipient_uid, items:[{description, qty, unit_price, unit}], net_amount, vat_rate, tax_mode, payment_terms, date, delivery_date, invoice_type}. unit should be one of: Stunden, Stück, Monate, Pauschal, Tag, Quadratmeter. tax_mode should be one of: kleinunternehmer, ust_standard, ust_ermaessigt, reverse_charge, befreit. invoice_type should be "Rechnung" or "Honorarnote". Only fill what's mentioned. Return ONLY JSON.`,
            },
            {
              role: "user",
              content: args.text,
            },
          ],
          temperature: 0.1,
          response_format: { type: "json_object" },
        }),
      });
    } catch (fetchErr: any) {
      return { error: `Netzwerkfehler beim Kontaktieren der KI-API: ${fetchErr.message || "unbekannt"}` };
    }

    if (!llmResponse.ok) {
      const errBody = await llmResponse.text().catch(() => "");
      return { error: `KI-API Fehler ${llmResponse.status}: ${errBody.substring(0, 200)}` };
    }

    let result: any;
    try {
      result = await llmResponse.json();
    } catch {
      return { error: "KI-API Antwort konnte nicht gelesen werden (ungültiges JSON)." };
    }

    const content: string = result.choices?.[0]?.message?.content || "";
    if (!content) {
      return { error: "KI-API hat keine Antwort geliefert." };
    }

    let extracted: any;
    try {
      const jsonText = content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
      extracted = JSON.parse(jsonText);
    } catch {
      return { error: "KI-Antwort konnte nicht als JSON geparst werden." };
    }

    return {
      recipient_name: extracted.recipient_name || "",
      recipient_street: extracted.recipient_street || "",
      recipient_city: extracted.recipient_city || "",
      recipient_uid: extracted.recipient_uid || "",
      items: (extracted.items || []).map((item: any) => ({
        description: String(item.description || ""),
        qty: Number(item.qty) || 1,
        unit_price: Number(String(item.unit_price).replace(",", ".")) || 0,
        unit: String(item.unit || "Stunden"),
      })),
      net_amount: Number(String(extracted.net_amount).replace(",", ".")) || 0,
      vat_rate: Number(extracted.vat_rate) || 0,
      tax_mode: String(extracted.tax_mode || "kleinunternehmer"),
      payment_terms: String(extracted.payment_terms || ""),
      date: String(extracted.date || ""),
      delivery_date: String(extracted.delivery_date || ""),
      invoice_type: String(extracted.invoice_type || "Rechnung"),
    };
  },
});

// Mark scan as failed
export const markScanFailed = internalMutation({
  args: {
    incomingId: v.id("incomingInvoices"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Internal mutation — called by scanInvoiceFile action with verified userId
    const inv = await ctx.db.get(args.incomingId);
    if (!inv) throw new Error("Invoice not found");
    if (inv.userId !== args.userId) throw new Error("Zugriff verweigert");

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
export const applyScanResult = internalMutation({
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
    // Internal mutation — called by scanInvoiceFile action with verified userId
    const inv = await ctx.db.get(args.incomingId);
    if (!inv) throw new Error("Invoice not found");
    if (inv.userId !== args.userId) throw new Error("Zugriff verweigert");

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
