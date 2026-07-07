import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

interface DashboardPageProps {
  auth: { userId: string; email: string; name: string; plan: string };
  onUpgrade: () => void;
}

export function AnalyticsDashboard({ auth, onUpgrade }: DashboardPageProps) {
  const userId = auth.userId as any;

  // Live queries from Convex
  const auftrags = useQuery(api.auftrags.list, { userId }) ?? [];
  const incoming = useQuery(api.incoming.list, { userId }) ?? [];
  const customers = useQuery(api.customers.list, { userId }) ?? [];

  // Calculate KPIs
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const parseDate = (s: string) => {
    if (!s) return null;
    for (const fmt of ["%d.%m.%Y", "%Y-%m-%d"]) {
      try { return new Date(s.split(".").reverse().join("-")); } catch {}
    }
    return null;
  };

  const isInCurrentMonth = (dateStr: string) => {
    const d = parseDate(dateStr);
    return d && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  };

  const isInCurrentYear = (dateStr: string) => {
    const d = parseDate(dateStr);
    return d && d.getFullYear() === currentYear;
  };

  // Outgoing (from auftrags » rechnungen)
  const allRechnungen: any[] = [];
  for (const a of auftrags) {
    if (a.rechnungIds) {
      // We need to get rechnungen — but they're embedded in auftrag detail
      // For now, use auftrag amounts as proxy
    }
  }

  // Use auftrag data for KPIs
  const confirmedAuftrags = auftrags.filter((a: any) => a.status === "confirmed");
  const draftAuftrags = auftrags.filter((a: any) => a.status === "draft");
  const discardedAuftrags = auftrags.filter((a: any) => a.status === "discarded");

  const monthAuftrags = auftrags.filter((a: any) => isInCurrentMonth(a.date));
  const yearAuftrags = auftrags.filter((a: any) => isInCurrentYear(a.date));

  const monthRevenue = monthAuftrags
    .filter((a: any) => a.status !== "discarded")
    .reduce((s: number, a: any) => s + (a.netAmount || 0), 0);
  const monthVat = monthAuftrags
    .filter((a: any) => a.status !== "discarded")
    .reduce((s: number, a: any) => s + (a.vatAmount || 0), 0);

  const yearRevenue = yearAuftrags
    .filter((a: any) => a.status !== "discarded")
    .reduce((s: number, a: any) => s + (a.netAmount || 0), 0);
  const yearVat = yearAuftrags
    .filter((a: any) => a.status !== "discarded")
    .reduce((s: number, a: any) => s + (a.vatAmount || 0), 0);

  // Incoming KPIs
  const monthIncoming = incoming.filter((i: any) => isInCurrentMonth(i.date));
  const yearIncoming = incoming.filter((i: any) => isInCurrentYear(i.date));
  const openIncoming = incoming.filter((i: any) => i.status === "open");
  const paidIncoming = incoming.filter((i: any) => i.status === "paid");

  const monthExpenses = monthIncoming.reduce((s: number, i: any) => s + (i.netAmount || 0), 0);
  const yearExpenses = yearIncoming.reduce((s: number, i: any) => s + (i.netAmount || 0), 0);
  const openPayables = openIncoming.reduce((s: number, i: any) => s + (i.grossAmount || 0), 0);

  // USt Saldo
  const ustReceived = monthVat;
  const ustPaid = monthIncoming.reduce((s: number, i: any) => s + (i.vatAmount || 0), 0);
  const ustSaldo = ustReceived - ustPaid;

  // Profit
  const monthProfit = monthRevenue - monthExpenses;
  const yearProfit = yearRevenue - yearExpenses;

  // Top customers by revenue
  const customerRevenue: Record<string, number> = {};
  for (const a of auftrags.filter((a: any) => a.status !== "discarded")) {
    const name = (a as any).recipientName;
    customerRevenue[name] = (customerRevenue[name] || 0) + (a as any).netAmount;
  }
  const topCustomers = Object.entries(customerRevenue)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  // Monthly trend (last 6 months)
  const months: { label: string; revenue: number; expenses: number }[] = [];
  const monthNames = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(currentYear, currentMonth - i, 1);
    const m = d.getMonth();
    const y = d.getFullYear();
    const label = `${monthNames[m]} ${y}`;
    const rev = auftrags
      .filter((a: any) => {
        const ad = parseDate((a as any).date);
        return ad && ad.getMonth() === m && ad.getFullYear() === y && (a as any).status !== "discarded";
      })
      .reduce((s: number, a: any) => s + (a.netAmount || 0), 0);
    const exp = incoming
      .filter((i: any) => {
        const id = parseDate((i as any).date);
        return id && id.getMonth() === m && id.getFullYear() === y;
      })
      .reduce((s: number, i: any) => s + (i.netAmount || 0), 0);
    months.push({ label, revenue: rev, expenses: exp });
  }

  const maxBar = Math.max(...months.map(m => Math.max(m.revenue, m.expenses)), 1);

  const money = (v: number) => `€ ${(v || 0).toFixed(0)}`;
  const money2 = (v: number) => `€ ${(v || 0).toFixed(2).replace(".", ",")}`;

  const monthLabel = `${monthNames[currentMonth]} ${currentYear}`;

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
          <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>{customers.length}</div>
        </div>
        <div>
          <h4 style={{ marginBottom: "0.25rem" }}>Aufträge gesamt</h4>
          <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>{auftrags.length}</div>
        </div>
        <div>
          <h4 style={{ marginBottom: "0.25rem" }}>Eingangsrechnungen</h4>
          <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>{incoming.length}</div>
        </div>
      </div>

      {/* Monthly KPIs */}
      <h4 style={{ marginBottom: "0.75rem" }}>{monthLabel} — Kennzahlen</h4>
      <div className="stat-row">
        <div className="stat">
          <div className="stat-label">Einnahmen (Netto)</div>
          <div className="stat-value accent">{money2(monthRevenue)}</div>
          <div className="stat-sub">{monthAuftrags.length} Aufträge</div>
        </div>
        <div className="stat">
          <div className="stat-label">Ausgaben (Netto)</div>
          <div className="stat-value">{money2(monthExpenses)}</div>
          <div className="stat-sub">{monthIncoming.length} Rechnungen</div>
        </div>
        <div className="stat">
          <div className="stat-label">Gewinn (Monat)</div>
          <div className="stat-value" style={{ color: monthProfit >= 0 ? "var(--success)" : "var(--danger)" }}>
            {money2(monthProfit)}
          </div>
          <div className="stat-sub">{monthProfit >= 0 ? "positiv" : "negativ"}</div>
        </div>
        <div className="stat">
          <div className="stat-label">USt-Saldo</div>
          <div className="stat-value" style={{ color: ustSaldo >= 0 ? "var(--danger)" : "var(--success)" }}>
            {money2(ustSaldo)}
          </div>
          <div className="stat-sub">{ustSaldo >= 0 ? "zu zahlen" : "Erstattung"}</div>
        </div>
      </div>

      {/* Yearly KPIs */}
      <h4 style={{ marginTop: "1.5rem", marginBottom: "0.75rem" }}>{currentYear} — Jahresübersicht</h4>
      <div className="stat-row">
        <div className="stat">
          <div className="stat-label">Jahreseinnahmen</div>
          <div className="stat-value accent">{money2(yearRevenue)}</div>
          <div className="stat-sub">{yearAuftrags.length} Aufträge</div>
        </div>
        <div className="stat">
          <div className="stat-label">Jahresausgaben</div>
          <div className="stat-value">{money2(yearExpenses)}</div>
          <div className="stat-sub">{yearIncoming.length} Rechnungen</div>
        </div>
        <div className="stat">
          <div className="stat-label">Jahresgewinn</div>
          <div className="stat-value" style={{ color: yearProfit >= 0 ? "var(--success)" : "var(--danger)" }}>
            {money2(yearProfit)}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Offene Verbindlichkeiten</div>
          <div className="stat-value">{money2(openPayables)}</div>
          <div className="stat-sub">{openIncoming.length} offen</div>
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
              <div style={{ fontSize: "0.625rem", color: "var(--accent)", fontWeight: 500 }}>{money(m.revenue)}</div>
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
                  <span style={{ fontWeight: 600, color: "var(--accent)", fontSize: "0.8125rem" }}>{money2(rev as number)}</span>
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
              <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{draftAuftrags.length}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <div style={{ width: 10, height: 10, background: "var(--success)" }} />
                <span style={{ fontSize: "0.8125rem" }}>Bestätigt</span>
              </span>
              <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{confirmedAuftrags.length}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <div style={{ width: 10, height: 10, background: "var(--danger)" }} />
                <span style={{ fontSize: "0.8125rem" }}>Verworfen</span>
              </span>
              <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{discardedAuftrags.length}</span>
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
              <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{openIncoming.length}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <div style={{ width: 10, height: 10, background: "var(--success)" }} />
                <span style={{ fontSize: "0.8125rem" }}>Bezahlt</span>
              </span>
              <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{paidIncoming.length}</span>
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
          <button className="btn btn-primary btn-sm" onClick={onUpgrade}>» Upgrade auf Pro (29,90€)</button>
        </div>
      )}
    </div>
  );
}
