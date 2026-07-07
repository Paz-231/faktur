import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

interface CreateInvoiceModalProps {
  userId: string;
  onClose: () => void;
  onCreated?: () => void;
}

interface InvoiceItem {
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
}

const TAX_MODES = [
  { value: "kleinunternehmer", label: "Kleinunternehmer (0% USt)", rate: 0 },
  { value: "ust_standard", label: "USt-pflichtig (AT 20% / DE 19%)", rate: 20 },
  { value: "ust_ermaessigt", label: "Ermäßigt (AT 10% / DE 7%)", rate: 10 },
  { value: "reverse_charge", label: "Reverse Charge (0%)", rate: 0 },
  { value: "befreit", label: "Befreit (0%)", rate: 0 },
];

const UNITS = ["Stunden", "Stück", "Monate", "Pauschal", "Tag", "Quadratmeter"];

export function CreateInvoiceModal({ userId, onClose, onCreated }: CreateInvoiceModalProps) {
  const [type, setType] = useState<"Honorarnote" | "Rechnung">("Rechnung");
  const [date, setDate] = useState(new Date().toLocaleDateString("de-AT"));
  const [deliveryDate, setDeliveryDate] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientStreet, setRecipientStreet] = useState("");
  const [recipientCity, setRecipientCity] = useState("");
  const [recipientUid, setRecipientUid] = useState("");
  const [taxMode, setTaxMode] = useState("kleinunternehmer");
  const [paymentTerms, setPaymentTerms] = useState("Zahlbar ohne Abzug innerhalb von 7 Tagen nach Rechnungserhalt.");
  const [items, setItems] = useState<InvoiceItem[]>([
    { description: "", qty: 1, unit: "Stunden", unitPrice: 0 },
  ]);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdStep, setCreatedStep] = useState<string | null>(null);

  const createAuftrag = useMutation(api.auftrags.create);

  const addItem = () => {
    setItems([...items, { description: "", qty: 1, unit: "Stunden", unitPrice: 0 }]);
  };

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: keyof InvoiceItem, value: string | number) => {
    const updated = [...items];
    (updated[idx] as any)[field] = field === "qty" || field === "unitPrice" ? Number(value) : value;
    setItems(updated);
  };

  const taxRate = TAX_MODES.find((m) => m.value === taxMode)?.rate ?? 0;
  const netTotal = items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0);
  const vatAmount = taxRate > 0 ? (netTotal * taxRate) / 100 : 0;
  const grossTotal = netTotal + vatAmount;

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

      // Build items with positions
      const invoiceItems = items.map((item, idx) => ({
        pos: idx + 1,
        description: item.description,
        qty: item.qty,
        unit: item.unit,
        unitPrice: item.unitPrice,
        total: item.qty * item.unitPrice,
      }));

      // Step 1: Create Auftrag (draft status — no rechnung yet).
      // Nummer wird serverseitig atomar aus dem Nummernkreis vergeben.
      setCreatedStep("Auftrag wird erstellt...");

      await createAuftrag({
        userId: userId as any,
        date,
        deliveryDate: deliveryDate || undefined,
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
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Neuer Auftrag</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Flow Info */}
          <div style={{ padding: "0.75rem", background: "var(--surface-2)", border: "1px solid var(--border)", marginBottom: "1rem", fontSize: "0.75rem", color: "var(--fg-3)" }}>
            Der Auftrag ist die Basis — die Rechnung erstellst du danach mit einem Klick aus der Auftrags-Detailansicht (lückenloser Nummernkreis inklusive).
          </div>

          {/* Type */}
          <div className="field-group">
            <label className="label">Typ</label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {(["Rechnung", "Honorarnote"] as const).map((t) => (
                <button
                  key={t}
                  className={`btn btn-sm ${type === t ? "btn-primary" : ""}`}
                  onClick={() => setType(t)}
                  style={{ flex: 1, justifyContent: "center" }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Dates */}
          <div className="field-row">
            <div className="field-group">
              <label className="label">Rechnungsdatum</label>
              <input className="input" value={date} onChange={(e) => setDate(e.target.value)} placeholder="DD.MM.YYYY" />
            </div>
            <div className="field-group">
              <label className="label">Leistungsdatum</label>
              <input className="input" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} placeholder="DD.MM.YYYY" />
            </div>
          </div>

          {/* Recipient */}
          <h4 style={{ marginTop: "1rem", marginBottom: "0.75rem" }}>Empfänger</h4>
          <div className="field-group">
            <label className="label">Name / Firma</label>
            <input className="input" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Kunde GmbH" />
          </div>
          <div className="field-group">
            <label className="label">Straße</label>
            <input className="input" value={recipientStreet} onChange={(e) => setRecipientStreet(e.target.value)} placeholder="Musterstraße 1" />
          </div>
          <div className="field-row">
            <div className="field-group">
              <label className="label">PLZ + Ort + Land</label>
              <input className="input" value={recipientCity} onChange={(e) => setRecipientCity(e.target.value)} placeholder="1010 Wien, Österreich" />
            </div>
            <div className="field-group">
              <label className="label">UID (optional)</label>
              <input className="input" value={recipientUid} onChange={(e) => setRecipientUid(e.target.value)} placeholder="ATU..." />
            </div>
          </div>

          {/* Items */}
          <h4 style={{ marginTop: "1rem", marginBottom: "0.75rem" }}>Positionen</h4>
          {items.map((item, idx) => (
            <div key={idx} style={{ display: "grid", gridTemplateColumns: "2fr 60px 1fr 100px 32px", gap: "0.5rem", marginBottom: "0.5rem", alignItems: "end" }}>
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
                <select className="select" value={item.unit} onChange={(e) => updateItem(idx, "unit", e.target.value)}>
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                {idx === 0 && <label className="label">Preis/Einh.</label>}
                <input className="input" type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(idx, "unitPrice", e.target.value)} />
              </div>
              <div>
                {items.length > 1 && (
                  <button className="btn btn-ghost btn-icon" onClick={() => removeItem(idx)} style={{ color: "var(--danger)" }}>×</button>
                )}
              </div>
            </div>
          ))}
          <button className="btn btn-sm" onClick={addItem} style={{ marginTop: "0.5rem" }}>+ Position</button>

          {/* Tax */}
          <div className="field-group" style={{ marginTop: "1rem" }}>
            <label className="label">Steuerstatus</label>
            <select className="select" value={taxMode} onChange={(e) => setTaxMode(e.target.value)}>
              {TAX_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          {/* Summary */}
          <div style={{ marginTop: "1rem", padding: "1rem", background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
              <span style={{ color: "var(--fg-3)", fontSize: "0.8125rem" }}>Netto</span>
              <span style={{ fontSize: "0.8125rem" }}>{money(netTotal)}</span>
            </div>
            {taxRate > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                <span style={{ color: "var(--fg-3)", fontSize: "0.8125rem" }}>USt ({taxRate}%)</span>
                <span style={{ fontSize: "0.8125rem" }}>{money(vatAmount)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, borderTop: "1px solid var(--border)", paddingTop: "0.5rem", marginTop: "0.25rem" }}>
              <span>Gesamt</span>
              <span style={{ color: "var(--accent)" }}>{money(grossTotal)}</span>
            </div>
          </div>

          {/* Payment terms */}
          <div className="field-group" style={{ marginTop: "1rem" }}>
            <label className="label">Zahlungsbedingungen</label>
            <input className="input" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
          </div>

          {error && (
            <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: "var(--surface-2)", border: "1px solid var(--danger)", color: "var(--danger)", fontSize: "0.8125rem" }}>
              {error}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
            {creating ? (createdStep || "Erstelle...") : "Auftrag erstellen"}
          </button>
        </div>
      </div>
    </div>
  );
}
