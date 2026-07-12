import { useState } from "react";
import { UpgradeModal } from "./UpgradeModal";
import { AnalyticsDashboard } from "./AnalyticsDashboard";
import { SettingsPage } from "./SettingsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { InvoicesPage } from "./pages/InvoicesPage";
import { IncomingPage } from "./pages/IncomingPage";
import { CustomersPage } from "./pages/CustomersPage";
import { ReportsPage } from "./pages/ReportsPage";
import type { DashboardAuth, Page } from "./dashboardTypes";

interface DashboardProps {
  auth: DashboardAuth;
  onLogout: () => void;
}

// ─── Minimal stroke icons (16px, currentColor) ──────────────
function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    home: <path d="M2 7.5 8 2l6 5.5V14H9.5v-4h-3v4H2V7.5Z" />,
    chart: <path d="M2 14V9M6 14V5M10 14V7M14 14V2" />,
    doc: <path d="M4 1.5h5.5L13 5v9.5H4V1.5ZM9 2v3.5h3.5" />,
    inbox: <path d="M2 9h3.5l1 2h3l1-2H14M2 9V3h12v6M2 9v5h12V9" />,
    users: <path d="M6 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm-4 6c0-2.5 1.8-4 4-4s4 1.5 4 4M11 8a2 2 0 1 0-1-4M11.5 10c1.7.3 3 1.6 3 4" />,
    report: <path d="M3 2h10v12H3V2Zm2.5 3.5h5m-5 3h5m-5 3h3" />,
    gear: <path d="M8 10.5A2.5 2.5 0 1 0 8 5a2.5 2.5 0 0 0 0 5.5Zm-6-2 1.6-.4.5-1.6-1-1.4L4.6 3.6 6 4.6l1.6-.5L8 2.5l1.6.4.4 1.6 1.6.5 1.4-1L14.4 5.6 13.4 7l.5 1.6 1.6.4v1.5l-1.6.4-.5 1.6 1 1.4-1.5 1.5-1.4-1-1.6.5-.4 1.6H7.6l-.4-1.6-1.6-.5-1.4 1-1.5-1.5 1-1.4-.5-1.6-1.6-.4V8.5Z" />,
  };
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export function Dashboard({ auth, onLogout }: DashboardProps) {
  const [page, setPage] = useState<Page>("dashboard");
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">(
    () => (localStorage.getItem("faktox_theme") as "dark" | "light") || "dark"
  );

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("faktox_theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };

  const navItems = [
    { id: "dashboard" as Page, icon: "home", label: "Dashboard" },
    { id: "analytics" as Page, icon: "chart", label: "Auswertungen" },
    { id: "invoices" as Page, icon: "doc", label: "Aufträge" },
    { id: "incoming" as Page, icon: "inbox", label: "Eingang" },
    { id: "customers" as Page, icon: "users", label: "Kunden" },
    { id: "reports" as Page, icon: "report", label: "Berichte" },
    { id: "settings" as Page, icon: "gear", label: "Einstellungen" },
  ];

  /* Mobile Nav State */
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="app" data-theme={theme}>
      {/* Mobile Top Bar — visible on mobile via CSS media query */}
      <div className="mobile-top-bar">
        <button
          className="mobile-menu-btn"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Menue"
        >
          <span style={{ fontSize: "1.25rem", lineHeight: 1 }}>≡</span>
        </button>
        <div className="sidebar-logo" style={{ border: "none", margin: 0, padding: 0, fontSize: "1rem" }}>
          Faktox<span>.</span>
        </div>
        <div style={{ display: "flex", gap: "0.375rem", alignItems: "center" }}>
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            style={{ fontSize: "0.75rem" }}
          >
            {theme === "dark" ? "●" : "○"}
          </button>
          <button
            className="btn btn-sm btn-ghost"
            onClick={onLogout}
            style={{ padding: "0.375rem 0.5rem", fontSize: "0.6875rem" }}
          >
            Abmelden
          </button>
        </div>
      </div>

      {/* Sidebar — Desktop + Mobile slide-in */}
      <aside className={`sidebar ${mobileMenuOpen ? "open" : ""}`}>
        <div className="sidebar-logo">
          Faktox<span>.</span>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <a
              key={item.id}
              className={page === item.id ? "active" : ""}
              onClick={() => { setPage(item.id); setMobileMenuOpen(false); }}
            >
              <span className="icon"><Icon name={item.icon} /></span>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            {auth.email}
          </div>
          <button className="theme-toggle" onClick={toggleTheme} title="Theme wechseln">
            {theme === "dark" ? "●" : "○"}
          </button>
        </div>
        <div style={{ padding: "0 1.5rem", marginTop: "0.5rem" }}>
          {auth.plan === "free" && (
            <button
              className="btn btn-sm btn-primary"
              onClick={() => setShowUpgrade(true)}
              style={{ width: "100%", justifyContent: "center", marginBottom: "0.5rem" }}
            >
              Upgrade
            </button>
          )}
          <button className="btn btn-sm btn-ghost" onClick={onLogout} style={{ width: "100%", justifyContent: "center" }}>
            Abmelden
          </button>
        </div>
      </aside>

      {/* Mobile backdrop */}
      {mobileMenuOpen && (
        <div className="sidebar-backdrop" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Main */}
      <main className="main fade-in">
        {page === "dashboard" && (
          <DashboardPage auth={auth} onUpgrade={() => setShowUpgrade(true)} onNavigate={setPage} />
        )}
        {page === "analytics" && <AnalyticsDashboard auth={auth} onUpgrade={() => setShowUpgrade(true)} />}
        {page === "invoices" && <InvoicesPage userId={auth.userId as any} sessionToken={auth.sessionToken} />}
        {page === "incoming" && <IncomingPage userId={auth.userId as any} sessionToken={auth.sessionToken} />}
        {page === "customers" && <CustomersPage userId={auth.userId as any} sessionToken={auth.sessionToken} />}
        {page === "reports" && <ReportsPage userId={auth.userId as any} sessionToken={auth.sessionToken} />}
        {page === "settings" && <SettingsPage auth={auth} />}
      </main>

      {/* Upgrade Modal */}
      {showUpgrade && <UpgradeModal auth={auth} onClose={() => setShowUpgrade(false)} />}
    </div>
  );
}
