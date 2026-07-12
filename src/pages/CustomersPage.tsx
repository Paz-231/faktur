import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { CustomerDetail } from "../CustomerDetail";

// ═══════════════════════════════════════════════════════════
// Customers Page — Liste + Detail + Bearbeiten
// ═══════════════════════════════════════════════════════════
export function CustomersPage({ userId, sessionToken }: { userId: any; sessionToken: string }) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", street: "", city: "", uid: "", email: "" });

  const customers = useQuery(api.customers.list, { userId, sessionToken }) ?? [];
  const createCustomer = useMutation(api.customers.create);

  const handleAdd = async () => {
    if (!newCustomer.name) return;
    await createCustomer({
      userId: userId as any,
      sessionToken,
      name: newCustomer.name,
      street: newCustomer.street || undefined,
      postalCityCountry: newCustomer.city || undefined,
      uid: newCustomer.uid || undefined,
      email: newCustomer.email || undefined,
    });
    setNewCustomer({ name: "", street: "", city: "", uid: "", email: "" });
    setShowAdd(false);
  };

  return (
    <div className="slide-up">
      <div className="page-header">
        <h1 className="page-title">Kunden</h1>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? "× Schließen" : "+ Neuer Kunde"}
          </button>
        </div>
      </div>

      {/* Add Form */}
      {showAdd && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <h4 style={{ marginBottom: "1rem" }}>Neuer Kunde</h4>
          <div className="field-group">
            <label className="label">Name / Firma</label>
            <input className="input" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} placeholder="Kunde GmbH" />
          </div>
          <div className="field-group">
            <label className="label">Straße</label>
            <input className="input" value={newCustomer.street} onChange={(e) => setNewCustomer({ ...newCustomer, street: e.target.value })} placeholder="Musterstraße 1" />
          </div>
          <div className="field-row">
            <div className="field-group">
              <label className="label">PLZ + Ort + Land</label>
              <input className="input" value={newCustomer.city} onChange={(e) => setNewCustomer({ ...newCustomer, city: e.target.value })} placeholder="1010 Wien, Österreich" />
            </div>
            <div className="field-group">
              <label className="label">UID</label>
              <input className="input" value={newCustomer.uid} onChange={(e) => setNewCustomer({ ...newCustomer, uid: e.target.value })} placeholder="ATU..." />
            </div>
          </div>
          <div className="field-group">
            <label className="label">Email</label>
            <input className="input" value={newCustomer.email} onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} placeholder="kunde@email.at" />
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleAdd} style={{ marginTop: "0.5rem" }}>Kunde anlegen</button>
        </div>
      )}

      {/* Customer Table — Desktop */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Adresse</th>
              <th>UID</th>
              <th>Email</th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <div className="empty-state">
                    <h3>Keine Kunden</h3>
                    <p>Lege deinen ersten Kunden an.</p>
                    <button className="btn btn-primary btn-sm" style={{ marginTop: "1rem" }} onClick={() => setShowAdd(true)}>
                      + Neuer Kunde
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              customers.map((c: any) => (
                <tr key={c._id} onClick={() => setDetailId(c._id)}>
                  <td style={{ fontWeight: 500 }}>{c.name}</td>
                  <td>{[c.street, c.postalCityCountry].filter(Boolean).join(", ") || "—"}</td>
                  <td>{c.uid || "—"}</td>
                  <td>{c.email || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile: Card List */}
      <div className="data-cards">
        {customers.length === 0 ? (
          <div className="empty-state" style={{ padding: "2rem 1rem", textAlign: "center" }}>
            <h3>Keine Kunden</h3>
            <p>Lege deinen ersten Kunden an.</p>
            <button className="btn btn-primary btn-sm" style={{ marginTop: "1rem" }} onClick={() => setShowAdd(true)}>
              + Neuer Kunde
            </button>
          </div>
        ) : (
          customers.map((c: any) => (
            <div key={c._id} className="data-card" onClick={() => setDetailId(c._id)}>
              <div className="data-card-header">
                <div>
                  <div className="data-card-title">{c.name}</div>
                  <div className="data-card-meta">
                    {[c.street, c.postalCityCountry].filter(Boolean).join(", ") || ""}
                  </div>
                </div>
              </div>
              <div className="data-card-meta">
                {c.uid && <span>UID: {c.uid}</span>}
                {c.email && <><span>·</span><span>{c.email}</span></>}
              </div>
            </div>
          ))
        )}
      </div>

      {detailId && (
        <CustomerDetail
          customerId={detailId}
          userId={userId}
          sessionToken={sessionToken}
          onClose={() => setDetailId(null)}
          onRefresh={() => {}}
        />
      )}
    </div>
  );
}
