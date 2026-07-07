import { useState, useEffect } from "react";
import { convexSiteUrl } from "./lib";

export function SkillDownloadPage({ token }: { token: string }) {
  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${convexSiteUrl()}/getDownloadInfo?token=${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setInfo(data);
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Verbindung fehlgeschlagen");
        setLoading(false);
      });
  }, [token]);

  if (loading) {
    return (
      <div className="modal-overlay" onClick={() => window.location.hash = ""}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-body" style={{ textAlign: "center" }}>
            <p style={{ color: "var(--fg-3)" }}>Lade Download-Info...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="modal-overlay" onClick={() => window.location.hash = ""}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
          <div className="modal-header">
            <h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Download</h2>
            <button className="btn btn-ghost btn-icon" onClick={() => window.location.hash = ""}>×</button>
          </div>
          <div className="modal-body" style={{ textAlign: "center" }}>
            <p style={{ color: "var(--danger)" }}>{error}</p>
            <p style={{ color: "var(--fg-3)", fontSize: "0.75rem", marginTop: "0.5rem" }}>
              Token ungültig oder abgelaufen. Kontaktiere paz@faktox.online
            </p>
          </div>
        </div>
      </div>
    );
  }

  const latest = info?.latest;
  const allVersions = info?.allVersions || [];
  const convexUrl = convexSiteUrl();

  return (
    <div className="modal-overlay" onClick={() => window.location.hash = ""}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, maxHeight: "90vh", overflowY: "auto" }}>
        <div className="modal-header">
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Skill Downloads</h2>
          <button className="btn btn-ghost btn-icon" onClick={() => window.location.hash = ""}>×</button>
        </div>

        <div className="modal-body">
          {/* Purchase Info */}
          <div style={{ padding: "0.75rem", background: "var(--surface-2)", border: "1px solid var(--border)", marginBottom: "1.5rem", fontSize: "0.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
              <span style={{ color: "var(--fg-3)" }}>Email</span>
              <span>{info?.email}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--fg-3)" }}>Gekauft am</span>
              <span>{info?.purchasedAt ? new Date(info.purchasedAt).toLocaleDateString("de-AT") : "—"}</span>
            </div>
          </div>

          {/* Latest Version Download */}
          {latest && (
            <div className="card" style={{ marginBottom: "1.5rem", borderColor: "var(--accent)" }}>
              <span className="feature-label">AKTUELLSTE VERSION</span>
              <h3 style={{ fontSize: "1.25rem", fontWeight: 700, marginTop: "0.5rem" }}>v{latest.version}</h3>
              <p style={{ fontSize: "0.8125rem", color: "var(--fg-2)", marginTop: "0.25rem" }}>{latest.description}</p>
              <div style={{ fontSize: "0.6875rem", color: "var(--fg-4)", marginTop: "0.5rem" }}>
                {latest.fileName} · {(latest.sizeBytes / 1024).toFixed(0)}KB · {new Date(latest.createdAt).toLocaleDateString("de-AT")}
              </div>
              {latest.releaseNotes && (
                <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: "var(--surface-2)", border: "1px solid var(--border)", fontSize: "0.75rem", color: "var(--fg-2)", whiteSpace: "pre-wrap" }}>
                  {latest.releaseNotes}
                </div>
              )}
              <a
                href={`${convexUrl}/downloadSkill?token=${token}`}
                className="btn btn-primary"
                style={{ display: "inline-flex", marginTop: "1rem", textDecoration: "none" }}
              >
                Aktuellste Version herunterladen
              </a>
            </div>
          )}

          {/* All Versions */}
          <h4 style={{ marginBottom: "0.75rem" }}>Alle Versionen</h4>
          {allVersions.length === 0 ? (
            <p style={{ color: "var(--fg-3)", fontSize: "0.8125rem" }}>Noch keine Versionen verfügbar.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Datum</th>
                    <th>Größe</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {allVersions.map((v: any) => (
                    <tr key={v.version}>
                      <td style={{ fontWeight: 500 }}>
                        v{v.version}
                        {v.isLatest && <span className="badge badge-accent" style={{ marginLeft: "0.5rem", fontSize: "0.5625rem" }}>neueste</span>}
                      </td>
                      <td>{new Date(v.createdAt).toLocaleDateString("de-AT")}</td>
                      <td>{(v.sizeBytes / 1024).toFixed(0)}KB</td>
                      <td>
                        <a
                          href={`${convexUrl}/downloadSkill?token=${token}&version=${v.version}`}
                          className="btn btn-sm"
                          style={{ textDecoration: "none" }}
                        >
                          Download
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Install Instructions */}
          <div className="card" style={{ marginTop: "1.5rem" }}>
            <h4 style={{ marginBottom: "0.75rem" }}>Installation</h4>
            <pre style={{ fontSize: "0.6875rem", color: "var(--fg-2)", background: "var(--surface-2)", padding: "0.75rem", border: "1px solid var(--border)", overflowX: "auto", whiteSpace: "pre-wrap" }}>
{`# Entpacken
unzip faktox-invoice-agent-v${latest?.version || "1.0.0"}.zip

# Für Claude Code:
cp -r faktox-invoice-agent/ ~/.claude/skills/

# Für Cursor:
cp -r faktox-invoice-agent/ ~/.cursor/skills/

# Python Dependencies:
python3 -m venv invoice-venv
source invoice-venv/bin/activate
pip install reportlab google-api-python-client google-auth google-auth-httplib2`}
            </pre>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={() => window.location.hash = ""}>Schließen</button>
        </div>
      </div>
    </div>
  );
}
