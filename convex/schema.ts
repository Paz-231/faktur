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

  // ─── Ausgangsrechnungen (Rechnungen die der User ausstellt) ─
  outgoingInvoices: defineTable({
    userId: v.id("users"),
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
    status: v.string(), // draft, sent, paid, storno, overdue
    paidDate: v.optional(v.string()),
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
  }).index("invoiceId", ["invoiceId"]),

  // ─── Nummernkreis (pro User, pro Jahr) ─────────────────────
  numberSequences: defineTable({
    userId: v.id("users"),
    year: v.number(), // 2026
    nextNumber: v.number(), // nächste freie Nummer
    createdAt: v.number(),
  }).index("userId_year", ["userId", "year"]),

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
