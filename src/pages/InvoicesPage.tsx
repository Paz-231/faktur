import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { SmartInvoiceModal } from "../SmartInvoiceModal";
import { AuftragDetail } from "../AuftragDetail";
import { RecurringOrderModal } from "../RecurringOrderModal";
import { RecurringOrdersList } from "../RecurringOrdersList";
import { money } from "../lib";

interface InvoicesPageProps {
  userId: any;
  sessionToken: string;
  plan: string;
  onUpgrade: () => void;
}

export function InvoicesPage({
  userId,
  sessionToken,
  plan,
  onUpgrade,
}: InvoicesPageProps) {
  const [view, setView] = useState<"orders" | "recurring">("orders");
  const [showCreate, setShowCreate] = useState(false);
  const [showRecurringCreate, setShowRecurringCreate] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [focusTemplateId, setFocusTemplateId] = useState<string | null>(null);

  const auftrags = useQuery(
    api.auftrags.list,
    view === "orders" ? { userId, sessionToken } : "skip",
  ) ?? [];

  const statusBadge = (status: string) => {
    const map: Record<string, { text: string; cls: string }> = {
      draft: { text: "Entwurf", cls: "badge" },
      confirmed: { text: "Bestätigt", cls: "badge badge-success" },
      discarded: { text: "Verworfen", cls: "badge badge-danger" },
    };
    const current = map[status] || { text: status, cls: "badge" };
    return <span className={current.cls}>{current.text}</span>;
  };

  const openOrder = (orderId: string) => {
    setView("orders");
    setDetailId(orderId);
  };

  const openRecurringTemplate = (templateId: string) => {
    setDetailId(null);
    setFocusTemplateId(templateId);
    setView("recurring");
  };

  const switchView = (nextView: "orders" | "recurring") => {
    setView(nextView);
    if (nextView === "orders") setFocusTemplateId(null);
  };

  return (
    <div className="slide-up">
      <div className="page-header" style={{ alignItems: "flex-end", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h1 className="page-title">Aufträge</h1>
          <div style={{ display: "flex", gap: "0.375rem", marginTop: "0.75rem" }} role="tablist" aria-label="Auftragsansicht">
            <button
              type="button"
              role="tab"
              aria-selected={view === "orders"}
              className={`btn btn-sm ${view === "orders" ? "btn-primary" : ""}`}
              onClick={() => switchView("orders")}
            >
              Aufträge
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "recurring"}
              className={`btn btn-sm ${view === "recurring" ? "btn-primary" : ""}`}
              onClick={() => switchView("recurring")}
            >
              Wiederkehrend
            </button>
          </div>
        </div>
        {view === "orders" && (
          <div className="page-actions">
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              + Neuer Auftrag
            </button>
          </div>
        )}
      </div>

      {view === "recurring" ? (
        <RecurringOrdersList
          userId={userId}
          sessionToken={sessionToken}
          plan={plan}
          onCreate={() => setShowRecurringCreate(true)}
          onUpgrade={onUpgrade}
          onOpenOrder={openOrder}
          focusTemplateId={focusTemplateId}
        />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nummer</th>
                  <th>Datum</th>
                  <th>Kunde</th>
                  <th>Brutto</th>
                  <th>Status</th>
                  <th>Quelle</th>
                  <th>Angebot</th>
                  <th>Rechnung</th>
                </tr>
              </thead>
              <tbody>
                {auftrags.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
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
                      <td>
                        {auftrag.createdAutomatically
                          ? <span className="badge badge-accent">Automatisch</span>
                          : "Manuell"}
                      </td>
                      <td>{auftrag.angebotId ? "Ja" : "—"}</td>
                      <td>{(auftrag.rechnungIds?.length || 0) > 0 ? auftrag.rechnungIds.length : "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

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
                    {auftrag.createdAutomatically && <span>· Automatisch erstellt</span>}
                    {auftrag.scheduledFor && <span>· Termin {auftrag.scheduledFor.split("-").reverse().join(".")}</span>}
                    {auftrag.angebotId && <span>· Angebot ja</span>}
                    {(auftrag.rechnungIds?.length || 0) > 0 && <span>· {auftrag.rechnungIds.length} Rechnung(en)</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {showCreate && (
        <SmartInvoiceModal
          userId={userId}
          sessionToken={sessionToken}
          onClose={() => setShowCreate(false)}
        />
      )}

      {showRecurringCreate && (
        <RecurringOrderModal
          userId={userId}
          sessionToken={sessionToken}
          plan={plan}
          onClose={() => setShowRecurringCreate(false)}
          onCreated={() => {
            setFocusTemplateId(null);
            setView("recurring");
          }}
          onUpgrade={onUpgrade}
        />
      )}

      {detailId && (
        <AuftragDetail
          auftragId={detailId}
          userId={userId}
          sessionToken={sessionToken}
          onClose={() => setDetailId(null)}
          onRefresh={() => {}}
          onOpenRecurring={openRecurringTemplate}
        />
      )}
    </div>
  );
}
