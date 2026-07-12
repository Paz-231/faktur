import { action, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { buildDocumentPdf, PdfDocument, PdfIssuer } from "./pdfBuilder";
import { getAuthUserId } from "./authHelper";

// ═══════════════════════════════════════════════════════════
// Dokumente — PDF-Generierung + Versand per Email (Resend)
// kind: "rechnung" (outgoingInvoices) | "angebot" | "auftrag"
//
// Beide Actions verlangen einen gültigen Session-Token und
// prüfen, dass das Dokument dem eingeloggten User gehört.
// ═══════════════════════════════════════════════════════════

const kindValidator = v.union(v.literal("rechnung"), v.literal("angebot"), v.literal("auftrag"));
type Kind = "rechnung" | "angebot" | "auftrag";

// Versand-Rate-Limit: max. Emails pro Stunde pro User
const SEND_LIMIT_PER_HOUR = 20;

// ─── Interne Daten-Beschaffung (validiert Session + Besitz) ──

export const getDocData = internalQuery({
  args: { kind: kindValidator, docId: v.string(), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx, args.sessionToken);

    let doc: any = null;
    if (args.kind === "rechnung") doc = await ctx.db.get(args.docId as Id<"outgoingInvoices">);
    if (args.kind === "angebot") doc = await ctx.db.get(args.docId as Id<"angebots">);
    if (args.kind === "auftrag") doc = await ctx.db.get(args.docId as Id<"auftrags">);
    if (!doc) return null;

    // Besitzprüfung — fremde Dokumente sind für den Aufrufer unsichtbar
    if (String(doc.userId) !== String(userId)) {
      throw new Error("Kein Zugriff auf dieses Dokument");
    }

    const profile = await ctx.db
      .query("businessProfiles")
      .withIndex("userId", (q) => q.eq("userId", doc.userId))
      .first();

    let customerEmail: string | null = null;
    if (doc.customerId) {
      const customer = await ctx.db.get(doc.customerId as Id<"customers">);
      customerEmail = customer?.email || null;
    }

    return { doc, profile, customerEmail };
  },
});

// Rate-Limit-Check: gesendete Dokument-Emails der letzten Stunde
export const countRecentSends = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recent = await ctx.db
      .query("auditLog")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(100);
    return recent.filter((e) => e.action === "document_sent" && e.timestamp > oneHourAgo).length;
  },
});

export const savePdfRef = internalMutation({
  args: { kind: kindValidator, docId: v.string(), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.docId as Id<any>, { pdfStorageId: args.storageId });
  },
});

export const markDocSent = internalMutation({
  args: { kind: kindValidator, docId: v.string(), to: v.string(), number: v.string(), userId: v.id("users") },
  handler: async (ctx, args) => {
    const date = new Date().toLocaleDateString("de-AT");
    const patch: Record<string, unknown> = { sentDate: date, sentTo: args.to };
    // Angebote haben einen echten sent-Status im Workflow (draft → sent → confirmed)
    if (args.kind === "angebot") {
      const doc: any = await ctx.db.get(args.docId as Id<"angebots">);
      if (doc && doc.status === "draft") patch.status = "sent";
    }
    await ctx.db.patch(args.docId as Id<any>, patch);

    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "document_sent",
      details: `${args.kind} ${args.number} per Email an ${args.to}`,
      timestamp: Date.now(),
    });
  },
});

// ─── Helpers ────────────────────────────────────────────────

function docTitle(kind: Kind, doc: any): string {
  if (kind === "rechnung") return String(doc.type || "Rechnung").toUpperCase();
  if (kind === "angebot") return "ANGEBOT";
  return "AUFTRAGSBESTÄTIGUNG";
}

function docLabel(kind: Kind, doc: any): string {
  if (kind === "rechnung") return doc.type || "Rechnung";
  if (kind === "angebot") return "Angebot";
  return "Auftragsbestätigung";
}

function toPdfInput(kind: Kind, doc: any, profile: any): { pdfDoc: PdfDocument; issuer: PdfIssuer } {
  const issuer: PdfIssuer = {
    name: profile.name,
    street: profile.street,
    postalCityCountry: profile.postalCityCountry,
    email: profile.email || undefined,
    phone: profile.phone || undefined,
    uid: profile.currentUid || undefined,
    bankOwner: profile.bankOwner || undefined,
    iban: profile.iban || undefined,
    bic: profile.bic || undefined,
  };

  const pdfDoc: PdfDocument = {
    title: docTitle(kind, doc),
    number: doc.number,
    date: doc.date,
    deliveryDate: doc.deliveryDate || undefined,
    periodStart: doc.periodStart || undefined,
    periodEnd: doc.periodEnd || undefined,
    validUntil: doc.validUntil || undefined,
    recipientName: doc.recipientName,
    recipientStreet: doc.recipientStreet,
    recipientCity: doc.recipientCity,
    recipientUid: doc.recipientUid || undefined,
    taxRate: doc.taxRate || 0,
    taxNote: doc.taxNote || undefined,
    taxBreakdown: doc.taxBreakdown || undefined,
    netAmount: doc.netAmount,
    vatAmount: doc.vatAmount,
    grossAmount: doc.grossAmount,
    items: doc.items,
    paymentTerms: doc.paymentTerms || undefined,
    footer: doc.footer || undefined,
  };

  return { pdfDoc, issuer };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(binary);
}

async function buildPdf(ctx: any, kind: Kind, docId: string, sessionToken: string) {
  const data = await ctx.runQuery(internal.documents.getDocData, { kind, docId, sessionToken });
  if (!data) throw new Error("Dokument nicht gefunden");
  if (!data.profile) {
    throw new Error("Bitte zuerst das Unternehmensprofil einrichten (Einstellungen) — es liefert die Absenderdaten für das PDF.");
  }
  const { pdfDoc, issuer } = toPdfInput(kind, data.doc, data.profile);
  const bytes = await buildDocumentPdf(pdfDoc, issuer);
  const fileName = `${docLabel(kind, data.doc).replace(/\s+/g, "_")}_${data.doc.number}.pdf`;
  return { data, bytes, fileName };
}

// ─── Public Actions ─────────────────────────────────────────

// PDF erzeugen + Download-URL zurückgeben
export const generatePdfUrl = action({
  args: { kind: kindValidator, docId: v.string(), sessionToken: v.string() },
  handler: async (ctx, args): Promise<{ url: string; fileName: string }> => {
    const { bytes, fileName } = await buildPdf(ctx, args.kind, args.docId, args.sessionToken);

    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
    const storageId = await ctx.storage.store(blob);
    await ctx.runMutation(internal.documents.savePdfRef, { kind: args.kind, docId: args.docId, storageId });

    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("PDF konnte nicht gespeichert werden");
    return { url, fileName };
  },
});

// PDF erzeugen und per Email (Resend) an den Kunden senden
export const sendByEmail = action({
  args: {
    kind: kindValidator,
    docId: v.string(),
    sessionToken: v.string(),
    to: v.string(),
    subject: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const to = args.to.trim();
    if (!to.includes("@")) throw new Error("Ungültige Empfänger-Email-Adresse");

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      throw new Error("Email-Versand nicht konfiguriert (RESEND_API_KEY fehlt). PDF stattdessen herunterladen und manuell senden.");
    }

    const { data, bytes, fileName } = await buildPdf(ctx, args.kind, args.docId, args.sessionToken);

    // Rate-Limit: Email-Versand kostet — Missbrauch begrenzen
    const recentSends = await ctx.runQuery(internal.documents.countRecentSends, {
      userId: data.doc.userId,
    });
    if (recentSends >= SEND_LIMIT_PER_HOUR) {
      throw new Error(`Versand-Limit erreicht (${SEND_LIMIT_PER_HOUR}/Stunde). Bitte später erneut versuchen.`);
    }

    // PDF auch ablegen (Beleg-Archiv)
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
    const storageId = await ctx.storage.store(blob);
    await ctx.runMutation(internal.documents.savePdfRef, { kind: args.kind, docId: args.docId, storageId });

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || "Faktox <noreply@faktox.online>",
        to,
        reply_to: data.profile.email || undefined,
        subject: args.subject,
        text: args.message,
        attachments: [{ filename: fileName, content: bytesToBase64(bytes) }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Resend error:", err);
      throw new Error("Email-Versand fehlgeschlagen. Bitte später erneut versuchen.");
    }

    await ctx.runMutation(internal.documents.markDocSent, {
      kind: args.kind,
      docId: args.docId,
      to,
      number: data.doc.number,
      userId: data.doc.userId,
    });

    return { success: true };
  },
});
