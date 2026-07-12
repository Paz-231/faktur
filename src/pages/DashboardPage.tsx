import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { SmartInvoiceModal } from "../SmartInvoiceModal";
import { MONTH_NAMES, money } from "../lib";
import type { DashboardAuth, Page } from "../dashboardTypes";

// ═══════════════════════════════════════════════════════════
// Dashboard Page — Live-KPIs + Schnellaktionen + Onboarding
// ═══════════════════════════════════════════════════════════
export function DashboardPage({
  auth,
  onUpgrade,
  onNavigate,
}: {
  auth: DashboardAuth;
  onUpgrade: () => void;
  onNavigate: (page: Page) => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const userId = auth.userId as any;
  const sessionToken = auth.sessionToken;

  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  // Serverseitige Aggregation über ALLE Belege (nicht nur die letzten 100)
  const summary = useQuery(api.reports.summary, { sessionToken, month, year });
  const auftrags = useQuery(api.auftrags.list, { userId, sessionToken }) ?? [];
  const profile = useQuery(api.profile.get, { userId, sessionToken });

  const kpis = {
    revenue: summary?.month.revenueGross ?? 0,
    expenses: summary?.month.expensesGross ?? 0,
    ustSaldo: (summary?.month.vatReceived ?? 0) - (summary?.month.vatPaid ?? 0),
    openAmount: summary?.open.amount ?? 0,
    openCount: summary?.open.count ?? 0,
    monthInvoiceCount: summary?.month.invoiceCount ?? 0,
  };
  const totalAuftrags = summary?.totals.auftrags ?? auftrags.length;
  const totalIncoming = summary?.totals.incoming ?? 0;

  const recentAuftrags = auftrags.slice(0, 5);
  const freeInvoicesLeft = Math.max(0, 3 - kpis.monthInvoiceCount);

  return (
    <div className="slide-up">
      <div className="page-header">
        <h1 className="page-title">Willkommen, {auth.name}</h1>
        <div className="page-actions">
          <button className="btn" onClick={() => onNavigate("incoming")}>Eingang</button>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Neuer Auftrag</button>
        </div>
      </div>

      {/* Onboarding: Profil fehlt */}
      {profile === null && (
        <div className="card" style={{ marginBottom: "1.5rem", borderColor: "var(--warn)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h4 style={{ color: "var(--warn)", marginBottom: "0.25rem" }}>Unternehmensprofil einrichten</h4>
            <p style={{ fontSize: "0.8125rem" }}>Name, Adresse und Steuerstatus erscheinen als Absender auf deinen Rechnungen.</p>
          </div>
          <button className="btn btn-sm" onClick={() => onNavigate("settings")}>Jetzt einrichten</button>
        </div>
      )}

      {auth.plan === "free" && (
        <div className="card" style={{ marginBottom: "1.5rem", borderColor: "var(--accent)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h4 style={{ color: "var(--accent)", marginBottom: "0.25rem" }}>
              Free Plan — noch {freeInvoicesLeft} von 3 Rechnungen diesen Monat
            </h4>
            <p style={{ fontSize: "0.8125rem" }}>Upgrade auf Starter (29€) oder Pro (49€) für unbegrenzte Rechnungen.</p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={onUpgrade}>Upgrade</button>
        </div>
      )}

      <div className="stat-row">
        <div className="stat">
          <div className="stat-label">Einnahmen (Monat)</div>
          <div className="stat-value accent">{money(kpis.revenue)}</div>
          <div className="stat-sub">{MONTH_NAMES[month]} {year} · {kpis.monthInvoiceCount} Rechnungen</div>
        </div>
        <div className="stat">
          <div className="stat-label">Ausgaben (Monat)</div>
          <div className="stat-value">{money(kpis.expenses)}</div>
          <div className="stat-sub">{MONTH_NAMES[month]} {year}</div>
        </div>
        <div className="stat">
          <div className="stat-label">USt-Saldo</div>
          <div className="stat-value" style={{ color: kpis.ustSaldo > 0 ? "var(--warn)" : kpis.ustSaldo < 0 ? "var(--success)" : undefined }}>
            {money(kpis.ustSaldo)}
          </div>
          <div className="stat-sub">{kpis.ustSaldo > 0 ? "zu zahlen" : kpis.ustSaldo < 0 ? "Erstattung" : "ausgeglichen"}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Offene Forderungen</div>
          <div className="stat-value">{money(kpis.openAmount)}</div>
          <div className="stat-sub">{kpis.openCount} Rechnungen</div>
        </div>
      </div>

      {/* Letzte Aufträge */}
      {recentAuftrags.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <h4>Letzte Aufträge</h4>
            <button className="btn btn-ghost btn-sm" onClick={() => onNavigate("invoices")}>Alle ansehen →</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Nummer</th><th>Datum</th><th>Kunde</th><th>Brutto</th><th>Status</th></tr>
              </thead>
              <tbody>
                {recentAuftrags.map((a: any) => (
                  <tr key={a._id} onClick={() => onNavigate("invoices")}>
                    <td style={{ fontWeight: 500 }}>{a.number}</td>
                    <td>{a.date}</td>
                    <td>{a.recipientName}</td>
                    <td style={{ fontWeight: 600 }}>{money(a.grossAmount)}</td>
                    <td>
                      <span className={`badge ${a.status === "confirmed" ? "badge-success" : a.status === "discarded" ? "badge-danger" : ""}`}>
                        {a.status === "confirmed" ? "Bestätigt" : a.status === "discarded" ? "Verworfen" : "Entwurf"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile: Card List */}
          <div className="data-cards">
            {recentAuftrags.map((a: any) => (
              <div key={a._id} className="data-card" onClick={() => onNavigate("invoices")}>
                <div className="data-card-header">
                  <div>
                    <div className="data-card-title">{a.number}</div>
                    <div className="data-card-meta">
                      <span>{a.date}</span>
                      <span>·</span>
                      <span>{a.recipientName}</span>
                    </div>
                  </div>
                  <div className="data-card-amount">{money(a.grossAmount)}</div>
                </div>
                <div className="data-card-meta">
                  <span>{a.status === "confirmed" ? "Bestätigt" : a.status === "discarded" ? "Verworfen" : "Entwurf"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card-grid">
        <div className="card">
          <h4>Aufträge</h4>
          <p style={{ marginTop: "0.5rem" }}>
            {totalAuftrags === 0 ? "Noch keine Aufträge erstellt." : `${totalAuftrags} Aufträge insgesamt.`}
          </p>
          <button className="btn btn-sm" style={{ marginTop: "1rem" }} onClick={() => setShowCreate(true)}>
            + {totalAuftrags === 0 ? "Erster Auftrag" : "Neuer Auftrag"}
          </button>
        </div>
        <div className="card">
          <h4>Eingangsrechnungen</h4>
          <p style={{ marginTop: "0.5rem" }}>
            {totalIncoming === 0 ? "Noch keine Rechnungen erfasst." : `${totalIncoming} Rechnungen erfasst.`}
          </p>
          <button className="btn btn-sm" style={{ marginTop: "1rem" }} onClick={() => onNavigate("incoming")}>+ Erfassen</button>
        </div>
        <div className="card">
          <h4>Unternehmensprofil</h4>
          <p style={{ marginTop: "0.5rem" }}>
            {profile ? `${profile.name} · ${profile.currentTaxStatus} (${profile.currentTaxRate}%)` : "Steuerstatus einrichten für korrekte Rechnungen."}
          </p>
          <button className="btn btn-sm" style={{ marginTop: "1rem" }} onClick={() => onNavigate("settings")}>
            {profile ? "Profil bearbeiten" : "Profil einrichten"}
          </button>
        </div>
        <div className="card">
          <h4>Buchhaltungs-Report</h4>
          <p style={{ marginTop: "0.5rem" }}>EÜR, USt-Voranmeldung und CSV-Export für deinen Steuerberater.</p>
          <button className="btn btn-sm" style={{ marginTop: "1rem" }} onClick={() => onNavigate("reports")}>Report ansehen</button>
        </div>
      </div>

      {showCreate && (
        <SmartInvoiceModal
          userId={auth.userId}
          sessionToken={auth.sessionToken}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
