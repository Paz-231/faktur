import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { SelectPicker } from "./SelectPicker";
import { TAX_RATE_SELECT_OPTIONS, TAX_RATE_MAP, computeTaxBreakdown, computeTotals, taxRateLabel } from "./taxRates";

export interface InitialCustomer {
  customerId: string;
  name: string;
  street: string;
  city: string;
  uid: string;
}

interface CreateInvoiceModalProps {
  userId: string;
  sessionToken: string;
  onClose: () => void;
  onCreated?: () => void;
  /** Vorausgewählter Kunde (z.B. aus der Kundendetailseite) */
  initialCustomer?: InitialCustomer;
  /** Vorausgefüllte Daten aus Foto/Voice-Scan */
  prefillData?: {
    recipient_name: string;
    recipient_street: string;
    recipient_city: string;
    recipient_uid: string;
    items: { description: string; qty: number; unit_price: number; unit: string }[];
    net_amount: number;
    vat_rate: number;
    tax_mode: string;
    payment_terms: string;
    date: string;
    delivery_date: string;
    invoice_type: string;
  };
}

interface InvoiceItem {
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  taxRate: number; // pro-Position Steuersatz
}

const TAX_MODES = [
  { value: "kleinunternehmer", label: "Kleinunternehmer (0% USt)", rate: 0 },
  { value: "ust_standard", label: "USt-pflichtig (AT 20% / DE 19%)", rate: 20 },
  { value: "ust_ermaessigt", label: "Ermäßigt (AT 10% / DE 7%)", rate: 10 },
  { value: "reverse_charge", label: "Reverse Charge (0%)", rate: 0 },
  { value: "befreit", label: "Befreit (0%)", rate: 0 },
];

const UNITS = ["Stunden", "Stück", "Monate", "Pauschal", "Tag", "Quadratmeter"];
const UNIT_OPTIONS = UNITS.map((u) => ({ value: u, label: u }));
const TAX_MODE_OPTIONS = TAX_MODES.map((m) => ({ value: m.value, label: m.label }));

export function CreateInvoiceModal({ userId, sessionToken, onClose, onCreated, initialCustomer, prefillData }: CreateInvoiceModalProps) {
  const [type, setType] = useState<"Honorarnote" | "Rechnung">(
    (prefillData?.invoice_type as "Honorarnote" | "Rechnung") || "Rechnung"
  );
  const [date, setDate] = useState(prefillData?.date || new Date().toLocaleDateString("de-AT"));
  const [deliveryDate, setDeliveryDate] = useState(prefillData?.delivery_date || "");
  const [customerId, setCustomerId] = useState<string>(initialCustomer?.customerId || "");
  const [recipientName, setRecipientName] = useState(initialCustomer?.name || prefillData?.recipient_name || "");
  const [recipientStreet, setRecipientStreet] = useState(initialCustomer?.street || prefillData?.recipient_street || "");
  const [recipientCity, setRecipientCity] = useState(initialCustomer?.city || prefillData?.recipient_city || "");
  const [recipientUid, setRecipientUid] = useState(initialCustomer?.uid || prefillData?.recipient_uid || "");

  // Kundenstamm für die Schnellauswahl
  const customers = useQuery(api.customers.list, { userId: userId as any, sessionToken }) ?? [];

  const handleSelectCustomer = (id: string) => {
    setCustomerId(id);
    if (!id) return; // "manuell eingeben" — Felder unangetastet lassen
    const c = customers.find((c: any) => c._id === id);
    if (c) {
      setRecipientName(c.name || "");
      setRecipientStreet(c.street || "");
      setRecipientCity(c.postalCityCountry || "");
      setRecipientUid(c.uid || "");
    }
  };

  // Auto-match: Wenn prefillData einen Empfängernamen hat und Kunden geladen sind,
  // prüfe ob ein Kunde mit diesem Namen existiert und wähle ihn automatisch aus.
  useEffect(() => {
    if (!prefillData?.recipient_name || !customers.length || customerId) return;
    const match = customers.find((c: any) => {
      const cName = (c.name || "").toLowerCase().trim();
      const pName = (prefillData.recipient_name || "").toLowerCase().trim();
      return cName === pName || cName.includes(pName) || pName.includes(cName);
    });
    if (match) {
      handleSelectCustomer(match._id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, prefillData?.recipient_name]);
  const [taxMode, setTaxMode] = useState(prefillData?.tax_mode || "kleinunternehmer");
  const [paymentTerms, setPaymentTerms] = useState(prefillData?.payment_terms || "Zahlbar ohne Abzug innerhalb von 7 Tagen nach Rechnungserhalt.");
  const [items, setItems] = useState<InvoiceItem[]>(
    prefillData?.items?.length
      ? prefillData.items.map(i => ({ description: i.description, qty: i.qty, unit: i.unit, unitPrice: i.unit_price, taxRate: i.vat_rate || 0 }))
      : [{ description: "", qty: 1, unit: "Stunden", unitPrice: 0, taxRate: 0 }]
  );
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdStep, setCreatedStep] = useState<string | null>(null);

  const createAuftrag = useMutation(api.auftrags.create);

  const addItem = () => {
    setItems([...items, { description: "", qty: 1, unit: "Stunden", unitPrice: 0, taxRate: items[0]?.taxRate || 0 }]);
  };

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: keyof InvoiceItem, value: string | number) => {
    const updated = [...items];
    (updated[idx] as any)[field] = field === "qty" || field === "unitPrice" ? Number(value) : value;
    setItems(updated);
  };

  // Berechnung mit pro-Position Steuersätzen
  const itemsForCalc = items.map((i) => ({ total: i.qty * i.unitPrice, taxRate: i.taxRate }));
  const totals = computeTotals(itemsForCalc);
  const taxBreakdown = computeTaxBreakdown(itemsForCalc);
  const netTotal = totals.netAmount;
  const vatAmount = totals.vatAmount;
  const grossTotal = totals.grossAmount;

  const handleCreate = async () => {
    setError("");
    setCreating(true);

    try {
      // Validate
      if (!recipientName || !recipientStreet || !recipientCity) {
        throw new Error("Empfängerdaten unvollständig");
      }
      if (items.some((i) => !i.description || i.qty <= 0 || i.unitPrice <= 0)) {
        throw new Error("Positionen unvollständig — Beschreibung, Menge und Preis erforderlich");
      }

      // Tax notes
      const taxNotes: Record<string, string> = {
        kleinunternehmer: "Gemäß § 6 Abs. 1 Z 27 UStG von der Umsatzsteuer befreit.",
        reverse_charge: "Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge).",
        befreit: "Von der Umsatzsteuer befreit.",
      };

      // Build items with positions + per-item tax rate
      const invoiceItems = items.map((item, idx) => ({
        pos: idx + 1,
        description: item.description,
        qty: item.qty,
        unit: item.unit,
        unitPrice: item.unitPrice,
        total: item.qty * item.unitPrice,
        taxRate: item.taxRate,
      }));

      // Step 1: Create Auftrag (draft status — no rechnung yet).
      // Nummer wird serverseitig atomar aus dem Nummernkreis vergeben.
      setCreatedStep("Auftrag wird erstellt...");

      await createAuftrag({
        userId: userId as any,
        sessionToken,
        date,
        deliveryDate: deliveryDate || undefined,
        customerId: (customerId || undefined) as any,
        recipientName,
        recipientStreet,
        recipientCity,
        recipientUid: recipientUid || undefined,
        taxMode,
        taxRate,
        taxNote: taxNotes[taxMode] || undefined,
        netAmount: netTotal,
        vatAmount,
        grossAmount: grossTotal,
        items: invoiceItems,
        paymentTerms,
      });

      // Auftrag created as draft. User can:
      // - Confirm it (from Auftrag detail) » if auto mode, rechnung is generated
      // - Create Angebot from it (from Auftrag detail)
      // - Create Rechnung manually (from Auftrag detail)

      onCreated?.();
      onClose();
    } catch (err: any) {
      setError(err.message || "Fehler beim Erstellen");
    } finally {
      setCreating(false);
    }
  };

  const money = (v: number) => `€ ${v.toFixed(2).replace(".", ",")}`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "min(820px, 100%)", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
        <div className="modal-header">
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Neuer Auftrag</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ flex: 1, overflowY: "auto", padding: "1rem 1.25rem" }}>
          {prefillData && (
            <div style={{ padding: "0.5rem 0.75rem", background: "var(--surface-2)", border: "1px solid var(--accent)", marginBottom: "0.75rem", fontSize: "0.75rem", color: "var(--accent)", borderRadius: "0.25rem" }}>
              KI-vorausgefüllt — bitte alle Daten prüfen und bei Bedarf anpassen.
            </div>
          )}

          {/* Flow Info */}
          <div style={{ padding: "0.5rem 0.75rem", background: "var(--surface-2)", border: "1px solid var(--border)", marginBottom: "0.75rem", fontSize: "0.6875rem", color: "var(--fg-3)", borderRadius: "0.25rem" }}>
            Der Auftrag ist die Basis — die Rechnung erstellst du danach mit einem Klick aus der Auftrags-Detailansicht (lückenloser Nummernkreis inklusive).
          </div>

          {/* Type + Date in einer Zeile */}
          <div style={{ display: "flex", gap: "1rem", marginBottom: "0.75rem" }}>
            <div className="field-group" style={{ flex: "0 0 auto" }}>
              <label className="label">Typ</label>
              <div style={{ display: "flex", gap: "0.375rem" }}>
                {(["Rechnung", "Honorarnote"] as const).map((t) => (
                  <button
                    key={t}
                    className={`btn btn-sm ${type === t ? "btn-primary" : ""}`}
                    onClick={() => setType(t)}
                    style={{ padding: "0.5rem 0.875rem", justifyContent: "center" }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="field-group" style={{ flex: 1 }}>
              <label className="label">Auftragsdatum</label>
              <input className="input" value={date} onChange={(e) => setDate(e.target.value)} placeholder="DD.MM.YYYY" />
            </div>
          </div>

          {/* Recipient */}
          <h4 style={{ marginTop: "0.5rem", marginBottom: "0.5rem", fontSize: "0.875rem" }}>Empfänger</h4>

          {/* Bestehenden Kunden wählen — spart die Doppeleingabe */}
          {customers.length > 0 && (
            <>
              <CustomerPicker customers={customers} value={customerId} onChange={handleSelectCustomer} />
              {customerId && (
                <div style={{ fontSize: "0.6875rem", color: "var(--success)", marginTop: "0.25rem", marginBottom: "0.5rem" }}>
                  Kundendaten übernommen — der Auftrag wird mit diesem Kunden verknüpft.
                </div>
              )}
            </>
          )}

          <div style={{ display: "flex", gap: "1rem", marginBottom: "0.5rem" }}>
            <div className="field-group" style={{ flex: 1 }}>
              <label className="label">Name / Firma</label>
              <input className="input" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Kunde GmbH" />
            </div>
            <div className="field-group" style={{ flex: 1 }}>
              <label className="label">UID (optional)</label>
              <input className="input" value={recipientUid} onChange={(e) => setRecipientUid(e.target.value)} placeholder="ATU..." />
            </div>
          </div>
          <div style={{ display: "flex", gap: "1rem", marginBottom: "0.5rem" }}>
            <div className="field-group" style={{ flex: 1 }}>
              <label className="label">Straße</label>
              <input className="input" value={recipientStreet} onChange={(e) => setRecipientStreet(e.target.value)} placeholder="Musterstraße 1" />
            </div>
            <div className="field-group" style={{ flex: 1 }}>
              <label className="label">PLZ + Ort + Land</label>
              <input className="input" value={recipientCity} onChange={(e) => setRecipientCity(e.target.value)} placeholder="1010 Wien, Österreich" />
            </div>
          </div>

          {/* Items */}
          <h4 className="responsive-hide-label" style={{ marginTop: "0.5rem", marginBottom: "0.5rem", fontSize: "0.875rem" }}>Positionen</h4>

          {/* Desktop: Grid Table */}
          <div className="item-row-desktop">
            {items.map((item, idx) => (
              <div key={idx} className="item-row" style={{ display: "grid", gridTemplateColumns: "2fr 50px 1fr 90px 80px 100px 28px", gap: "0.5rem", marginBottom: "0.5rem", alignItems: "end" }}>
                <div>
                  {idx === 0 && <label className="label">Beschreibung</label>}
                  <input className="input" value={item.description} onChange={(e) => updateItem(idx, "description", e.target.value)} placeholder="Beratungsleistung" />
                </div>
                <div>
                  {idx === 0 && <label className="label">Menge</label>}
                  <input className="input" type="number" min="1" value={item.qty} onChange={(e) => updateItem(idx, "qty", e.target.value)} />
                </div>
                <div>
                  {idx === 0 && <label className="label">Einheit</label>}
                  <SelectPicker
                    value={item.unit}
                    onChange={(v) => updateItem(idx, "unit", v)}
                    options={UNIT_OPTIONS}
                    style={{ marginBottom: 0 }}
                  />
                </div>
                <div style={{ position: "relative" }}>
                  {idx === 0 && <label className="label">USt-Satz</label>}
                  <SelectPicker
                    value={String(item.taxRate)}
                    onChange={(v) => updateItem(idx, "taxRate" as any, Number(v))}
                    options={TAX_RATE_SELECT_OPTIONS}
                    style={{ marginBottom: 0 }}
                  />
                </div>
                <div>
                  {idx === 0 && <label className="label">Preis/Einh.</label>}
                  <input className="input" type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(idx, "unitPrice", e.target.value)} />
                </div>
                <div>
                  {idx === 0 && <label className="label">Gesamt</label>}
                  <div style={{ padding: "0.625rem 0.75rem", fontSize: "0.8125rem", fontWeight: 600, color: "var(--fg)", minHeight: "44px", display: "flex", alignItems: "center" }}>
                    {money(item.qty * item.unitPrice)}
                  </div>
                </div>
                <div>
                  {items.length > 1 && (
                    <button className="btn btn-ghost btn-icon" onClick={() => removeItem(idx)} style={{ color: "var(--danger)" }}>×</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Mobile: Card Layout */}
          <div className="item-cards">
            {items.map((item, idx) => (
              <div key={idx} className="item-card">
                <div className="item-card-top">
                  <span className="item-card-num">Position {idx + 1}</span>
                  {items.length > 1 && (
                    <button className="btn btn-ghost btn-icon" onClick={() => removeItem(idx)} style={{ color: "var(--danger)", padding: "0.25rem" }}>×</button>
                  )}
                </div>
                <div className="field-group">
                  <label className="label">Beschreibung</label>
                  <input className="input" value={item.description} onChange={(e) => updateItem(idx, "description", e.target.value)} placeholder="Beratungsleistung" />
                </div>
                <div className="item-card-row">
                  <div className="field-group">
                    <label className="label">Menge</label>
                    <input className="input" type="number" min="1" value={item.qty} onChange={(e) => updateItem(idx, "qty", e.target.value)} />
                  </div>
                  <div className="field-group">
                    <label className="label">Einheit</label>
                    <SelectPicker
                      value={item.unit}
                      onChange={(v) => updateItem(idx, "unit", v)}
                      options={UNIT_OPTIONS}
                      style={{ marginBottom: 0 }}
                    />
                  </div>
                </div>
                <div className="item-card-row" style={{ position: "relative" }}>
                  <SelectPicker
                    value={String(item.taxRate)}
                    onChange={(v) => updateItem(idx, "taxRate" as any, Number(v))}
                    options={TAX_RATE_SELECT_OPTIONS}
                    label="USt-Satz"
                    style={{ marginBottom: 0 }}
                  />
                </div>
                <div className="field-group">
                  <label className="label">Preis/Einh. (EUR)</label>
                  <input className="input" type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(idx, "unitPrice", e.target.value)} />
                </div>
              </div>
            ))}
          </div>

          <button className="btn btn-sm" onClick={addItem} style={{ marginTop: "0.25rem" }}>+ Position</button>

          {/* Tax mode + Summary in einer Zeile */}
          <div style={{ display: "flex", gap: "1rem", marginTop: "0.5rem", alignItems: "flex-start" }}>
            <div className="field-group" style={{ flex: 0.8, position: "relative" }}>
              <label className="label">Steuerrechtlicher Status</label>
              <SelectPicker
                value={taxMode}
                onChange={setTaxMode}
                options={TAX_MODE_OPTIONS}
                style={{ marginBottom: 0 }}
              />
              <div style={{ fontSize: "0.625rem", color: "var(--fg-3)", marginTop: "0.25rem" }}>
                Steuersatz pro Position. Status bestimmt den Hinweis.
              </div>
            </div>
            <div style={{ flex: 1, padding: "0.75rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.125rem" }}>
                <span style={{ color: "var(--fg-3)", fontSize: "0.75rem" }}>Netto</span>
                <span style={{ fontSize: "0.75rem" }}>{money(netTotal)}</span>
              </div>
              {taxBreakdown.filter((b) => b.taxRate > 0).map((b) => (
                <div key={b.taxRate} style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.125rem" }}>
                  <span style={{ color: "var(--fg-3)", fontSize: "0.6875rem" }}>
                    USt {b.taxRate.toFixed(0)}% — {money(b.netAmount)}
                  </span>
                  <span style={{ fontSize: "0.6875rem" }}>{money(b.vatAmount)}</span>
                </div>
              ))}
              {taxBreakdown.some((b) => b.taxRate === 0) && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.125rem" }}>
                  <span style={{ color: "var(--fg-3)", fontSize: "0.6875rem" }}>
                    Frei (0%) — {money(taxBreakdown.find((b) => b.taxRate === 0)!.netAmount)}
                  </span>
                  <span style={{ fontSize: "0.6875rem" }}>€ 0,00</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, borderTop: "1px solid var(--border)", paddingTop: "0.25rem", marginTop: "0.125rem" }}>
                <span style={{ fontSize: "0.8125rem" }}>Gesamt</span>
                <span style={{ color: "var(--accent)", fontSize: "0.8125rem" }}>{money(grossTotal)}</span>
              </div>
            </div>
          </div>

          {/* Payment terms */}
          <div className="field-group" style={{ marginTop: "0.5rem" }}>
            <label className="label">Zahlungsbedingungen</label>
            <input className="input" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
          </div>

          {error && (
            <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: "var(--surface-2)", border: "1px solid var(--danger)", color: "var(--danger)", fontSize: "0.8125rem" }}>
              {error}
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ flexShrink: 0 }}>
          <button className="btn" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
            {creating ? (createdStep || "Erstelle...") : "Auftrag erstellen"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// DatePicker — Mini calendar picker im Faktox-Design
// ═══════════════════════════════════════════════════════════

const MONTHS_DE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const DAYS_DE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function formatDate(d: Date): string {
  return d.toLocaleDateString("de-AT");
}

function parseDate(s: string): Date | null {
  const parts = s.split(".");
  if (parts.length === 3) {
    const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function DatePicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initial = parseDate(value) || new Date();
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = parseDate(value);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const firstDay = new Date(viewYear, viewMonth, 1);
  const lastDay = new Date(viewYear, viewMonth + 1, 0);
  const daysInMonth = lastDay.getDate();
  // Monday = 0
  let startWeekday = firstDay.getDay() - 1;
  if (startWeekday < 0) startWeekday = 6;

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(viewYear, viewMonth, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const pick = (d: Date) => {
    onChange(formatDate(d));
    setOpen(false);
  };

  const isSameDay = (a: Date | null, b: Date | null) => {
    if (!a || !b) return false;
    return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  };

  return (
    <div className="field-group" ref={ref} style={{ position: "relative" }}>
      <label className="label">{label}</label>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", gap: "0.5rem",
          padding: "0.625rem 0.75rem",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "0",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: "0.8125rem",
          color: value ? "var(--fg)" : "var(--fg-4)",
          minHeight: "44px",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: "var(--fg-3)" }}>
          <rect x="2" y="3" width="12" height="11" rx="0" />
          <path d="M2 6h12M5 1v3M11 1v3" />
        </svg>
        <span>{value || "DD.MM.YYYY"}</span>
      </div>

      {open && (
        <div className="datepicker-popup">
          <div className="datepicker-header">
            <button className="datepicker-nav" onClick={prevMonth} type="button">{"<"}</button>
            <span className="datepicker-title">{MONTHS_DE[viewMonth]} {viewYear}</span>
            <button className="datepicker-nav" onClick={nextMonth} type="button">{">"}</button>
          </div>
          <div className="datepicker-grid">
            {DAYS_DE.map((d) => (
              <div key={d} className="datepicker-dow">{d}</div>
            ))}
            {cells.map((d, i) => (
              <button
                key={i}
                className={`datepicker-day ${d ? "" : "empty"} ${isSameDay(d, selected) ? "selected" : ""} ${isSameDay(d, today) ? "today" : ""}`}
                onClick={() => d && pick(d)}
                disabled={!d}
                type="button"
              >
                {d ? d.getDate() : ""}
              </button>
            ))}
          </div>
          <button className="datepicker-clear" onClick={() => { onChange(""); setOpen(false); }} type="button">
            Datum entfernen
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// CustomerPicker — durchsuchbares Dropdown im Faktox-Design
// ═══════════════════════════════════════════════════════════

function CustomerPicker({ customers, value, onChange }: { customers: any[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = customers.find((c) => c._id === value);
  const filtered = customers.filter((c) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (c.name || "").toLowerCase().includes(s) ||
           (c.postalCityCountry || "").toLowerCase().includes(s) ||
           (c.email || "").toLowerCase().includes(s);
  });

  return (
    <div className="field-group" ref={ref} style={{ position: "relative" }}>
      <label className="label">Aus Kundenstamm wählen</label>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0.625rem 0.75rem",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: "0.8125rem",
          minHeight: "44px",
        }}
      >
        <span style={{ color: selected ? "var(--fg)" : "var(--fg-4)" }}>
          {selected ? selected.name : "— Neuen Empfänger manuell eingeben —"}
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" style={{ color: "var(--fg-3)", flexShrink: 0 }}>
          <path d="M3 4.5 6 8l3-3.5" />
        </svg>
      </div>

      {open && (
        <div className="customer-picker-popup">
          <input
            type="text"
            className="input customer-picker-search"
            placeholder="Suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            style={{ borderRadius: 0, margin: 0, marginBottom: "0.375rem" }}
          />
          {filtered.length === 0 ? (
            <div className="customer-picker-empty">Keine Kunden gefunden</div>
          ) : (
            filtered.map((c) => (
              <button
                key={c._id}
                className={`customer-picker-item ${c._id === value ? "selected" : ""}`}
                onClick={() => { onChange(c._id); setOpen(false); setSearch(""); }}
                type="button"
              >
                <div className="customer-picker-name">{c.name}</div>
                {c.postalCityCountry && (
                  <div className="customer-picker-meta">{c.postalCityCountry}</div>
                )}
              </button>
            ))
          )}
          <button
            className="customer-picker-manual"
            onClick={() => { onChange(""); setOpen(false); setSearch(""); }}
            type="button"
          >
            + Neuen Empfänger manuell eingeben
          </button>
        </div>
      )}
    </div>
  );
}
