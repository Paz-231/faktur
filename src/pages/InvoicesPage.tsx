import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { SmartInvoiceModal } from "../SmartInvoiceModal";
import { AuftragDetail } from "../AuftragDetail";
import { money } from "../lib";

// ═══════════════════════════════════════════════════════════
// Aufträge Page — Source of Truth, mit Detail-Ansicht
// ═══════════════════════════════════════════════════════════
export function InvoicesPage({ userId, sessionToken }: { userId: any; sessionToken: string }) {
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const auftrags = useQuery(api.auftrags.list, { userId, sessionToken }) ?? [];

  const statusBadge = (status: string) => {
    const map: Record<string, { text: string; cls: string }> = {
      draft: { text: "Entwurf", cls: "badge" },
      confirmed: { text: "Bestätigt", cls: "badge badge-success" },
      discarded: { text: "Verworfen", cls: "badge badge-danger" },
    };
    const s = map[status] || { text: status, cls: "badge" };
    return <span className={s.cls}>{s.text}</span>;
  };

  return (
    <div className="slide-up">
      <div className="page-header">
        <h1 className="page-title">Aufträge</h1>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + Neuer Auftrag
          </button>
        </div>
      </div>

      {/* Desktop: Table */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nummer</th>
              <th>Datum</th>
              <th>Kunde</th>
              <th>Brutto</th>
              <th>Status</th>
              <th>Angebot</th>
              <th>Rechnung</th>
            </tr>
          </thead>
          <tbody>
            {auftrags.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">
                    <h3>Keine Aufträge</h3>
                    <p>Erstelle deinen ersten Auftrag — daraus entsteht später die Rechnung.</p>
                    <button className="btn btn-primary btn-sm" style={{ marginTop: "1rem" }} onClick={() => setShowCreate(true)}>
                      + Neuer Auftrag
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              auftrags.map((auftrag: any) => (
                <tr key={auftrag._id} onClick={() => setDetailId(auftrag._id)}>
                  <td style={{ fontWeight: 500 }}>{auftrag.number}</td>
                  <td>{auftrag.date}</td>
                  <td>{auftrag.recipientName}</td>
                  <td style={{ fontWeight: 600 }}>{money(auftrag.grossAmount)}</td>
                  <td>{statusBadge(auftrag.status)}</td>
                  <td>{auftrag.angebotId ? "Ja" : "—"}</td>
                  <td>{(auftrag.rechnungIds?.length || 0) > 0 ? auftrag.rechnungIds.length : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile: Card List */}
      <div className="data-cards">
        {auftrags.length === 0 ? (
          <div className="empty-state" style={{ padding: "2rem 1rem", textAlign: "center" }}>
            <h3>Keine Aufträge</h3>
            <p>Erstelle deinen ersten Auftrag.</p>
            <button className="btn btn-primary btn-sm" style={{ marginTop: "1rem" }} onClick={() => setShowCreate(true)}>
              + Neuer Auftrag
            </button>
          </div>
        ) : (
          auftrags.map((auftrag: any) => (
            <div key={auftrag._id} className="data-card" onClick={() => setDetailId(auftrag._id)}>
              <div className="data-card-header">
                <div>
                  <div className="data-card-title">{auftrag.number}</div>
                  <div className="data-card-meta">
                    <span>{auftrag.date}</span>
                    <span>·</span>
                    <span>{auftrag.recipientName}</span>
                  </div>
                </div>
                <div className="data-card-amount">{money(auftrag.grossAmount)}</div>
              </div>
              <div className="data-card-meta">
                <span>{statusBadge(auftrag.status)}</span>
                {auftrag.angebotId && <span>· Angebot ja</span>}
                {(auftrag.rechnungIds?.length || 0) > 0 && <span>· {auftrag.rechnungIds.length} Rechnung(en)</span>}
              </div>
            </div>
          ))
        )}
      </div>

      {showCreate && (
        <SmartInvoiceModal
          userId={userId}
          sessionToken={sessionToken}
          onClose={() => setShowCreate(false)}
        />
      )}

      {detailId && (
        <AuftragDetail
          auftragId={detailId}
          userId={userId}
          sessionToken={sessionToken}
          onClose={() => setDetailId(null)}
          onRefresh={() => {}}
        />
      )}
    </div>
  );
}
