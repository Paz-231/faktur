import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { UpgradeModal } from "./UpgradeModal";
import { FileUpload } from "./FileUpload";

interface DashboardProps {
  auth: { userId: string; email: string; name: string; plan: string };
  onLogout: () => void;
}

type Page = "dashboard" | "invoices" | "incoming" | "customers" | "reports";

export function Dashboard({ auth, onLogout }: DashboardProps) {
  const [page, setPage] = useState<Page>("dashboard");
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">(
    () => (localStorage.getItem("faktur_theme") as "dark" | "light") || "dark"
  );

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("faktur_theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };

  const navItems = [
    { id: "dashboard" as Page, icon: "▣", label: "Dashboard" },
    { id: "invoices" as Page, icon: "↗", label: "Ausgang" },
    { id: "incoming" as Page, icon: "↙", label: "Eingang" },
    { id: "customers" as Page, icon: "●", label: "Kunden" },
    { id: "reports" as Page, icon: "▤", label: "Berichte" },
  ];

  return (
    <div className="app" data-theme={theme}>
      {/* Sidebar — Desktop */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          Faktur<span>.</span>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <a
              key={item.id}
              className={page === item.id ? "active" : ""}
              onClick={() => setPage(item.id)}
            >
              <span className="icon">{item.icon}</span>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            {auth.email}
          </div>
          <button className="theme-toggle" onClick={toggleTheme}>
            {theme === "dark" ? "◐" : "◑"}
          </button>
        </div>
        <div style={{ padding: "0 1.5rem", marginTop: "0.5rem" }}>
          {auth.plan === "free" && (
            <button
              className="btn btn-sm btn-primary"
              onClick={() => setShowUpgrade(true)}
              style={{ width: "100%", justifyContent: "center", marginBottom: "0.5rem" }}
            >
              ↑ Upgrade
            </button>
          )}
          <button className="btn btn-sm btn-ghost" onClick={onLogout} style={{ width: "100%", justifyContent: "center" }}>
            Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="main fade-in">
        {page === "dashboard" && <DashboardPage auth={auth} onUpgrade={() => setShowUpgrade(true)} />}
        {page === "invoices" && <InvoicesPage userId={auth.userId as any} />}
        {page === "incoming" && <IncomingPage userId={auth.userId as any} />}
        {page === "customers" && <CustomersPage userId={auth.userId as any} />}
        {page === "reports" && <ReportsPage />}
      </main>

      {/* Bottom Nav — Mobile */}
      <nav className="bottom-nav">
        {navItems.map((item) => (
          <a
            key={item.id}
            className={page === item.id ? "active" : ""}
            onClick={() => setPage(item.id)}
          >
            <span className="icon">{item.icon}</span>
            {item.label}
          </a>
        ))}
      </nav>

      {/* Upgrade Modal */}
      {showUpgrade && <UpgradeModal auth={auth} onClose={() => setShowUpgrade(false)} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Dashboard Page
// ═══════════════════════════════════════════════════════════
function DashboardPage({ auth, onUpgrade }: { auth: DashboardProps["auth"]; onUpgrade: () => void }) {
  return (
    <div className="slide-up">
      <div className="page-header">
        <h1 className="page-title">Willkommen, {auth.name}</h1>
        <div className="page-actions">
          <button className="btn">📥 Eingang</button>
          <button className="btn btn-primary">+ Neue Rechnung</button>
        </div>
      </div>

      {auth.plan === "free" && (
        <div className="card" style={{ marginBottom: "1.5rem", borderColor: "var(--accent)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h4 style={{ color: "var(--accent)", marginBottom: "0.25rem" }}>Free Plan — 3 Rechnungen/Monat</h4>
            <p style={{ fontSize: "0.8125rem" }}>Upgrade auf Starter (12€) oder Pro (29€) für unbegrenzte Rechnungen.</p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={onUpgrade}>↑ Upgrade</button>
        </div>
      )}

      <div className="stat-row">
        <div className="stat">
          <div className="stat-label">Einnahmen (Monat)</div>
          <div className="stat-value accent">€ 0,00</div>
          <div className="stat-sub">Juli 2026</div>
        </div>
        <div className="stat">
          <div className="stat-label">Ausgaben (Monat)</div>
          <div className="stat-value">€ 0,00</div>
          <div className="stat-sub">Juli 2026</div>
        </div>
        <div className="stat">
          <div className="stat-label">USt-Saldo</div>
          <div className="stat-value">€ 0,00</div>
          <div className="stat-sub">ausgeglichen</div>
        </div>
        <div className="stat">
          <div className="stat-label">Offene Forderungen</div>
          <div className="stat-value">€ 0,00</div>
          <div className="stat-sub">0 Rechnungen</div>
        </div>
      </div>

      <div className="card-grid">
        <div className="card">
          <h4>Ausgangsrechnungen</h4>
          <p style={{ marginTop: "0.5rem" }}>Noch keine Rechnungen erstellt.</p>
          <button className="btn btn-sm" style={{ marginTop: "1rem" }}>+ Erste Rechnung</button>
        </div>
        <div className="card">
          <h4>Eingangsrechnungen</h4>
          <p style={{ marginTop: "0.5rem" }}>Noch keine Rechnungen erfasst.</p>
          <button className="btn btn-sm" style={{ marginTop: "1rem" }}>+ Erfassen</button>
        </div>
        <div className="card">
          <h4>Unternehmensprofil</h4>
          <p style={{ marginTop: "0.5rem" }}>Steuerstatus einrichten für korrekte Rechnungen.</p>
          <button className="btn btn-sm" style={{ marginTop: "1rem" }}>Profil einrichten</button>
        </div>
        <div className="card">
          <h4>Buchhaltungs-Report</h4>
          <p style={{ marginTop: "0.5rem" }}>Monatlicher Report wird am 1. des Monats generiert.</p>
          <button className="btn btn-sm" style={{ marginTop: "1rem" }}>Report ansehen</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Invoices Page (Ausgang)
// ═══════════════════════════════════════════════════════════
function InvoicesPage({ userId }: { userId: any }) {
  return (
    <div className="slide-up">
      <div className="page-header">
        <h1 className="page-title">Ausgangsrechnungen</h1>
        <div className="page-actions">
          <button className="btn btn-primary">+ Neue Rechnung</button>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nummer</th>
              <th>Datum</th>
              <th>Empfänger</th>
              <th>Typ</th>
              <th>Netto</th>
              <th>USt</th>
              <th>Brutto</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={8}>
                <div className="empty-state">
                  <div className="icon">↗</div>
                  <h3>Keine Rechnungen</h3>
                  <p>Erstelle deine erste Rechnung.</p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Incoming Page (Eingang) — mit File Upload + Live Data
// ═══════════════════════════════════════════════════════════
function IncomingPage({ userId }: { userId: any }) {
  const [showUpload, setShowUpload] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const invoices = useQuery(api.incoming.list, { userId }) ?? [];

  const statusBadge = (status: string) => {
    const map: Record<string, { text: string; class: string }> = {
      open: { text: "Offen", class: "badge" },
      paid: { text: "Bezahlt", class: "badge badge-success" },
      pending_scan: { text: "Scannen...", class: "badge badge-accent" },
      scan_failed: { text: "Scan failed", class: "badge badge-danger" },
    };
    const s = map[status] || { text: status, class: "badge" };
    return <span className={s.class}>{s.text}</span>;
  };

  return (
    <div className="slide-up" key={refreshKey}>
      <div className="page-header">
        <h1 className="page-title">Eingangsrechnungen</h1>
        <div className="page-actions">
          <button className="btn" onClick={() => setShowUpload(!showUpload)}>
            {showUpload ? "✕ Schließen" : "📷 Foto/PDF hochladen"}
          </button>
          <button className="btn btn-primary">+ Manuell erfassen</button>
        </div>
      </div>

      {showUpload && (
        <div style={{ marginBottom: "1.5rem" }}>
          <FileUpload
            userId={userId}
            onUploaded={() => setRefreshKey(k => k + 1)}
          />
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nummer</th>
              <th>Datum</th>
              <th>Lieferant</th>
              <th>Kategorie</th>
              <th>Netto</th>
              <th>USt</th>
              <th>Brutto</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">
                    <div className="icon">↙</div>
                    <h3>Keine Eingangsrechnungen</h3>
                    <p>Lade ein Foto hoch oder erfasse manuell.</p>
                  </div>
                </td>
              </tr>
            ) : (
              invoices.map((inv: any) => (
                <tr key={inv._id}>
                  <td>{inv.number}</td>
                  <td>{inv.date}</td>
                  <td>{inv.issuerName}</td>
                  <td>{inv.category || "—"}</td>
                  <td>€ {inv.netAmount?.toFixed(2) || "0,00"}</td>
                  <td>€ {inv.vatAmount?.toFixed(2) || "0,00"}</td>
                  <td>€ {inv.grossAmount?.toFixed(2) || "0,00"}</td>
                  <td>{statusBadge(inv.status)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Customers Page
// ═══════════════════════════════════════════════════════════
function CustomersPage({ userId }: { userId: any }) {
  return (
    <div className="slide-up">
      <div className="page-header">
        <h1 className="page-title">Kunden</h1>
        <div className="page-actions">
          <button className="btn btn-primary">+ Neuer Kunde</button>
        </div>
      </div>
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
            <tr>
              <td colSpan={4}>
                <div className="empty-state">
                  <div className="icon">●</div>
                  <h3>Keine Kunden</h3>
                  <p>Lege deinen ersten Kunden an.</p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Reports Page
// ═══════════════════════════════════════════════════════════
function ReportsPage() {
  return (
    <div className="slide-up">
      <div className="page-header">
        <h1 className="page-title">Berichte</h1>
      </div>
      <div className="card-grid">
        <div className="card">
          <h4>Monatlicher Report</h4>
          <p style={{ marginTop: "0.5rem" }}>EÜR, USt-Voranmeldung, offene Posten.</p>
          <button className="btn btn-sm" style={{ marginTop: "1rem" }}>Juli 2026 generieren</button>
        </div>
        <div className="card">
          <h4>Jahresbericht</h4>
          <p style={{ marginTop: "0.5rem" }}>Vollständige EÜR nach §4 Abs3 EStG.</p>
          <button className="btn btn-sm" style={{ marginTop: "1rem" }}>2026 generieren</button>
        </div>
        <div className="card">
          <h4>DATEV-Export</h4>
          <p style={{ marginTop: "0.5rem" }}>CSV-Export für Steuerberater.</p>
          <button className="btn btn-sm" style={{ marginTop: "1rem" }}>Exportieren</button>
        </div>
        <div className="card">
          <h4>USt-Voranmeldung</h4>
          <p style={{ marginTop: "0.5rem" }}>Daten für FinanzOnline / Elster.</p>
          <button className="btn btn-sm" style={{ marginTop: "1rem" }}>Anzeigen</button>
        </div>
      </div>
    </div>
  );
}
