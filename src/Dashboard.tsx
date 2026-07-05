import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { UpgradeModal } from "./UpgradeModal";
import { FileUpload } from "./FileUpload";
import { CreateInvoiceModal } from "./CreateInvoiceModal";
import { AuftragDetail } from "./AuftragDetail";
import { CustomerDetail } from "./CustomerDetail";

interface DashboardProps {
  auth: { userId: string; email: string; name: string; plan: string };
  onLogout: () => void;
}

type Page = "dashboard" | "invoices" | "incoming" | "customers" | "reports";

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
    { id: "dashboard" as Page, icon: "▣", label: "Dashboard" },
    { id: "invoices" as Page, icon: "▣", label: "Aufträge" },
    { id: "incoming" as Page, icon: "↙", label: "Eingang" },
    { id: "customers" as Page, icon: "●", label: "Kunden" },
    { id: "reports" as Page, icon: "▤", label: "Berichte" },
  ];

  return (
    <div className="app" data-theme={theme}>
      {/* Sidebar — Desktop */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          Faktox<span>.</span>
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
  const [showCreate, setShowCreate] = useState(false);
  return (
    <div className="slide-up">
      <div className="page-header">
        <h1 className="page-title">Willkommen, {auth.name}</h1>
        <div className="page-actions">
          <button className="btn">📥 Eingang</button>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Neuer Auftrag</button>
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
          <h4>Aufträge</h4>
          <p style={{ marginTop: "0.5rem" }}>Noch keine Aufträge erstellt.</p>
          <button className="btn btn-sm" style={{ marginTop: "1rem" }} onClick={() => setShowCreate(true)}>+ Erster Auftrag</button>
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

      {showCreate && (
        <CreateInvoiceModal
          userId={auth.userId}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Aufträge Page — Source of Truth, mit Detail-Ansicht
// ═══════════════════════════════════════════════════════════
function InvoicesPage({ userId }: { userId: any }) {
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const auftrags = useQuery(api.auftrags.list, { userId }) ?? [];

  const statusBadge = (status: string) => {
    const map: Record<string, { text: string; cls: string }> = {
      draft: { text: "Entwurf", cls: "badge" },
      confirmed: { text: "Bestätigt", cls: "badge badge-success" },
      discarded: { text: "Verworfen", cls: "badge badge-danger" },
    };
    const s = map[status] || { text: status, cls: "badge" };
    return <span className={s.cls}>{s.text}</span>;
  };

  const money = (v: number) => `€ ${(v || 0).toFixed(2).replace(".", ",")}`;

  return (
    <div className="slide-up" key={refreshKey}>
      <div className="page-header">
        <h1 className="page-title">Aufträge</h1>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + Neuer Auftrag
          </button>
        </div>
      </div>

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
                    <div className="icon">▣</div>
                    <h3>Keine Aufträge</h3>
                    <p>Erstelle deinen ersten Auftrag.</p>
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
                  <td>{auftrag.angebotId ? "✓" : "—"}</td>
                  <td>{(auftrag.rechnungIds?.length || 0) > 0 ? `${auftrag.rechnungIds.length}✓` : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateInvoiceModal
          userId={userId}
          onClose={() => setShowCreate(false)}
          onCreated={() => setRefreshKey(k => k + 1)}
        />
      )}

      {detailId && (
        <AuftragDetail
          auftragId={detailId}
          userId={userId}
          onClose={() => setDetailId(null)}
          onRefresh={() => setRefreshKey(k => k + 1)}
        />
      )}
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
// Customers Page — Liste + Detail + Bearbeiten
// ═══════════════════════════════════════════════════════════
function CustomersPage({ userId }: { userId: any }) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", street: "", city: "", uid: "", email: "" });

  const customers = useQuery(api.customers.list, { userId }) ?? [];
  const createCustomer = useMutation(api.customers.create);

  const handleAdd = async () => {
    if (!newCustomer.name) return;
    await createCustomer({
      userId: userId as any,
      name: newCustomer.name,
      street: newCustomer.street || undefined,
      postalCityCountry: newCustomer.city || undefined,
      uid: newCustomer.uid || undefined,
      email: newCustomer.email || undefined,
    });
    setNewCustomer({ name: "", street: "", city: "", uid: "", email: "" });
    setShowAdd(false);
    setRefreshKey(k => k + 1);
  };

  return (
    <div className="slide-up" key={refreshKey}>
      <div className="page-header">
        <h1 className="page-title">Kunden</h1>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? "✕ Schließen" : "+ Neuer Kunde"}
          </button>
        </div>
      </div>

      {/* Add Form */}
      {showAdd && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <h4 style={{ marginBottom: "1rem" }}>Neuer Kunde</h4>
          <div className="field-group">
            <label className="label">Name / Firma</label>
            <input className="input" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} placeholder="Kunde GmbH" />
          </div>
          <div className="field-group">
            <label className="label">Straße</label>
            <input className="input" value={newCustomer.street} onChange={(e) => setNewCustomer({ ...newCustomer, street: e.target.value })} placeholder="Musterstraße 1" />
          </div>
          <div className="field-row">
            <div className="field-group">
              <label className="label">PLZ + Ort + Land</label>
              <input className="input" value={newCustomer.city} onChange={(e) => setNewCustomer({ ...newCustomer, city: e.target.value })} placeholder="1010 Wien, Österreich" />
            </div>
            <div className="field-group">
              <label className="label">UID</label>
              <input className="input" value={newCustomer.uid} onChange={(e) => setNewCustomer({ ...newCustomer, uid: e.target.value })} placeholder="ATU..." />
            </div>
          </div>
          <div className="field-group">
            <label className="label">Email</label>
            <input className="input" value={newCustomer.email} onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} placeholder="kunde@email.at" />
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleAdd} style={{ marginTop: "0.5rem" }}>Kunde anlegen</button>
        </div>
      )}

      {/* Customer Table */}
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
            {customers.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <div className="empty-state">
                    <div className="icon">●</div>
                    <h3>Keine Kunden</h3>
                    <p>Lege deinen ersten Kunden an.</p>
                    <button className="btn btn-primary btn-sm" style={{ marginTop: "1rem" }} onClick={() => setShowAdd(true)}>
                      + Neuer Kunde
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              customers.map((c: any) => (
                <tr key={c._id} onClick={() => setDetailId(c._id)}>
                  <td style={{ fontWeight: 500 }}>{c.name}</td>
                  <td>{[c.street, c.postalCityCountry].filter(Boolean).join(", ") || "—"}</td>
                  <td>{c.uid || "—"}</td>
                  <td>{c.email || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {detailId && (
        <CustomerDetail
          customerId={detailId}
          userId={userId}
          onClose={() => setDetailId(null)}
          onRefresh={() => setRefreshKey(k => k + 1)}
        />
      )}
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
