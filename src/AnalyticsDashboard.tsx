import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { MONTH_NAMES_SHORT, money, moneyRound } from "./lib";

interface DashboardPageProps {
  auth: { userId: string; email: string; name: string; plan: string; sessionToken: string };
  onUpgrade: () => void;
}

export function AnalyticsDashboard({ auth, onUpgrade }: DashboardPageProps) {
  const sessionToken = auth.sessionToken;

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Serverseitige Aggregation über ALLE Belege (nicht nur die letzten 100)
  const stats = useQuery(api.reports.analytics, {
    sessionToken,
    month: currentMonth,
    year: currentYear,
  });

  const counts = stats?.counts ?? {
    customers: 0, auftrags: 0, incoming: 0,
    draft: 0, confirmed: 0, discarded: 0,
    incomingOpen: 0, incomingPaid: 0,
  };

  const monthRevenue = stats?.month.revenueNet ?? 0;
  const monthExpenses = stats?.month.expensesNet ?? 0;
  const yearRevenue = stats?.year.revenueNet ?? 0;
  const yearExpenses = stats?.year.expensesNet ?? 0;
  const openPayables = stats?.openPayables.amount ?? 0;

  const ustSaldo = (stats?.month.vatReceived ?? 0) - (stats?.month.vatPaid ?? 0);
  const monthProfit = monthRevenue - monthExpenses;
  const yearProfit = yearRevenue - yearExpenses;

  const topCustomers = (stats?.topCustomers ?? []).map((c) => [c.name, c.revenue] as [string, number]);

  const months = (stats?.trend ?? []).map((t) => ({
    label: `${MONTH_NAMES_SHORT[t.m]} ${t.y}`,
    revenue: t.revenue,
    expenses: t.expenses,
  }));

  const maxBar = Math.max(...months.map(m => Math.max(m.revenue, m.expenses)), 1);


  const monthLabel = `${MONTH_NAMES_SHORT[currentMonth]} ${currentYear}`;

  return (
    <div className="slide-up">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Analytics</h1>
        <div className="page-actions">
          <span className="badge badge-accent" style={{ fontSize: "0.75rem" }}>
            {auth.plan} Plan
          </span>
        </div>
      </div>

      {/* Account Status */}
      <div className="card" style={{ marginBottom: "1.5rem", display: "flex", gap: "2rem", flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <h4 style={{ marginBottom: "0.25rem" }}>Account</h4>
          <div style={{ fontSize: "0.8125rem", color: "var(--fg-2)" }}>{auth.email}</div>
        </div>
        <div>
          <h4 style={{ marginBottom: "0.25rem" }}>Kunden</h4>
          <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>{counts.customers}</div>
        </div>
        <div>
          <h4 style={{ marginBottom: "0.25rem" }}>Aufträge gesamt</h4>
          <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>{counts.auftrags}</div>
        </div>
        <div>
          <h4 style={{ marginBottom: "0.25rem" }}>Eingangsrechnungen</h4>
          <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>{counts.incoming}</div>
        </div>
      </div>

      {/* Monthly KPIs */}
      <h4 style={{ marginBottom: "0.75rem" }}>{monthLabel} — Kennzahlen</h4>
      <div className="stat-row">
        <div className="stat">
          <div className="stat-label">Einnahmen (Netto)</div>
          <div className="stat-value accent">{money(monthRevenue)}</div>
          <div className="stat-sub">{stats?.month.auftragCount ?? 0} Aufträge</div>
        </div>
        <div className="stat">
          <div className="stat-label">Ausgaben (Netto)</div>
          <div className="stat-value">{money(monthExpenses)}</div>
          <div className="stat-sub">{stats?.month.incomingCount ?? 0} Rechnungen</div>
        </div>
        <div className="stat">
          <div className="stat-label">Gewinn (Monat)</div>
          <div className="stat-value" style={{ color: monthProfit >= 0 ? "var(--success)" : "var(--danger)" }}>
            {money(monthProfit)}
          </div>
          <div className="stat-sub">{monthProfit >= 0 ? "positiv" : "negativ"}</div>
        </div>
        <div className="stat">
          <div className="stat-label">USt-Saldo</div>
          <div className="stat-value" style={{ color: ustSaldo >= 0 ? "var(--danger)" : "var(--success)" }}>
            {money(ustSaldo)}
          </div>
          <div className="stat-sub">{ustSaldo >= 0 ? "zu zahlen" : "Erstattung"}</div>
        </div>
      </div>

      {/* Yearly KPIs */}
      <h4 style={{ marginTop: "1.5rem", marginBottom: "0.75rem" }}>{currentYear} — Jahresübersicht</h4>
      <div className="stat-row">
        <div className="stat">
          <div className="stat-label">Jahreseinnahmen</div>
          <div className="stat-value accent">{money(yearRevenue)}</div>
          <div className="stat-sub">{stats?.year.auftragCount ?? 0} Aufträge</div>
        </div>
        <div className="stat">
          <div className="stat-label">Jahresausgaben</div>
          <div className="stat-value">{money(yearExpenses)}</div>
          <div className="stat-sub">{stats?.year.incomingCount ?? 0} Rechnungen</div>
        </div>
        <div className="stat">
          <div className="stat-label">Jahresgewinn</div>
          <div className="stat-value" style={{ color: yearProfit >= 0 ? "var(--success)" : "var(--danger)" }}>
            {money(yearProfit)}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Offene Verbindlichkeiten</div>
          <div className="stat-value">{money(openPayables)}</div>
          <div className="stat-sub">{counts.incomingOpen} offen</div>
        </div>
      </div>

      {/* 6-Month Trend Chart */}
      <h4 style={{ marginTop: "1.5rem", marginBottom: "0.75rem" }}>6-Monats-Trend</h4>
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", height: 160, padding: "0.5rem 0" }}>
          {months.map((m, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%" }}>
              <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center", gap: "3px" }}>
                <div style={{
                  width: "30%",
                  background: "var(--accent)",
                  height: `${(m.revenue / maxBar) * 100}%`,
                  minHeight: m.revenue > 0 ? "4px" : "1px",
                  transition: "height 0.3s ease",
                }} />
                <div style={{
                  width: "30%",
                  background: "var(--fg-4)",
                  height: `${(m.expenses / maxBar) * 100}%`,
                  minHeight: m.expenses > 0 ? "4px" : "1px",
                  opacity: 0.6,
                  transition: "height 0.3s ease",
                }} />
              </div>
              <div style={{ fontSize: "0.625rem", color: "var(--fg-3)", marginTop: "0.375rem" }}>{m.label}</div>
              <div style={{ fontSize: "0.625rem", color: "var(--accent)", fontWeight: 500 }}>{moneyRound(m.revenue)}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "1rem", justifyContent: "center", marginTop: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
            <div style={{ width: 10, height: 10, background: "var(--accent)" }} />
            <span style={{ fontSize: "0.6875rem", color: "var(--fg-3)" }}>Einnahmen</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
            <div style={{ width: 10, height: 10, background: "var(--fg-4)", opacity: 0.6 }} />
            <span style={{ fontSize: "0.6875rem", color: "var(--fg-3)" }}>Ausgaben</span>
          </div>
        </div>
      </div>

      {/* Two columns: Top Customers + Auftrags Status */}
      <div className="two-col">
        {/* Top Customers */}
        <div className="card">
          <h4 style={{ marginBottom: "1rem" }}>Top Kunden (nach Umsatz)</h4>
          {topCustomers.length === 0 ? (
            <p style={{ color: "var(--fg-3)", fontSize: "0.8125rem" }}>Noch keine Daten</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {topCustomers.map(([name, rev], i) => (
                <div key={name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0", borderBottom: "1px solid var(--border-soft)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ color: "var(--fg-4)", fontSize: "0.75rem", width: "1.5rem" }}>#{i + 1}</span>
                    <span style={{ fontSize: "0.8125rem" }}>{name}</span>
                  </div>
                  <span style={{ fontWeight: 600, color: "var(--accent)", fontSize: "0.8125rem" }}>{money(rev as number)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Auftrags Status */}
        <div className="card">
          <h4 style={{ marginBottom: "1rem" }}>Auftrags-Status</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <div style={{ width: 10, height: 10, background: "var(--fg-3)" }} />
                <span style={{ fontSize: "0.8125rem" }}>Entwurf</span>
              </span>
              <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{counts.draft}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <div style={{ width: 10, height: 10, background: "var(--success)" }} />
                <span style={{ fontSize: "0.8125rem" }}>Bestätigt</span>
              </span>
              <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{counts.confirmed}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <div style={{ width: 10, height: 10, background: "var(--danger)" }} />
                <span style={{ fontSize: "0.8125rem" }}>Verworfen</span>
              </span>
              <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{counts.discarded}</span>
            </div>
          </div>

          {/* Incoming status */}
          <h4 style={{ marginTop: "1.5rem", marginBottom: "0.75rem" }}>Eingangsrechnungen</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <div style={{ width: 10, height: 10, background: "var(--warn)" }} />
                <span style={{ fontSize: "0.8125rem" }}>Offen</span>
              </span>
              <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{counts.incomingOpen}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <div style={{ width: 10, height: 10, background: "var(--success)" }} />
                <span style={{ fontSize: "0.8125rem" }}>Bezahlt</span>
              </span>
              <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{counts.incomingPaid}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Upgrade Banner for Free Users */}
      {auth.plan === "free" && (
        <div className="card" style={{ borderColor: "var(--accent)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h4 style={{ color: "var(--accent)", marginBottom: "0.25rem" }}>Mehr Analytics mit Pro</h4>
            <p style={{ fontSize: "0.8125rem" }}>Jahresbericht, EÜR, USt-Voranmeldung, DATEV-Export, Email-Abholung.</p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={onUpgrade}>» Upgrade auf Pro (49€)</button>
        </div>
      )}
    </div>
  );
}
