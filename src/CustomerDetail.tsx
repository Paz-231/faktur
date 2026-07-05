import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

interface CustomerDetailProps {
  customerId: string;
  userId: string;
  onClose: () => void;
  onRefresh: () => void;
}

const TAX_LABELS: Record<string, string> = {
  kleinunternehmer: "Kleinunternehmer (0%)",
  ust_standard: "USt-pflichtig (20%/19%)",
  ust_ermaessigt: "Ermäßigt (10%/7%)",
  reverse_charge: "Reverse Charge (0%)",
  befreit: "Befreit (0%)",
};

export function CustomerDetail({ customerId, userId, onClose, onRefresh }: CustomerDetailProps) {
  const customer = useQuery(api.customers.getById, { customerId: customerId as any });
  const documents = useQuery(api.customers.getDocuments, { customerId: customerId as any });

  const updateCustomer = useMutation(api.customers.update);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const money = (v: number) => `€ ${(v || 0).toFixed(2).replace(".", ",")}`;

  if (!customer) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-body">Lade...</div>
        </div>
      </div>
    );
  }

  const startEdit = () => {
    setForm({
      name: customer.name,
      street: customer.street || "",
      postalCityCountry: customer.postalCityCountry || "",
      uid: customer.uid || "",
      email: customer.email || "",
      notes: customer.notes || "",
    });
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateCustomer({ customerId: customerId as any, ...form });
      setEditing(false);
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { text: string; cls: string }> = {
      draft: { text: "Entwurf", cls: "badge" },
      sent: { text: "Gesendet", cls: "badge badge-accent" },
      confirmed: { text: "Bestätigt", cls: "badge badge-success" },
      paid: { text: "Bezahlt", cls: "badge badge-success" },
      storno: { text: "Storno", cls: "badge badge-danger" },
      discarded: { text: "Verworfen", cls: "badge badge-danger" },
      overdue: { text: "Überfällig", cls: "badge badge-warn" },
    };
    const s = map[status] || { text: status, cls: "badge" };
    return <span className={s.cls}>{s.text}</span>;
  };

  const { angebots = [], auftrags = [], rechnungen = [], stornos = [] } = documents || {};

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720, maxHeight: "90vh", overflowY: "auto" }}>
        {/* Header */}
        <div className="modal-header">
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>{customer.name}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Kundendaten */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <h4>Kundendaten</h4>
            {!editing ? (
              <button className="btn btn-sm" onClick={startEdit}>Bearbeiten</button>
            ) : (
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button className="btn btn-sm" onClick={() => setEditing(false)}>Abbrechen</button>
                <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? "Speichere..." : "Speichern"}
                </button>
              </div>
            )}
          </div>

          {!editing ? (
            <div style={{ background: "var(--surface-2)", padding: "1rem", border: "1px solid var(--border)", marginBottom: "1.5rem" }}>
              <div style={{ fontWeight: 500, marginBottom: "0.25rem" }}>{customer.name}</div>
              {customer.street && <div style={{ fontSize: "0.8125rem", color: "var(--fg-2)" }}>{customer.street}</div>}
              {customer.postalCityCountry && <div style={{ fontSize: "0.8125rem", color: "var(--fg-2)" }}>{customer.postalCityCountry}</div>}
              {customer.uid && <div style={{ fontSize: "0.75rem", color: "var(--fg-3)", marginTop: "0.25rem" }}>UID: {customer.uid}</div>}
              {customer.email && <div style={{ fontSize: "0.75rem", color: "var(--fg-3)", marginTop: "0.25rem" }}>Email: {customer.email}</div>}
              {customer.notes && <div style={{ fontSize: "0.75rem", color: "var(--fg-3)", marginTop: "0.5rem", padding: "0.5rem", background: "var(--surface)", border: "1px solid var(--border-soft)" }}>{customer.notes}</div>}
            </div>
          ) : (
            <div style={{ marginBottom: "1.5rem" }}>
              <div className="field-group">
                <label className="label">Name / Firma</label>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="field-group">
                <label className="label">Straße</label>
                <input className="input" value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} />
              </div>
              <div className="field-group">
                <label className="label">PLZ + Ort + Land</label>
                <input className="input" value={form.postalCityCountry} onChange={(e) => setForm({ ...form, postalCityCountry: e.target.value })} />
              </div>
              <div className="field-row">
                <div className="field-group">
                  <label className="label">UID</label>
                  <input className="input" value={form.uid} onChange={(e) => setForm({ ...form, uid: e.target.value })} />
                </div>
                <div className="field-group">
                  <label className="label">Email</label>
                  <input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
              </div>
              <div className="field-group">
                <label className="label">Notizen</label>
                <textarea className="textarea" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
          )}

          {/* Summary Stats */}
          <div className="stat-row" style={{ marginBottom: "1.5rem" }}>
            <div className="stat">
              <div className="stat-label">Angebote</div>
              <div className="stat-value" style={{ fontSize: "1.25rem" }}>{angebots.length}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Aufträge</div>
              <div className="stat-value" style={{ fontSize: "1.25rem" }}>{auftrags.length}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Rechnungen</div>
              <div className="stat-value" style={{ fontSize: "1.25rem" }}>{rechnungen.length}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Umsatz gesamt</div>
              <div className="stat-value accent" style={{ fontSize: "1.25rem" }}>
                {money(rechnungen.filter((r: any) => r.status !== "storno").reduce((s: number, r: any) => s + (r.grossAmount || 0), 0))}
              </div>
            </div>
          </div>

          {/* Angebote */}
          <h4 style={{ marginBottom: "0.5rem" }}>Angebote ({angebots.length})</h4>
          {angebots.length === 0 ? (
            <p style={{ color: "var(--fg-3)", fontSize: "0.8125rem", marginBottom: "1rem" }}>Keine Angebote</p>
          ) : (
            <div className="table-wrap" style={{ marginBottom: "1rem" }}>
              <table>
                <thead><tr><th>Nummer</th><th>Datum</th><th>Brutto</th><th>Status</th></tr></thead>
                <tbody>
                  {angebots.map((a: any) => (
                    <tr key={a._id}>
                      <td style={{ fontWeight: 500 }}>{a.number}</td>
                      <td>{a.date}</td>
                      <td>{money(a.grossAmount)}</td>
                      <td>{statusBadge(a.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Aufträge */}
          <h4 style={{ marginBottom: "0.5rem" }}>Aufträge ({auftrags.length})</h4>
          {auftrags.length === 0 ? (
            <p style={{ color: "var(--fg-3)", fontSize: "0.8125rem", marginBottom: "1rem" }}>Keine Aufträge</p>
          ) : (
            <div className="table-wrap" style={{ marginBottom: "1rem" }}>
              <table>
                <thead><tr><th>Nummer</th><th>Datum</th><th>Brutto</th><th>Status</th><th>Rechnungen</th></tr></thead>
                <tbody>
                  {auftrags.map((a: any) => (
                    <tr key={a._id}>
                      <td style={{ fontWeight: 500 }}>{a.number}</td>
                      <td>{a.date}</td>
                      <td>{money(a.grossAmount)}</td>
                      <td>{statusBadge(a.status)}</td>
                      <td>{(a.rechnungIds?.length || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Rechnungen */}
          <h4 style={{ marginBottom: "0.5rem" }}>Rechnungen ({rechnungen.length})</h4>
          {rechnungen.length === 0 ? (
            <p style={{ color: "var(--fg-3)", fontSize: "0.8125rem", marginBottom: "1rem" }}>Keine Rechnungen</p>
          ) : (
            <div className="table-wrap" style={{ marginBottom: "1rem" }}>
              <table>
                <thead><tr><th>Nummer</th><th>Datum</th><th>Typ</th><th>Brutto</th><th>Status</th></tr></thead>
                <tbody>
                  {rechnungen.map((r: any) => (
                    <tr key={r._id}>
                      <td style={{ fontWeight: 500 }}>{r.number}</td>
                      <td>{r.date}</td>
                      <td><span className="badge">{r.type}</span></td>
                      <td>{money(r.grossAmount)}</td>
                      <td>{statusBadge(r.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Stornorechnungen */}
          {stornos.length > 0 && (
            <>
              <h4 style={{ marginBottom: "0.5rem" }}>Stornorechnungen ({stornos.length})</h4>
              <div className="table-wrap" style={{ marginBottom: "1rem" }}>
                <table>
                  <thead><tr><th>Nummer</th><th>Storno von</th><th>Brutto</th><th>Datum</th></tr></thead>
                  <tbody>
                    {stornos.map((s: any) => (
                      <tr key={s._id}>
                        <td style={{ fontWeight: 500, color: "var(--danger)" }}>{s.stornoNumber || s.number}</td>
                        <td>{s.stornoOf || "—"}</td>
                        <td>{money(s.grossAmount)}</td>
                        <td>{s.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Schließen</button>
        </div>
      </div>
    </div>
  );
}
