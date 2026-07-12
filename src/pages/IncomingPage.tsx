import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { FileUpload } from "../FileUpload";
import { SelectPicker } from "../SelectPicker";
import { money } from "../lib";

// ═══════════════════════════════════════════════════════════
// Incoming Page (Eingang) — Upload + manuelle Erfassung + Live Data
// ═══════════════════════════════════════════════════════════
export function IncomingPage({ userId, sessionToken }: { userId: any; sessionToken: string }) {
  const [showUpload, setShowUpload] = useState(false);
  const [showManual, setShowManual] = useState(false);

  const invoices = useQuery(api.incoming.list, { userId, sessionToken }) ?? [];
  const markPaid = useMutation(api.incoming.markPaid);
  const removeIncoming = useMutation(api.incoming.remove);

  const statusBadge = (status: string) => {
    const map: Record<string, { text: string; class: string }> = {
      open: { text: "Offen", class: "badge badge-warn" },
      paid: { text: "Bezahlt", class: "badge badge-success" },
      pending_scan: { text: "Scannen...", class: "badge badge-accent" },
      scan_failed: { text: "Scan fehlgeschlagen", class: "badge badge-danger" },
    };
    const s = map[status] || { text: status, class: "badge" };
    return <span className={s.class}>{s.text}</span>;
  };

  const handleMarkPaid = async (e: React.MouseEvent, invoiceId: string) => {
    e.stopPropagation();
    await markPaid({
      invoiceId: invoiceId as any,
      sessionToken,
      paidDate: new Date().toLocaleDateString("de-AT"),
    });
  };

  const handleDelete = async (e: React.MouseEvent, invoiceId: string, number: string) => {
    e.stopPropagation();
    if (!confirm(`Eingangsrechnung ${number} wirklich loeschen?`)) return;
    await removeIncoming({ invoiceId: invoiceId as any, sessionToken });
  };

  return (
    <div className="slide-up">
      <div className="page-header">
        <h1 className="page-title">Eingangsrechnungen</h1>
        <div className="page-actions">
          <button className="btn" onClick={() => setShowUpload(!showUpload)}>
            {showUpload ? "× Schließen" : "Foto/PDF hochladen"}
          </button>
          <button className="btn btn-primary" onClick={() => setShowManual(true)}>+ Manuell erfassen</button>
        </div>
      </div>

      {showUpload && (
        <div style={{ marginBottom: "1.5rem" }}>
          <FileUpload userId={userId} sessionToken={sessionToken} onUploaded={() => setShowUpload(false)} />
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nummer</th>
              <th>Datum</th>
              <th>Lieferant</th>
              <th>Kategorie</th>
              <th>Netto</th>
              <th>USt</th>
              <th>Brutto</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <div className="empty-state">
                    <h3>Keine Eingangsrechnungen</h3>
                    <p>Lade ein Foto hoch — die KI erfasst die Daten automatisch. Oder erfasse manuell.</p>
                    <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", marginTop: "1rem" }}>
                      <button className="btn btn-sm" onClick={() => setShowUpload(true)}>Foto/PDF hochladen</button>
                      <button className="btn btn-primary btn-sm" onClick={() => setShowManual(true)}>+ Manuell erfassen</button>
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              invoices.map((inv: any) => (
                <tr key={inv._id}>
                  <td>{inv.number}</td>
                  <td>{inv.date}</td>
                  <td>{inv.issuerName}</td>
                  <td>{inv.category || "—"}</td>
                  <td>{money(inv.netAmount)}</td>
                  <td>{money(inv.vatAmount)}</td>
                  <td style={{ fontWeight: 600 }}>{money(inv.grossAmount)}</td>
                  <td>{statusBadge(inv.status)}</td>
                  <td>
                    <div style={{ display: "flex", gap: "0.25rem" }}>
                      {inv.status === "open" && (
                        <button className="btn btn-sm" onClick={(e) => handleMarkPaid(e, inv._id)}>
                          Bezahlt
                        </button>
                      )}
                      <button className="btn btn-sm" onClick={(e) => handleDelete(e, inv._id, inv.number)} title="Loeschen">
                        ×
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile: Card List */}
      <div className="data-cards">
        {invoices.length === 0 ? (
          <div className="empty-state" style={{ padding: "2rem 1rem", textAlign: "center" }}>
            <h3>Keine Eingangsrechnungen</h3>
            <p>Foto hochladen oder manuell erfassen.</p>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", marginTop: "1rem" }}>
              <button className="btn btn-sm" onClick={() => setShowUpload(true)}>Foto/PDF</button>
              <button className="btn btn-primary btn-sm" onClick={() => setShowManual(true)}>+ Manuell</button>
            </div>
          </div>
        ) : (
          invoices.map((inv: any) => (
            <div key={inv._id} className="data-card">
              <div className="data-card-header">
                <div>
                  <div className="data-card-title">{inv.issuerName || "Unbekannt"}</div>
                  <div className="data-card-meta">
                    <span>{inv.number}</span>
                    <span>·</span>
                    <span>{inv.date}</span>
                    {inv.category && <><span>·</span><span>{inv.category}</span></>}
                  </div>
                </div>
                <div className="data-card-amount">{money(inv.grossAmount)}</div>
              </div>
              <div className="data-card-meta">
                <span>{statusBadge(inv.status)}</span>
                <span>· Netto {money(inv.netAmount)}</span>
                {inv.vatAmount > 0 && <span>· USt {money(inv.vatAmount)}</span>}
              </div>
              <div className="data-card-actions">
                {inv.status === "open" && (
                  <button className="btn btn-sm" onClick={(e) => handleMarkPaid(e, inv._id)}>
                    Als bezahlt markieren
                  </button>
                )}
                <button className="btn btn-sm" onClick={(e) => handleDelete(e, inv._id, inv.number)} style={{ color: "var(--danger)" }}>
                  Löschen
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {showManual && (
        <ManualIncomingModal userId={userId} sessionToken={sessionToken} onClose={() => setShowManual(false)} />
      )}
    </div>
  );
}

// ─── Manuelle Erfassung einer Eingangsrechnung ───────────────
function ManualIncomingModal({ userId, sessionToken, onClose }: { userId: any; sessionToken: string; onClose: () => void }) {
  const create = useMutation(api.incoming.create);
  const [form, setForm] = useState({
    number: "",
    date: new Date().toLocaleDateString("de-AT"),
    issuerName: "",
    category: "",
    netAmount: "",
    taxRate: "20",
    description: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const net = parseFloat(form.netAmount.replace(",", ".")) || 0;
  const rate = parseFloat(form.taxRate) || 0;
  const vat = (net * rate) / 100;
  const gross = net + vat;

  const set = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const handleSave = async () => {
    setError("");
    if (!form.number || !form.issuerName || net <= 0) {
      setError("Rechnungsnummer, Lieferant und Netto-Betrag sind erforderlich.");
      return;
    }
    setSaving(true);
    try {
      await create({
        userId,
        sessionToken,
        number: form.number,
        date: form.date,
        issuerName: form.issuerName,
        category: form.category || undefined,
        description: form.description || undefined,
        taxRate: rate,
        netAmount: net,
        vatAmount: vat,
        grossAmount: gross,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "min(480px, 100%)" }}>
        <div className="modal-header">
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Eingangsrechnung erfassen</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="field-row">
            <div className="field-group">
              <label className="label">Rechnungsnummer</label>
              <input className="input" value={form.number} onChange={(e) => set("number", e.target.value)} placeholder="R-12345" />
            </div>
            <div className="field-group">
              <label className="label">Datum</label>
              <input className="input" value={form.date} onChange={(e) => set("date", e.target.value)} placeholder="DD.MM.YYYY" />
            </div>
          </div>
          <div className="field-group">
            <label className="label">Lieferant</label>
            <input className="input" value={form.issuerName} onChange={(e) => set("issuerName", e.target.value)} placeholder="Lieferant GmbH" />
          </div>
          <div className="field-row">
            <div className="field-group" style={{ position: "relative" }}>
              <label className="label">Kategorie</label>
              <SelectPicker
                value={form.category}
                onChange={(v) => set("category", v)}
                options={[
                  { value: "", label: "— wählen —" },
                  { value: "Software / SaaS", label: "Software / SaaS" },
                  { value: "Büro / Material", label: "Büro / Material" },
                  { value: "Reisekosten", label: "Reisekosten" },
                  { value: "Telefon / Internet", label: "Telefon / Internet" },
                  { value: "Miete", label: "Miete" },
                  { value: "Fremdleistungen", label: "Fremdleistungen" },
                  { value: "Sonstiges", label: "Sonstiges" },
                ]}
                style={{ marginBottom: 0 }}
              />
            </div>
            <div className="field-group">
              <label className="label">Beschreibung (optional)</label>
              <input className="input" value={form.description} onChange={(e) => set("description", e.target.value)} />
            </div>
          </div>
          <div className="field-row">
            <div className="field-group">
              <label className="label">Netto (€)</label>
              <input className="input" type="text" inputMode="decimal" value={form.netAmount} onChange={(e) => set("netAmount", e.target.value)} placeholder="100,00" />
            </div>
            <div className="field-group" style={{ position: "relative" }}>
              <label className="label">USt-Satz (%)</label>
              <SelectPicker
                value={form.taxRate}
                onChange={(v) => set("taxRate", v)}
                options={[
                  { value: "0", label: "0%" },
                  { value: "7", label: "7% (DE ermäßigt)" },
                  { value: "10", label: "10% (AT ermäßigt)" },
                  { value: "13", label: "13% (AT)" },
                  { value: "19", label: "19% (DE)" },
                  { value: "20", label: "20% (AT)" },
                ]}
                style={{ marginBottom: 0 }}
              />
            </div>
          </div>
          <div style={{ padding: "0.75rem 1rem", background: "var(--surface-2)", border: "1px solid var(--border)", display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
            <span style={{ color: "var(--fg-3)" }}>USt {money(vat)}</span>
            <span style={{ fontWeight: 600 }}>Brutto {money(gross)}</span>
          </div>
          {error && (
            <div style={{ marginTop: "0.75rem", padding: "0.75rem", border: "1px solid var(--danger)", color: "var(--danger)", fontSize: "0.8125rem" }}>
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Speichere..." : "Erfassen"}
          </button>
        </div>
      </div>
    </div>
  );
}
