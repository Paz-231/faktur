import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../convex/_generated/api";

interface AuftragDetailProps {
  auftragId: string;
  userId: string;
  onClose: () => void;
  onRefresh: () => void;
}

type DocKind = "rechnung" | "angebot" | "auftrag";

interface SendTarget {
  kind: DocKind;
  docId: string;
  number: string;
  label: string; // "Rechnung" | "Honorarnote" | "Angebot" | "Auftragsbestätigung"
}

const TAX_LABELS: Record<string, string> = {
  kleinunternehmer: "Kleinunternehmer (0%)",
  ust_standard: "USt-pflichtig (20%/19%)",
  ust_ermaessigt: "Ermäßigt (10%/7%)",
  reverse_charge: "Reverse Charge (0%)",
  befreit: "Befreit (0%)",
};

export function AuftragDetail({ auftragId, userId, onClose, onRefresh }: AuftragDetailProps) {
  const detail = useQuery(api.auftrags.getDetail, { auftragId: auftragId as any });
  const settings = useQuery(api.settings.get, { userId: userId as any });
  const profile = useQuery(api.profile.get, { userId: userId as any });

  const createAngebot = useMutation(api.auftrags.createAngebotFromAuftrag);
  const createRechnung = useMutation(api.auftrags.createRechnungFromAuftrag);
  const confirmAuftrag = useMutation(api.auftrags.confirm);
  const discardAuftrag = useMutation(api.auftrags.discard);
  const angebotMarkSent = useMutation(api.angebots.markSent);
  const angebotConfirm = useMutation(api.angebots.confirm);
  const stornoRechnung = useMutation(api.invoices.storno);
  const generatePdfUrl = useAction(api.documents.generatePdfUrl);

  const [loading, setLoading] = useState<string | null>(null);
  const [sendTarget, setSendTarget] = useState<SendTarget | null>(null);

  // Kunden-Email für die Vorbelegung des Versand-Dialogs
  const customer = useQuery(
    api.customers.getById,
    detail?.auftrag?.customerId ? { customerId: detail.auftrag.customerId } : "skip"
  );

  const handleOpenPdf = async (kind: DocKind, docId: string) => {
    setLoading(`pdf-${docId}`);
    try {
      const { url } = await generatePdfUrl({ kind, docId });
      window.open(url, "_blank");
    } catch (err: any) {
      alert(err.message || "PDF konnte nicht erstellt werden");
    } finally {
      setLoading(null);
    }
  };

  const money = (v: number) => `€ ${(v || 0).toFixed(2).replace(".", ",")}`;

  if (!detail) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-body">Lade...</div>
        </div>
      </div>
    );
  }

  const { auftrag, angebot, rechnungen, stornos } = detail;

  if (!auftrag) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-body">Auftrag nicht gefunden</div>
        </div>
      </div>
    );
  }

  const handleConfirm = async () => {
    setLoading("confirm");
    try {
      await confirmAuftrag({ auftragId: auftragId as any });
      // If auto mode, also create rechnung
      if (settings?.rechnungMode === "auto") {
        await createRechnung({ auftragId: auftragId as any, type: "Rechnung" });
      }
      onRefresh();
    } finally {
      setLoading(null);
    }
  };

  const handleDiscard = async () => {
    setLoading("discard");
    try {
      await discardAuftrag({ auftragId: auftragId as any });
      onRefresh();
      onClose();
    } finally {
      setLoading(null);
    }
  };

  const handleCreateAngebot = async () => {
    setLoading("angebot");
    try {
      await createAngebot({ auftragId: auftragId as any });
      onRefresh();
    } finally {
      setLoading(null);
    }
  };

  const handleCreateRechnung = async () => {
    setLoading("rechnung");
    try {
      await createRechnung({ auftragId: auftragId as any, type: "Rechnung" });
      onRefresh();
    } finally {
      setLoading(null);
    }
  };

  const handleStorno = async (rechnungId: string, originalNumber: string) => {
    if (!confirm(`Rechnung ${originalNumber} stornieren? Eine Stornorechnung wird erstellt.`)) return;
    setLoading(`storno-${rechnungId}`);
    try {
      await stornoRechnung({ invoiceId: rechnungId as any });
      onRefresh();
    } catch (err: any) {
      alert(err.message || "Storno fehlgeschlagen");
    } finally {
      setLoading(null);
    }
  };

  const handleAngebotSend = async () => {
    if (!angebot) return;
    setLoading("angebot-send");
    try {
      await angebotMarkSent({ angebotId: angebot._id });
      onRefresh();
    } finally {
      setLoading(null);
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { text: string; cls: string }> = {
      draft: { text: "Entwurf", cls: "badge" },
      final: { text: "Final", cls: "badge badge-success" },
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720, maxHeight: "90vh", overflowY: "auto" }}>
        {/* Header */}
        <div className="modal-header">
          <div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>{auftrag.number}</h2>
            <div style={{ fontSize: "0.75rem", color: "var(--fg-3)", marginTop: "0.25rem" }}>
              Auftrag · {auftrag.date} · {statusBadge(auftrag.status)}
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Kundendaten */}
          <h4>Kundendaten</h4>
          <div style={{ background: "var(--surface-2)", padding: "1rem", border: "1px solid var(--border)", marginBottom: "1.5rem" }}>
            <div style={{ fontWeight: 500, marginBottom: "0.25rem" }}>{auftrag.recipientName}</div>
            <div style={{ fontSize: "0.8125rem", color: "var(--fg-2)" }}>{auftrag.recipientStreet}</div>
            <div style={{ fontSize: "0.8125rem", color: "var(--fg-2)" }}>{auftrag.recipientCity}</div>
            {auftrag.recipientUid && (
              <div style={{ fontSize: "0.75rem", color: "var(--fg-3)", marginTop: "0.25rem" }}>UID: {auftrag.recipientUid}</div>
            )}
          </div>

          {/* Positionen */}
          <h4>Positionen</h4>
          <div className="table-wrap" style={{ marginBottom: "1.5rem" }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Beschreibung</th>
                  <th>Menge</th>
                  <th>Einheit</th>
                  <th>Preis/Einh.</th>
                  <th>Gesamt</th>
                </tr>
              </thead>
              <tbody>
                {auftrag.items.map((item: any) => (
                  <tr key={item.pos}>
                    <td>{item.pos}</td>
                    <td>{item.description}</td>
                    <td>{item.qty}</td>
                    <td>{item.unit}</td>
                    <td>{money(item.unitPrice)}</td>
                    <td style={{ fontWeight: 500 }}>{money(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1.5rem" }}>
            <div style={{ minWidth: 200 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "0.25rem 0" }}>
                <span style={{ color: "var(--fg-3)", fontSize: "0.8125rem" }}>Netto</span>
                <span style={{ fontSize: "0.8125rem" }}>{money(auftrag.netAmount)}</span>
              </div>
              {auftrag.vatAmount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "0.25rem 0" }}>
                  <span style={{ color: "var(--fg-3)", fontSize: "0.8125rem" }}>USt ({auftrag.taxRate}%)</span>
                  <span style={{ fontSize: "0.8125rem" }}>{money(auftrag.vatAmount)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, borderTop: "1px solid var(--border)", paddingTop: "0.5rem", marginTop: "0.25rem" }}>
                <span>Gesamt</span>
                <span style={{ color: "var(--accent)" }}>{money(auftrag.grossAmount)}</span>
              </div>
              <div style={{ fontSize: "0.6875rem", color: "var(--fg-3)", marginTop: "0.5rem" }}>
                {TAX_LABELS[auftrag.taxMode] || auftrag.taxMode}
              </div>
            </div>
          </div>

          {/* Auftrag Actions */}
          {auftrag.status === "draft" && (
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
              <button className="btn btn-primary" onClick={handleConfirm} disabled={loading === "confirm"}>
                {loading === "confirm" ? "Bestätige..." : "· Auftrag bestätigen"}
              </button>
              <button className="btn" onClick={handleDiscard} disabled={loading === "discard"} style={{ color: "var(--danger)" }}>
                {loading === "discard" ? "Verwerfe..." : "Verwerfen"}
              </button>
            </div>
          )}
          {auftrag.status === "confirmed" && (
            <div style={{ marginBottom: "1.5rem", padding: "0.75rem", background: "var(--surface-2)", border: "1px solid var(--success)", fontSize: "0.8125rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                <span>
                  Auftrag bestätigt am {auftrag.confirmedDate}
                  {settings?.rechnungMode === "auto" && " · Rechnung automatisch generiert"}
                  {auftrag.sentDate && ` · Bestätigung gesendet: ${auftrag.sentDate}`}
                </span>
                <span style={{ display: "flex", gap: "0.5rem" }}>
                  <button className="btn btn-sm" onClick={() => handleOpenPdf("auftrag", auftrag._id)} disabled={loading === `pdf-${auftrag._id}`}>
                    {loading === `pdf-${auftrag._id}` ? "Erstelle..." : "PDF"}
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={() => setSendTarget({ kind: "auftrag", docId: auftrag._id, number: auftrag.number, label: "Auftragsbestätigung" })}
                  >
                    Per Email senden
                  </button>
                </span>
              </div>
            </div>
          )}

          {/* Angebot Section */}
          <h4>Angebot</h4>
          {!angebot ? (
            <div style={{ padding: "1rem", background: "var(--surface-2)", border: "1px solid var(--border)", marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.8125rem", color: "var(--fg-3)" }}>Noch kein Angebot erstellt</span>
              <button className="btn btn-sm" onClick={handleCreateAngebot} disabled={loading === "angebot"}>
                {loading === "angebot" ? "Erstelle..." : "+ Angebot erstellen"}
              </button>
            </div>
          ) : (
            <div style={{ padding: "1rem", background: "var(--surface-2)", border: "1px solid var(--border)", marginBottom: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <div>
                  <span style={{ fontWeight: 500 }}>{angebot.number}</span>
                  <span style={{ marginLeft: "0.5rem" }}>{statusBadge(angebot.status)}</span>
                </div>
                <div style={{ fontWeight: 600, color: "var(--accent)" }}>{money(angebot.grossAmount)}</div>
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--fg-3)" }}>
                Erstellt: {angebot.date}
                {angebot.sentDate && ` · Gesendet: ${angebot.sentDate}${angebot.sentTo ? ` an ${angebot.sentTo}` : ""}`}
                {angebot.confirmedDate && ` · Bestätigt: ${angebot.confirmedDate}`}
              </div>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
                <button className="btn btn-sm" onClick={() => handleOpenPdf("angebot", angebot._id)} disabled={loading === `pdf-${angebot._id}`}>
                  {loading === `pdf-${angebot._id}` ? "Erstelle..." : "PDF"}
                </button>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => setSendTarget({ kind: "angebot", docId: angebot._id, number: angebot.number, label: "Angebot" })}
                >
                  Per Email senden
                </button>
                {angebot.status === "draft" && (
                  <button className="btn btn-sm btn-ghost" onClick={handleAngebotSend} disabled={loading === "angebot-send"} title="Ohne Email nur den Status auf 'Gesendet' setzen">
                    {loading === "angebot-send" ? "..." : "Als gesendet markieren"}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Rechnung Section */}
          <h4>Rechnung{rechnungen.length > 1 ? "en" : ""}</h4>
          {rechnungen.length === 0 ? (
            <div style={{ padding: "1rem", background: "var(--surface-2)", border: "1px solid var(--border)", marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.8125rem", color: "var(--fg-3)" }}>
                {auftrag.status === "confirmed"
                  ? "Noch keine Rechnung erstellt"
                  : "Auftrag muss bestätigt werden"}
              </span>
              {auftrag.status === "confirmed" && (
                <button className="btn btn-sm btn-primary" onClick={handleCreateRechnung} disabled={loading === "rechnung"}>
                  {loading === "rechnung" ? "Erstelle..." : "+ Rechnung erstellen"}
                </button>
              )}
            </div>
          ) : (
            <div style={{ marginBottom: "1.5rem" }}>
              {rechnungen.map((r: any) => (
                <div key={r._id} style={{ padding: "1rem", background: "var(--surface-2)", border: "1px solid var(--border)", marginBottom: "0.5rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ fontWeight: 500 }}>{r.number}</span>
                      <span style={{ marginLeft: "0.5rem" }}>{statusBadge(r.status)}</span>
                      {r.stornoNumber && (
                        <span style={{ marginLeft: "0.5rem" }} className="badge badge-danger">Storno: {r.stornoNumber}</span>
                      )}
                    </div>
                    <div style={{ fontWeight: 600 }}>{money(r.grossAmount)}</div>
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--fg-3)", marginTop: "0.25rem" }}>
                    {r.type} · {r.date}
                    {r.paidDate && ` · Bezahlt: ${r.paidDate}`}
                    {r.sentDate && ` · Gesendet: ${r.sentDate}${r.sentTo ? ` an ${r.sentTo}` : ""}`}
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                    <button className="btn btn-sm" onClick={() => handleOpenPdf("rechnung", r._id)} disabled={loading === `pdf-${r._id}`}>
                      {loading === `pdf-${r._id}` ? "Erstelle..." : "PDF"}
                    </button>
                    {r.status !== "storno" && !r.stornoOf && (
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => setSendTarget({ kind: "rechnung", docId: r._id, number: r.number, label: r.type || "Rechnung" })}
                      >
                        Per Email senden
                      </button>
                    )}
                    {/* Storno Button — nur für final/paid Rechnungen */}
                    {(r.status === "final" || r.status === "paid") && !r.stornoOf && (
                      <button
                        className="btn btn-sm"
                        style={{ color: "var(--danger)" }}
                        onClick={() => handleStorno(r._id, r.number)}
                        disabled={loading === `storno-${r._id}`}
                      >
                        {loading === `storno-${r._id}` ? "Storniere..." : "Storno erstellen"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {auftrag.status === "confirmed" && (
                <button className="btn btn-sm" onClick={handleCreateRechnung} disabled={loading === "rechnung"} style={{ marginTop: "0.5rem" }}>
                  {loading === "rechnung" ? "Erstelle..." : "+ Weitere Rechnung (Teilrechnung)"}
                </button>
              )}
            </div>
          )}

          {/* Storno Section */}
          {stornos.length > 0 && (
            <>
              <h4>Stornorechnung{stornos.length > 1 ? "en" : ""}</h4>
              <div style={{ marginBottom: "1.5rem" }}>
                {stornos.map((s: any) => (
                  <div key={s._id} style={{ padding: "1rem", background: "var(--surface-2)", border: "1px solid var(--danger)", marginBottom: "0.5rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span style={{ fontWeight: 500 }}>{s.stornoNumber || s.number}</span>
                        <span style={{ marginLeft: "0.5rem" }} className="badge badge-danger">Storno</span>
                      </div>
                      <div style={{ fontWeight: 600 }}>{money(s.grossAmount)}</div>
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--fg-3)", marginTop: "0.25rem" }}>
                      {s.stornoOf ? `Storno von ${s.stornoOf}` : `Original storniert`}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Schließen</button>
        </div>
      </div>

      {/* Versand-Dialog (im Modal-DOM, stopPropagation verhindert Schließen) */}
      {sendTarget && (
        <SendDocumentModal
          target={sendTarget}
          defaultTo={customer?.email || ""}
          senderName={profile?.name || ""}
          onClose={() => setSendTarget(null)}
          onSent={() => {
            setSendTarget(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Versand-Dialog — PDF wird serverseitig erzeugt und per
// Email (Resend) mit Anhang an den Kunden geschickt
// ═══════════════════════════════════════════════════════════
function SendDocumentModal({
  target,
  defaultTo,
  senderName,
  onClose,
  onSent,
}: {
  target: SendTarget;
  defaultTo: string;
  senderName: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const sendByEmail = useAction(api.documents.sendByEmail);
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(
    `${target.label} ${target.number}${senderName ? ` — ${senderName}` : ""}`
  );
  const [message, setMessage] = useState(
    `Sehr geehrte Damen und Herren,\n\nanbei erhalten Sie ${
      target.label === "Angebot" ? "unser Angebot" :
      target.label === "Auftragsbestätigung" ? "die Auftragsbestätigung" :
      `die ${target.label}`
    } ${target.number} als PDF.\n\nBei Fragen stehen wir gerne zur Verfügung.\n\nMit freundlichen Grüßen${senderName ? `\n${senderName}` : ""}`
  );
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const handleSend = async () => {
    setError("");
    if (!to.includes("@")) {
      setError("Bitte eine gültige Email-Adresse eingeben.");
      return;
    }
    setSending(true);
    try {
      await sendByEmail({
        kind: target.kind,
        docId: target.docId,
        to: to.trim(),
        subject,
        message,
      });
      onSent();
    } catch (err: any) {
      setError(err.message || "Versand fehlgeschlagen");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600 }}>{target.label} {target.number} senden</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="field-group">
            <label className="label">Empfänger-Email</label>
            <input
              className="input"
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="kunde@email.at"
              autoFocus={!defaultTo}
            />
            {!defaultTo && (
              <div style={{ fontSize: "0.6875rem", color: "var(--fg-3)", marginTop: "0.375rem" }}>
                Tipp: Hinterlege die Email beim Kunden, dann ist sie hier vorausgefüllt.
              </div>
            )}
          </div>
          <div className="field-group">
            <label className="label">Betreff</label>
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="field-group">
            <label className="label">Nachricht</label>
            <textarea
              className="textarea"
              rows={8}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <div style={{ padding: "0.625rem 0.75rem", background: "var(--surface-2)", border: "1px solid var(--border)", fontSize: "0.75rem", color: "var(--fg-3)" }}>
            Das PDF wird automatisch erzeugt und als Anhang mitgeschickt.
          </div>
          {error && (
            <div style={{ marginTop: "0.75rem", padding: "0.75rem", border: "1px solid var(--danger)", color: "var(--danger)", fontSize: "0.8125rem" }}>
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose} disabled={sending}>Abbrechen</button>
          <button className="btn btn-primary" onClick={handleSend} disabled={sending}>
            {sending ? "Sende..." : "Jetzt senden"}
          </button>
        </div>
      </div>
    </div>
  );
}
