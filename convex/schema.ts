import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// ═══════════════════════════════════════════════════════════
// Rechnungs-SaaS — Convex Schema
// DACH Rechnungsverwaltung: AT-Honorarnoten + DE-Rechnungen
// ═══════════════════════════════════════════════════════════

export default defineSchema({
  // ─── Users (Multi-Tenant) ───────────────────────────────────
  users: defineTable({
    email: v.string(),
    name: v.string(),
    // Auth
    magicLinkToken: v.optional(v.string()),
    magicLinkExpiry: v.optional(v.number()),
    // Subscription
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    plan: v.string(), // "free" | "starter" | "pro"
    planStatus: v.string(), // "active" | "canceled" | "past_due"
    // Timestamps
    createdAt: v.number(),
    lastLoginAt: v.optional(v.number()),
  }).index("email", ["email"]),

  // ─── Business Profiles (Unternehmensprofil pro User) ────────
  // Versioniert: Steuerstatus-Wechsel werden mit Gültigkeitsdatum gespeichert
  businessProfiles: defineTable({
    userId: v.id("users"),
    // Basisdaten
    name: v.string(),
    street: v.string(),
    postalCityCountry: v.string(),
    country: v.string(), // "AT" | "DE" | "CH"
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    legalForm: v.string(), // einzelunternehmen, gmbh, etc.
    // Bank
    bankOwner: v.optional(v.string()),
    iban: v.optional(v.string()),
    bic: v.optional(v.string()),
    // UID (versioniert über uidHistory)
    currentUid: v.optional(v.string()),
    // Steuerstatus (versioniert über taxStatusHistory)
    currentTaxStatus: v.string(), // kleinunternehmer, ust_standard, etc.
    currentTaxRate: v.number(), // 0, 20, 19, 10, 7
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("userId", ["userId"]),

  // ─── Steuerstatus-Historie (versioniert) ───────────────────
  taxStatusHistory: defineTable({
    profileId: v.id("businessProfiles"),
    status: v.string(), // kleinunternehmer, ust_standard, ust_ermaessigt, reverse_charge, befreit
    rate: v.number(), // 0.0, 20.0, 19.0, etc.
    validFrom: v.string(), // YYYY-MM-DD
    validUntil: v.optional(v.string()), // null = aktuell gültig
    reason: v.optional(v.string()),
    changedAt: v.number(),
  }).index("profileId", ["profileId"]),

  // ─── UID-Historie (versioniert) ────────────────────────────
  uidHistory: defineTable({
    profileId: v.id("businessProfiles"),
    uid: v.string(),
    validFrom: v.string(),
    validUntil: v.optional(v.string()),
    changedAt: v.number(),
  }).index("profileId", ["profileId"]),

  // ─── Kundenstamm (Empfänger) ───────────────────────────────
  customers: defineTable({
    userId: v.id("users"),
    name: v.string(),
    street: v.optional(v.string()),
    postalCityCountry: v.optional(v.string()),
    uid: v.optional(v.string()),
    email: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  }).index("userId", ["userId"]),

  // ─── Angebote (optional, vor Auftrag) ─────────────────────
  angebots: defineTable({
    userId: v.id("users"),
    // Angebotsdaten (gleiche Struktur wie Rechnung)
    number: v.string(), // AN-2026-000001
    date: v.string(),
    validUntil: v.optional(v.string()), // Gültig bis
    deliveryDate: v.optional(v.string()),
    // Empfänger
    recipientName: v.string(),
    recipientStreet: v.string(),
    recipientCity: v.string(),
    recipientUid: v.optional(v.string()),
    // Steuer
    taxMode: v.string(),
    taxRate: v.number(),
    taxNote: v.optional(v.string()),
    // Beträge
    netAmount: v.number(),
    vatAmount: v.number(),
    grossAmount: v.number(),
    // Positionen
    items: v.array(v.object({
      pos: v.number(),
      description: v.string(),
      qty: v.number(),
      unit: v.string(),
      unitPrice: v.number(),
      total: v.number(),
    })),
    // Status: draft → sent → confirmed → (generiert Auftrag) | discarded
    status: v.string(),
    sentDate: v.optional(v.string()),
    sentTo: v.optional(v.string()),
    confirmedDate: v.optional(v.string()),
    pdfStorageId: v.optional(v.id("_storage")),
    // Verknüpfung
    auftragId: v.optional(v.id("auftrags")), // Auftrag der aus diesem Angebot entstand
    // Sonstiges
    paymentTerms: v.optional(v.string()),
    footer: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("userId", ["userId"]).index("number", ["userId", "number"]),

  // ─── Aufträge (immer, Pflicht vor Rechnung) ───────────────
  auftrags: defineTable({
    userId: v.id("users"),
    number: v.string(), // AU-2026-000001
    date: v.string(),
    deliveryDate: v.optional(v.string()),
    periodStart: v.optional(v.string()),
    periodEnd: v.optional(v.string()),
    // Empfänger
    customerId: v.optional(v.id("customers")),
    recipientName: v.string(),
    recipientStreet: v.string(),
    recipientCity: v.string(),
    recipientUid: v.optional(v.string()),
    // Steuer
    taxMode: v.string(),
    taxRate: v.number(),
    taxNote: v.optional(v.string()),
    // Beträge
    netAmount: v.number(),
    vatAmount: v.number(),
    grossAmount: v.number(),
    // Positionen
    items: v.array(v.object({
      pos: v.number(),
      description: v.string(),
      qty: v.number(),
      unit: v.string(),
      unitPrice: v.number(),
      total: v.number(),
    })),
    // Status: draft → confirmed → (Rechnung möglich) | discarded
    status: v.string(),
    confirmedDate: v.optional(v.string()),
    discardedDate: v.optional(v.string()),
    // Versand (Auftragsbestätigung per Email)
    sentDate: v.optional(v.string()),
    sentTo: v.optional(v.string()),
    pdfStorageId: v.optional(v.id("_storage")),
    // Verknüpfung
    angebotId: v.optional(v.id("angebots")), // Angebot aus dem dieser Auftrag entstand
    rechnungIds: v.optional(v.array(v.id("outgoingInvoices"))), // Rechnungen aus diesem Auftrag
    // Sonstiges
    paymentTerms: v.string(),
    footer: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("userId", ["userId"]).index("number", ["userId", "number"]),

  // ─── Ausgangsrechnungen (Rechnungen die der User ausstellt) ─
  outgoingInvoices: defineTable({
    userId: v.id("users"),
    // Verknüpfung mit Auftrag (IMMER vorhanden)
    auftragId: v.id("auftrags"),
    // Rechnungsdaten
    number: v.string(), // RE-2026-000001
    type: v.string(), // "Honorarnote" | "Rechnung"
    date: v.string(), // DD.MM.YYYY
    deliveryDate: v.optional(v.string()),
    periodStart: v.optional(v.string()),
    periodEnd: v.optional(v.string()),
    // Empfänger
    customerId: v.optional(v.id("customers")),
    recipientName: v.string(),
    recipientStreet: v.string(),
    recipientCity: v.string(),
    recipientUid: v.optional(v.string()),
    // Steuer
    taxMode: v.string(), // kleinunternehmer, ust_standard, etc.
    taxRate: v.number(), // 0, 20, 19
    taxNote: v.optional(v.string()),
    // Beträge
    netAmount: v.number(),
    vatAmount: v.number(),
    grossAmount: v.number(),
    // Positionen
    items: v.array(v.object({
      pos: v.number(),
      description: v.string(),
      qty: v.number(),
      unit: v.string(),
      unitPrice: v.number(),
      total: v.number(),
    })),
    // Status
    // Status: final (immutable), paid, storno, overdue
    // Rechnung wird sofort als "final" erstellt — nicht veränderbar.
    // Änderungen nur via Storno (Gutschrift) möglich.
    status: v.string(),
    lockedAt: v.optional(v.number()), // Timestamp wann Rechnung final wurde
    paidDate: v.optional(v.string()),
    // Versand per Email (ändert den Status NICHT — Rechnung bleibt final)
    sentDate: v.optional(v.string()),
    sentTo: v.optional(v.string()),
    // Storno
    stornoOf: v.optional(v.string()), // Original-Rechnungsnummer
    stornoNumber: v.optional(v.string()), // STORNO-RE-Nummer
    // Zahlungsbedingungen
    paymentTerms: v.string(),
    footer: v.optional(v.string()),
    // Dateien
    pdfStorageId: v.optional(v.id("_storage")), // Convex File Storage
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("userId", ["userId"]).index("number", ["userId", "number"]),

  // ─── Eingangsrechnungen (Rechnungen die der User erhält) ────
  incomingInvoices: defineTable({
    userId: v.id("users"),
    // Rechnungsdaten
    number: v.string(), // Lieferanten-Rechnungsnummer
    date: v.string(),
    deliveryDate: v.optional(v.string()),
    // Lieferant
    issuerName: v.string(),
    issuerStreet: v.optional(v.string()),
    issuerCity: v.optional(v.string()),
    issuerUid: v.optional(v.string()),
    // Steuer
    taxRate: v.number(),
    // Beträge
    netAmount: v.number(),
    vatAmount: v.number(),
    grossAmount: v.number(),
    // Metadaten
    category: v.optional(v.string()),
    description: v.optional(v.string()),
    paymentTerms: v.optional(v.string()),
    iban: v.optional(v.string()),
    bic: v.optional(v.string()),
    // Status
    status: v.string(), // open, paid, pending_scan, scan_failed
    paidDate: v.optional(v.string()),
    paidAmount: v.optional(v.number()),
    // Dateien
    fileStorageId: v.optional(v.id("_storage")), // Original PDF/Foto
    // Timestamps
    createdAt: v.number(),
  }).index("userId", ["userId"]),

  // ─── Mahnungen ─────────────────────────────────────────────
  dunningLetters: defineTable({
    userId: v.id("users"),
    invoiceId: v.id("outgoingInvoices"),
    invoiceNumber: v.string(),
    type: v.string(), // "reminder", "mahnung1", "mahnung2"
    date: v.string(),
    amount: v.number(),
    pdfStorageId: v.optional(v.id("_storage")),
    createdAt: v.number(),
  }).index("invoiceId", ["invoiceId"]).index("userId", ["userId"]),

  // ─── Nummernkreis (pro User, pro Jahr) ─────────────────────
  numberSequences: defineTable({
    userId: v.id("users"),
    year: v.number(), // 2026
    nextNumber: v.number(), // nächste freie Nummer
    createdAt: v.number(),
  }).index("userId_year", ["userId", "year"]),

  // ─── Backups (automated + manual) ──────────────────────────
  backups: defineTable({
    userId: v.id("users"),
    storageId: v.id("_storage"), // Convex file storage
    fileName: v.string(),
    sizeBytes: v.number(),
    recordCount: v.number(),
    type: v.string(), // "auto" | "manual"
    createdAt: v.number(),
  }).index("userId", ["userId"]).index("createdAt", ["createdAt"]),

  // ─── Sessions (Server-side Auth) ───────────────────────────
  sessions: defineTable({
    userId: v.id("users"),
    token: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  }).index("token", ["token"]).index("userId", ["userId"]),

  // ─── Skill Downloads (99€ einmalig) ────────────────────────
  skillDownloads: defineTable({
    email: v.string(),
    token: v.string(), // download token
    sessionId: v.string(), // Stripe session ID
    createdAt: v.number(),
    downloadedAt: v.optional(v.number()),
  }).index("token", ["token"]).index("email", ["email"]),

  // ─── Skill Versions (Versionierung + Download) ────────────
  skillVersions: defineTable({
    version: v.string(), // "1.0.0", "1.1.0", etc.
    description: v.string(), // what changed
    storageId: v.id("_storage"), // Convex file storage
    fileName: v.string(), // "faktox-invoice-agent-1.0.0.zip"
    sizeBytes: v.number(),
    checksum: v.string(), // SHA-256 for integrity
    isLatest: v.boolean(), // true = current latest version
    releaseNotes: v.optional(v.string()),
    createdAt: v.number(),
  }).index("isLatest", ["isLatest"]).index("version", ["version"]),

  // ─── Settings (pro User) ───────────────────────────────────
  settings: defineTable({
    userId: v.id("users"),
    // Rechnung-Generierung: "auto" (bei Auftragsbestätigung) | "manual" (User triggert)
    rechnungMode: v.string(), // "auto" | "manual"
    // Standard-Steuerstatus
    defaultTaxMode: v.string(), // kleinunternehmer, ust_standard, etc.
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("userId", ["userId"]),

  // ─── Audit Log ─────────────────────────────────────────────
  auditLog: defineTable({
    userId: v.id("users"),
    action: v.string(), // "invoice_created", "invoice_storno", "tax_status_changed", etc.
    details: v.string(),
    timestamp: v.number(),
  }).index("userId", ["userId"]),

  // ─── Waitlist (Landing Page Email Capture) ─────────────────
  waitlist: defineTable({
    email: v.string(),
    createdAt: v.number(),
  }).index("email", ["email"]),
});
