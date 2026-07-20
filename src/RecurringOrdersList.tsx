import { Fragment, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { EditRecurringOrderModal } from "./EditRecurringOrderModal";
import { RecurringOccurrenceHistory } from "./RecurringOccurrenceHistory";
import { money } from "./lib";

interface RecurringOrdersListProps {
  userId: string;
  sessionToken: string;
  plan: string;
  onCreate: () => void;
  onUpgrade: () => void;
  onOpenOrder?: (orderId: string) => void;
  focusTemplateId?: string | null;
}

function formatDate(isoDate?: string): string {
  if (!isoDate) return "—";
  const [year, month, day] = isoDate.split("-");
  return `${day}.${month}.${year}`;
}

function statusBadge(status: string) {
  const map: Record<string, { text: string; cls: string }> = {
    active: { text: "Aktiv", cls: "badge badge-success" },
    paused: { text: "Pausiert", cls: "badge badge-warn" },
    completed: { text: "Beendet", cls: "badge" },
    error: { text: "Fehler", cls: "badge badge-danger" },
  };
  const current = map[status] || { text: status, cls: "badge" };
  return <span className={current.cls}>{current.text}</span>;
}

function frequencyLabel(template: any): string {
  return template.frequency === "yearly" ? "Jährlich" : "Monatlich";
}

function templateGross(template: any): number {
  return (template.items || []).reduce((sum: number, item: any) => {
    const net = Number(item.qty || 0) * Number(item.unitPrice || 0);
    return sum + net + (net * Number(item.taxRate || 0)) / 100;
  }, 0);
}

export function RecurringOrdersList({
  userId,
  sessionToken,
  plan,
  onCreate,
  onUpgrade,
  onOpenOrder,
  focusTemplateId,
}: RecurringOrdersListProps) {
  const templatesQuery = useQuery(api.recurringOrders.listTemplates, { sessionToken });
  const access = useQuery(api.recurringOrderAccess.getAccess, { sessionToken });
  const templates = templatesQuery ?? [];
  const pauseTemplate = useMutation(api.recurringOrders.pauseTemplate);
  const resumeTemplate = useMutation(api.recurringOrders.resumeTemplate);
  const endTemplate = useMutation(api.recurringOrders.endTemplate);
  const skipNextOccurrence = useMutation(api.recurringOrders.skipNextOccurrence);

  const [filter, setFilter] = useState<"all" | "active" | "paused" | "error" | "completed">("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(focusTemplateId || null);
  const [editTemplate, setEditTemplate] = useState<any | null>(null);

  useEffect(() => {
    if (!focusTemplateId) return;
    setFilter("all");
    setExpandedId(focusTemplateId);
  }, [focusTemplateId]);

  if (templatesQuery === undefined || access === undefined) {
    return (
      <div className="empty-state" style={{ padding: "3rem 1.25rem", textAlign: "center" }} aria-live="polite">
        <h3>Wiederkehrende Aufträge werden geladen</h3>
        <p style={{ marginTop: "0.5rem" }}>Serien und nächste Termine werden abgerufen.</p>
      </div>
    );
  }

  const visibleTemplates = filter === "all"
    ? templates
    : templates.filter((template: any) => template.status === filter);

  const runAction = async (templateId: string, action: () => Promise<unknown>) => {
    setBusyId(templateId);
    setError("");
    try {
      await action();
    } catch (actionError: any) {
      setError(actionError.message || "Aktion konnte nicht ausgeführt werden.");
    } finally {
      setBusyId(null);
    }
  };

  const handlePause = (template: any) => runAction(template._id, () =>
    pauseTemplate({ sessionToken, templateId: template._id }),
  );

  const handleResume = (template: any) => runAction(template._id, () =>
    resumeTemplate({ sessionToken, templateId: template._id }),
  );

  const handleEnd = (template: any) => {
    if (!window.confirm(`Serie „${template.title}“ beenden? Bereits erzeugte Aufträge bleiben erhalten.`)) return;
    void runAction(template._id, () =>
      endTemplate({ sessionToken, templateId: template._id }),
    );
  };

  const handleSkip = (template: any) => {
    if (!template.nextOccurrenceDate) return;
    if (!window.confirm(`Den Termin am ${formatDate(template.nextOccurrenceDate)} überspringen?`)) return;
    void runAction(template._id, () =>
      skipNextOccurrence({
        sessionToken,
        templateId: template._id,
        expectedDate: template.nextOccurrenceDate,
      }),
    );
  };

  const actionButtons = (template: any) => (
    <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
      {template.status !== "completed" && (
        <button className="btn btn-sm" disabled={busyId === template._id} onClick={() => setEditTemplate(template)}>
          Bearbeiten
        </button>
      )}
      {template.status === "active" && (
        <button className="btn btn-sm" disabled={busyId === template._id} onClick={() => void handlePause(template)}>Pausieren</button>
      )}
      {(template.status === "paused" || template.status === "error") && (
        <button className="btn btn-sm" disabled={busyId === template._id} onClick={() => void handleResume(template)}>Fortsetzen</button>
      )}
      {(template.status === "active" || template.status === "paused") && template.nextOccurrenceDate && (
        <button className="btn btn-sm" disabled={busyId === template._id} onClick={() => handleSkip(template)}>Überspringen</button>
      )}
      {template.status !== "completed" && (
        <button className="btn btn-sm btn-ghost" disabled={busyId === template._id} onClick={() => handleEnd(template)}>Beenden</button>
      )}
    </div>
  );

  const expandedContent = (template: any) => (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div>
        <div style={{ fontSize: "0.6875rem", color: "var(--fg-3)", marginBottom: "0.5rem" }}>Vorlage für zukünftige Aufträge</div>
        <div style={{ display: "grid", gap: "0.375rem" }}>
          {template.items.map((item: any) => (
            <div key={item.pos} style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", fontSize: "0.75rem" }}>
              <span>{item.qty} {item.unit} · {item.description}</span>
              <strong>{money(item.qty * item.unitPrice)}</strong>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div style={{ fontSize: "0.6875rem", color: "var(--fg-3)", marginBottom: "0.5rem" }}>Ausführungshistorie</div>
        <RecurringOccurrenceHistory
          templateId={template._id}
          sessionToken={sessionToken}
          onOpenOrder={onOpenOrder}
        />
      </div>
    </div>
  );

  if (!access.allowed) {
    return (
      <div className="empty-state" style={{ padding: "3rem 1.25rem", textAlign: "center" }}>
        <h3>Wiederkehrende Aufträge</h3>
        <p style={{ maxWidth: "560px", margin: "0.5rem auto 0.5rem" }}>
          Automatisiere monatliche oder jährliche Leistungen. Zu jedem Termin entsteht ein neuer Auftrag als Entwurf.
        </p>
        <p style={{ maxWidth: "560px", margin: "0 auto 1rem", color: "var(--fg-3)", fontSize: "0.8125rem" }}>
          {access.reason || "Ein aktiver Starter- oder Pro-Tarif ist erforderlich."}
        </p>
        <button className="btn btn-primary" onClick={onUpgrade}>Tarif und Zahlung prüfen</button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center", flexWrap: "wrap", marginBottom: "1rem" }}>
        <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }} role="group" aria-label="Serien filtern">
          {([
            ["all", "Alle"],
            ["active", "Aktiv"],
            ["paused", "Pausiert"],
            ["error", "Fehler"],
            ["completed", "Beendet"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`btn btn-sm ${filter === value ? "btn-primary" : ""}`}
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
            >
              {label}
            </button>
          ))}
        </div>
        <button className="btn btn-primary" onClick={onCreate}>+ Wiederkehrender Auftrag</button>
      </div>

      {error && (
        <div role="alert" style={{ marginBottom: "1rem", padding: "0.75rem", border: "1px solid var(--danger)", color: "var(--danger)", background: "var(--surface-2)" }}>
          {error}
        </div>
      )}

      {visibleTemplates.length === 0 ? (
        <div className="empty-state" style={{ padding: "3rem 1.25rem", textAlign: "center" }}>
          <h3>{templates.length === 0 ? "Noch keine wiederkehrenden Aufträge" : "Keine Serien in diesem Status"}</h3>
          <p style={{ marginTop: "0.5rem" }}>
            {templates.length === 0
              ? "Lege eine monatliche oder jährliche Serie an. Neue Ausführungen starten immer als Entwurf."
              : "Wähle einen anderen Filter, um weitere Serien zu sehen."}
          </p>
          {templates.length === 0 && (
            <button className="btn btn-primary btn-sm" style={{ marginTop: "1rem" }} onClick={onCreate}>
              + Erste Serie anlegen
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Serie</th>
                  <th>Kunde</th>
                  <th>Rhythmus</th>
                  <th>Nächster Termin</th>
                  <th>Je Auftrag</th>
                  <th>Erzeugt</th>
                  <th>Status</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {visibleTemplates.map((template: any) => (
                  <Fragment key={template._id}>
                    <tr key={template._id}>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setExpandedId(expandedId === template._id ? null : template._id)}
                          style={{ padding: 0, justifyContent: "flex-start", textAlign: "left" }}
                          aria-expanded={expandedId === template._id}
                        >
                          {template.title}
                        </button>
                      </td>
                      <td>{template.recipientName}</td>
                      <td>{frequencyLabel(template)}</td>
                      <td>{formatDate(template.nextOccurrenceDate)}</td>
                      <td style={{ fontWeight: 600 }}>{money(templateGross(template))}</td>
                      <td>{template.generatedCount}</td>
                      <td>{statusBadge(template.status)}</td>
                      <td>{actionButtons(template)}</td>
                    </tr>
                    {expandedId === template._id && (
                      <tr key={`${template._id}-details`}>
                        <td colSpan={8} style={{ background: "var(--surface-2)", padding: "1rem" }}>
                          {expandedContent(template)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="data-cards">
            {visibleTemplates.map((template: any) => (
              <article key={template._id} className="data-card">
                <div className="data-card-header">
                  <div>
                    <div className="data-card-title">{template.title}</div>
                    <div className="data-card-meta">
                      <span>{template.recipientName}</span>
                      <span>·</span>
                      <span>{frequencyLabel(template)}</span>
                    </div>
                  </div>
                  <div>{statusBadge(template.status)}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginTop: "0.75rem" }}>
                  <div><div style={{ fontSize: "0.625rem", color: "var(--fg-3)" }}>Nächster Termin</div><div style={{ fontSize: "0.8125rem", fontWeight: 600 }}>{formatDate(template.nextOccurrenceDate)}</div></div>
                  <div><div style={{ fontSize: "0.625rem", color: "var(--fg-3)" }}>Je Auftrag</div><div style={{ fontSize: "0.8125rem", fontWeight: 600 }}>{money(templateGross(template))}</div></div>
                  <div><div style={{ fontSize: "0.625rem", color: "var(--fg-3)" }}>Erzeugte Aufträge</div><div style={{ fontSize: "0.8125rem", fontWeight: 600 }}>{template.generatedCount}</div></div>
                  <div><div style={{ fontSize: "0.625rem", color: "var(--fg-3)" }}>Beginn</div><div style={{ fontSize: "0.8125rem", fontWeight: 600 }}>{formatDate(template.startDate)}</div></div>
                </div>
                {template.errorMessage && (
                  <div style={{ marginTop: "0.75rem", padding: "0.625rem", border: "1px solid var(--danger)", color: "var(--danger)", fontSize: "0.75rem" }}>
                    {template.errorMessage}
                  </div>
                )}
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  style={{ marginTop: "0.75rem" }}
                  onClick={() => setExpandedId(expandedId === template._id ? null : template._id)}
                  aria-expanded={expandedId === template._id}
                >
                  {expandedId === template._id ? "Details ausblenden" : "Details und Historie anzeigen"}
                </button>
                {expandedId === template._id && (
                  <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)" }}>
                    {expandedContent(template)}
                  </div>
                )}
                <div style={{ marginTop: "0.75rem" }}>{actionButtons(template)}</div>
              </article>
            ))}
          </div>
        </>
      )}

      {editTemplate && (
        <EditRecurringOrderModal
          template={editTemplate}
          userId={userId}
          sessionToken={sessionToken}
          onClose={() => setEditTemplate(null)}
        />
      )}
    </div>
  );
}
