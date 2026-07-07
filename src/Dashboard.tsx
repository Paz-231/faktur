import { useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { UpgradeModal } from "./UpgradeModal";
import { FileUpload } from "./FileUpload";
import { CreateInvoiceModal } from "./CreateInvoiceModal";
import { AuftragDetail } from "./AuftragDetail";
import { CustomerDetail } from "./CustomerDetail";
import { AnalyticsDashboard } from "./AnalyticsDashboard";
import { SettingsPage } from "./SettingsPage";
import { money, parseAppDate } from "./lib";

interface DashboardProps {
  auth: { userId: string; email: string; name: string; plan: string };
  onLogout: () => void;
}

type Page = "dashboard" | "analytics" | "invoices" | "incoming" | "customers" | "reports" | "settings";

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
    { id: "analytics" as Page, icon: "chart", label: "Analytics" },
    { id: "invoices" as Page, icon: "doc", label: "Aufträge" },
    { id: "incoming" as Page, icon: "inbox", label: "Eingang" },
    { id: "customers" as Page, icon: "users", label: "Kunden" },
    { id: "reports" as Page, icon: "report", label: "Berichte" },
    { id: "settings" as Page, icon: "gear", label: "Einstellungen" },
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
            Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="main fade-in">
        {page === "dashboard" && (
          <DashboardPage auth={auth} onUpgrade={() => setShowUpgrade(true)} onNavigate={setPage} />
        )}
        {page === "analytics" && <AnalyticsDashboard auth={auth} onUpgrade={() => setShowUpgrade(true)} />}
        {page === "invoices" && <InvoicesPage userId={auth.userId as any} />}
        {page === "incoming" && <IncomingPage userId={auth.userId as any} />}
        {page === "customers" && <CustomersPage userId={auth.userId as any} />}
        {page === "reports" && <ReportsPage userId={auth.userId as any} />}
        {page === "settings" && <SettingsPage auth={auth} />}
      </main>

      {/* Bottom Nav — Mobile */}
      <nav className="bottom-nav">
        {navItems.map((item) => (
          <a
            key={item.id}
            className={page === item.id ? "active" : ""}
            onClick={() => setPage(item.id)}
          >
            <span className="icon"><Icon name={item.icon} /></span>
            {item.label}
          </a>
        ))}
      </nav>

      {/* Upgrade Modal */}
      {showUpgrade && <UpgradeModal auth={auth} onClose={() => setShowUpgrade(false)} />}
    </div>
  );
}

// ─── Shared date helpers ─────────────────────────────────────
function inMonth(dateStr: string, month: number, year: number): boolean {
  const d = parseAppDate(dateStr);
  return !!d && d.getMonth() === month && d.getFullYear() === year;
}

function inYear(dateStr: string, year: number): boolean {
  const d = parseAppDate(dateStr);
  return !!d && d.getFullYear() === year;
}

// ═══════════════════════════════════════════════════════════
// Dashboard Page — Live-KPIs + Schnellaktionen + Onboarding
// ═══════════════════════════════════════════════════════════
function DashboardPage({
  auth,
  onUpgrade,
  onNavigate,
}: {
  auth: DashboardProps["auth"];
  onUpgrade: () => void;
  onNavigate: (page: Page) => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const userId = auth.userId as any;

  const invoices = useQuery(api.invoices.list, { userId }) ?? [];
  const incoming = useQuery(api.incoming.list, { userId }) ?? [];
  const auftrags = useQuery(api.auftrags.list, { userId }) ?? [];
  const profile = useQuery(api.profile.get, { userId });

  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const monthNames = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

  const kpis = useMemo(() => {
    const activeInvoices = invoices.filter((r: any) => r.status !== "storno" && !r.stornoOf);
    const monthInvoices = activeInvoices.filter((r: any) => inMonth(r.date, month, year));
    const revenue = monthInvoices.reduce((s: number, r: any) => s + (r.grossAmount || 0), 0);
    const vatReceived = monthInvoices.reduce((s: number, r: any) => s + (r.vatAmount || 0), 0);

    const monthIncoming = incoming.filter((i: any) => inMonth(i.date, month, year));
    const expenses = monthIncoming.reduce((s: number, i: any) => s + (i.grossAmount || 0), 0);
    const vatPaid = monthIncoming.reduce((s: number, i: any) => s + (i.vatAmount || 0), 0);

    const open = activeInvoices.filter((r: any) => r.status === "sent" || r.status === "overdue");
    const openAmount = open.reduce((s: number, r: any) => s + (r.grossAmount || 0), 0);

    return {
      revenue,
      expenses,
      ustSaldo: vatReceived - vatPaid,
      openAmount,
      openCount: open.length,
      monthInvoiceCount: monthInvoices.length,
    };
  }, [invoices, incoming, month, year]);

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
            <p style={{ fontSize: "0.8125rem" }}>Upgrade auf Starter (14,90€) oder Pro (29,90€) für unbegrenzte Rechnungen + AI Foto-Scan.</p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={onUpgrade}>Upgrade</button>
        </div>
      )}

      <div className="stat-row">
        <div className="stat">
          <div className="stat-label">Einnahmen (Monat)</div>
          <div className="stat-value accent">{money(kpis.revenue)}</div>
          <div className="stat-sub">{monthNames[month]} {year} · {kpis.monthInvoiceCount} Rechnungen</div>
        </div>
        <div className="stat">
          <div className="stat-label">Ausgaben (Monat)</div>
          <div className="stat-value">{money(kpis.expenses)}</div>
          <div className="stat-sub">{monthNames[month]} {year}</div>
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
        </div>
      )}

      <div className="card-grid">
        <div className="card">
          <h4>Aufträge</h4>
          <p style={{ marginTop: "0.5rem" }}>
            {auftrags.length === 0 ? "Noch keine Aufträge erstellt." : `${auftrags.length} Aufträge insgesamt.`}
          </p>
          <button className="btn btn-sm" style={{ marginTop: "1rem" }} onClick={() => setShowCreate(true)}>
            + {auftrags.length === 0 ? "Erster Auftrag" : "Neuer Auftrag"}
          </button>
        </div>
        <div className="card">
          <h4>Eingangsrechnungen</h4>
          <p style={{ marginTop: "0.5rem" }}>
            {incoming.length === 0 ? "Noch keine Rechnungen erfasst." : `${incoming.length} Rechnungen erfasst.`}
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

  return (
    <div className="slide-up">
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
                  <td>{auftrag.angebotId ? "Ja" : "—"}</td>
                  <td>{(auftrag.rechnungIds?.length || 0) > 0 ? auftrag.rechnungIds.length : "—"}</td>
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
        />
      )}

      {detailId && (
        <AuftragDetail
          auftragId={detailId}
          userId={userId}
          onClose={() => setDetailId(null)}
          onRefresh={() => {}}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Incoming Page (Eingang) — Upload + manuelle Erfassung + Live Data
// ═══════════════════════════════════════════════════════════
function IncomingPage({ userId }: { userId: any }) {
  const [showUpload, setShowUpload] = useState(false);
  const [showManual, setShowManual] = useState(false);

  const invoices = useQuery(api.incoming.list, { userId }) ?? [];
  const markPaid = useMutation(api.incoming.markPaid);

  const statusBadge = (status: string) => {
    const map: Record<string, { text: string; class: string }> = {
      open: { text: "Offen", class: "badge badge-warn" },
      paid: { text: "Bezahlt", class: "badge badge-success" },
      pending_scan: { text: "Scannen...", class: "badge badge-accent" },
      scan_failed: { text: "Scan fehlgeschlagen", class: "badge badge-danger" },
    };
    const s = map[status] || { text: status, class: "badge" };
    return <span className={s.class}>{s.text}</span>;
  };

  const handleMarkPaid = async (e: React.MouseEvent, invoiceId: string) => {
    e.stopPropagation();
    await markPaid({
      invoiceId: invoiceId as any,
      paidDate: new Date().toLocaleDateString("de-AT"),
    });
  };

  return (
    <div className="slide-up">
      <div className="page-header">
        <h1 className="page-title">Eingangsrechnungen</h1>
        <div className="page-actions">
          <button className="btn" onClick={() => setShowUpload(!showUpload)}>
            {showUpload ? "× Schließen" : "Foto/PDF hochladen"}
          </button>
          <button className="btn btn-primary" onClick={() => setShowManual(true)}>+ Manuell erfassen</button>
        </div>
      </div>

      {showUpload && (
        <div style={{ marginBottom: "1.5rem" }}>
          <FileUpload userId={userId} onUploaded={() => setShowUpload(false)} />
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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <div className="empty-state">
                    <h3>Keine Eingangsrechnungen</h3>
                    <p>Lade ein Foto hoch — die KI erfasst die Daten automatisch. Oder erfasse manuell.</p>
                    <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", marginTop: "1rem" }}>
                      <button className="btn btn-sm" onClick={() => setShowUpload(true)}>Foto/PDF hochladen</button>
                      <button className="btn btn-primary btn-sm" onClick={() => setShowManual(true)}>+ Manuell erfassen</button>
                    </div>
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
                  <td>{money(inv.netAmount)}</td>
                  <td>{money(inv.vatAmount)}</td>
                  <td style={{ fontWeight: 600 }}>{money(inv.grossAmount)}</td>
                  <td>{statusBadge(inv.status)}</td>
                  <td>
                    {inv.status === "open" && (
                      <button className="btn btn-sm" onClick={(e) => handleMarkPaid(e, inv._id)}>
                        Bezahlt
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showManual && (
        <ManualIncomingModal userId={userId} onClose={() => setShowManual(false)} />
      )}
    </div>
  );
}

// ─── Manuelle Erfassung einer Eingangsrechnung ───────────────
function ManualIncomingModal({ userId, onClose }: { userId: any; onClose: () => void }) {
  const create = useMutation(api.incoming.create);
  const [form, setForm] = useState({
    number: "",
    date: new Date().toLocaleDateString("de-AT"),
    issuerName: "",
    category: "",
    netAmount: "",
    taxRate: "20",
    description: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const net = parseFloat(form.netAmount.replace(",", ".")) || 0;
  const rate = parseFloat(form.taxRate) || 0;
  const vat = (net * rate) / 100;
  const gross = net + vat;

  const set = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const handleSave = async () => {
    setError("");
    if (!form.number || !form.issuerName || net <= 0) {
      setError("Rechnungsnummer, Lieferant und Netto-Betrag sind erforderlich.");
      return;
    }
    setSaving(true);
    try {
      await create({
        userId,
        number: form.number,
        date: form.date,
        issuerName: form.issuerName,
        category: form.category || undefined,
        description: form.description || undefined,
        taxRate: rate,
        netAmount: net,
        vatAmount: vat,
        grossAmount: gross,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Eingangsrechnung erfassen</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="field-row">
            <div className="field-group">
              <label className="label">Rechnungsnummer</label>
              <input className="input" value={form.number} onChange={(e) => set("number", e.target.value)} placeholder="R-12345" />
            </div>
            <div className="field-group">
              <label className="label">Datum</label>
              <input className="input" value={form.date} onChange={(e) => set("date", e.target.value)} placeholder="DD.MM.YYYY" />
            </div>
          </div>
          <div className="field-group">
            <label className="label">Lieferant</label>
            <input className="input" value={form.issuerName} onChange={(e) => set("issuerName", e.target.value)} placeholder="Lieferant GmbH" />
          </div>
          <div className="field-row">
            <div className="field-group">
              <label className="label">Kategorie</label>
              <select className="select" value={form.category} onChange={(e) => set("category", e.target.value)}>
                <option value="">— wählen —</option>
                <option>Software / SaaS</option>
                <option>Büro / Material</option>
                <option>Reisekosten</option>
                <option>Telefon / Internet</option>
                <option>Miete</option>
                <option>Fremdleistungen</option>
                <option>Sonstiges</option>
              </select>
            </div>
            <div className="field-group">
              <label className="label">Beschreibung (optional)</label>
              <input className="input" value={form.description} onChange={(e) => set("description", e.target.value)} />
            </div>
          </div>
          <div className="field-row">
            <div className="field-group">
              <label className="label">Netto (€)</label>
              <input className="input" type="text" inputMode="decimal" value={form.netAmount} onChange={(e) => set("netAmount", e.target.value)} placeholder="100,00" />
            </div>
            <div className="field-group">
              <label className="label">USt-Satz (%)</label>
              <select className="select" value={form.taxRate} onChange={(e) => set("taxRate", e.target.value)}>
                <option value="0">0%</option>
                <option value="7">7% (DE ermäßigt)</option>
                <option value="10">10% (AT ermäßigt)</option>
                <option value="13">13% (AT)</option>
                <option value="19">19% (DE)</option>
                <option value="20">20% (AT)</option>
              </select>
            </div>
          </div>
          <div style={{ padding: "0.75rem 1rem", background: "var(--surface-2)", border: "1px solid var(--border)", display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
            <span style={{ color: "var(--fg-3)" }}>USt {money(vat)}</span>
            <span style={{ fontWeight: 600 }}>Brutto {money(gross)}</span>
          </div>
          {error && (
            <div style={{ marginTop: "0.75rem", padding: "0.75rem", border: "1px solid var(--danger)", color: "var(--danger)", fontSize: "0.8125rem" }}>
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Speichere..." : "Erfassen"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Customers Page — Liste + Detail + Bearbeiten
// ═══════════════════════════════════════════════════════════
function CustomersPage({ userId }: { userId: any }) {
  const [detailId, setDetailId] = useState<string | null>(null);
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
  };

  return (
    <div className="slide-up">
      <div className="page-header">
        <h1 className="page-title">Kunden</h1>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? "× Schließen" : "+ Neuer Kunde"}
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
          onRefresh={() => {}}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Reports Page — echte Zahlen + CSV-Exporte
// ═══════════════════════════════════════════════════════════
function ReportsPage({ userId }: { userId: any }) {
  const invoices = useQuery(api.invoices.list, { userId }) ?? [];
  const incoming = useQuery(api.incoming.list, { userId }) ?? [];

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const monthNames = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

  const activeInvoices = invoices.filter((r: any) => r.status !== "storno" && !r.stornoOf);

  const report = useMemo(() => {
    const monthInv = activeInvoices.filter((r: any) => inMonth(r.date, month, year));
    const monthInc = incoming.filter((i: any) => inMonth(i.date, month, year));
    const yearInv = activeInvoices.filter((r: any) => inYear(r.date, year));
    const yearInc = incoming.filter((i: any) => inYear(i.date, year));

    const sum = (arr: any[], f: string) => arr.reduce((s, x) => s + (x[f] || 0), 0);

    return {
      monthRevenue: sum(monthInv, "netAmount"),
      monthExpenses: sum(monthInc, "netAmount"),
      monthVatReceived: sum(monthInv, "vatAmount"),
      monthVatPaid: sum(monthInc, "vatAmount"),
      monthInvCount: monthInv.length,
      monthIncCount: monthInc.length,
      yearRevenue: sum(yearInv, "netAmount"),
      yearExpenses: sum(yearInc, "netAmount"),
      yearVatReceived: sum(yearInv, "vatAmount"),
      yearVatPaid: sum(yearInc, "vatAmount"),
    };
  }, [activeInvoices, incoming, month, year]);

  const downloadCsv = (fileName: string, rows: (string | number)[][]) => {
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
    // BOM für Excel-Umlaute
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportMonthReport = () => {
    downloadCsv(`faktox-report-${year}-${String(month + 1).padStart(2, "0")}.csv`, [
      ["Faktox Monats-Report", `${monthNames[month]} ${year}`],
      [],
      ["Position", "Betrag (EUR)"],
      ["Einnahmen (Netto)", report.monthRevenue.toFixed(2)],
      ["Ausgaben (Netto)", report.monthExpenses.toFixed(2)],
      ["Gewinn (EÜR)", (report.monthRevenue - report.monthExpenses).toFixed(2)],
      ["USt vereinnahmt", report.monthVatReceived.toFixed(2)],
      ["Vorsteuer bezahlt", report.monthVatPaid.toFixed(2)],
      ["USt-Zahllast", (report.monthVatReceived - report.monthVatPaid).toFixed(2)],
    ]);
  };

  const exportYearReport = () => {
    downloadCsv(`faktox-jahresbericht-${year}.csv`, [
      ["Faktox Jahresbericht (EÜR §4 Abs3 EStG)", String(year)],
      [],
      ["Position", "Betrag (EUR)"],
      ["Betriebseinnahmen (Netto)", report.yearRevenue.toFixed(2)],
      ["Betriebsausgaben (Netto)", report.yearExpenses.toFixed(2)],
      ["Gewinn/Verlust", (report.yearRevenue - report.yearExpenses).toFixed(2)],
      ["USt vereinnahmt", report.yearVatReceived.toFixed(2)],
      ["Vorsteuer bezahlt", report.yearVatPaid.toFixed(2)],
      ["USt-Zahllast", (report.yearVatReceived - report.yearVatPaid).toFixed(2)],
    ]);
  };

  const exportDatev = () => {
    const rows: (string | number)[][] = [
      ["Belegdatum", "Belegnummer", "Buchungstext", "Netto", "USt-Satz", "USt", "Brutto", "Typ", "Status"],
    ];
    for (const r of activeInvoices) {
      rows.push([r.date, r.number, `${r.type} ${r.recipientName}`, r.netAmount.toFixed(2), `${r.taxRate}%`, r.vatAmount.toFixed(2), r.grossAmount.toFixed(2), "Ausgang", r.status]);
    }
    for (const i of incoming) {
      rows.push([i.date, i.number, `Eingang ${i.issuerName}`, (i.netAmount || 0).toFixed(2), `${i.taxRate || 0}%`, (i.vatAmount || 0).toFixed(2), (i.grossAmount || 0).toFixed(2), "Eingang", i.status]);
    }
    downloadCsv(`faktox-datev-export-${year}.csv`, rows);
  };

  const zahllast = report.monthVatReceived - report.monthVatPaid;

  return (
    <div className="slide-up">
      <div className="page-header">
        <h1 className="page-title">Berichte</h1>
        <div className="page-actions">
          <select className="select" style={{ width: "auto" }} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {monthNames.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select className="select" style={{ width: "auto" }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[year - 2, year - 1, year, year + 1].filter((v, i, a) => a.indexOf(v) === i).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Monats-Kennzahlen */}
      <h4 style={{ marginBottom: "0.75rem" }}>{monthNames[month]} {year}</h4>
      <div className="stat-row">
        <div className="stat">
          <div className="stat-label">Einnahmen (Netto)</div>
          <div className="stat-value accent">{money(report.monthRevenue)}</div>
          <div className="stat-sub">{report.monthInvCount} Ausgangsrechnungen</div>
        </div>
        <div className="stat">
          <div className="stat-label">Ausgaben (Netto)</div>
          <div className="stat-value">{money(report.monthExpenses)}</div>
          <div className="stat-sub">{report.monthIncCount} Eingangsrechnungen</div>
        </div>
        <div className="stat">
          <div className="stat-label">Gewinn (EÜR)</div>
          <div className="stat-value" style={{ color: report.monthRevenue - report.monthExpenses >= 0 ? "var(--success)" : "var(--danger)" }}>
            {money(report.monthRevenue - report.monthExpenses)}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">USt-Zahllast</div>
          <div className="stat-value" style={{ color: zahllast > 0 ? "var(--warn)" : "var(--success)" }}>{money(zahllast)}</div>
          <div className="stat-sub">{zahllast > 0 ? "zu zahlen" : zahllast < 0 ? "Erstattung" : "ausgeglichen"}</div>
        </div>
      </div>

      <div className="card-grid">
        <div className="card">
          <h4>Monatlicher Report</h4>
          <p style={{ marginTop: "0.5rem" }}>EÜR-Summen und USt für {monthNames[month]} {year} als CSV.</p>
          <button className="btn btn-sm" style={{ marginTop: "1rem" }} onClick={exportMonthReport}>CSV herunterladen</button>
        </div>
        <div className="card">
          <h4>Jahresbericht</h4>
          <p style={{ marginTop: "0.5rem" }}>
            Vollständige EÜR {year}: Einnahmen {money(report.yearRevenue)}, Ausgaben {money(report.yearExpenses)}.
          </p>
          <button className="btn btn-sm" style={{ marginTop: "1rem" }} onClick={exportYearReport}>CSV herunterladen</button>
        </div>
        <div className="card">
          <h4>DATEV-Export</h4>
          <p style={{ marginTop: "0.5rem" }}>Alle Belege {year} als CSV für deinen Steuerberater.</p>
          <button className="btn btn-sm" style={{ marginTop: "1rem" }} onClick={exportDatev}>Exportieren</button>
        </div>
        <div className="card">
          <h4>USt-Voranmeldung</h4>
          <p style={{ marginTop: "0.5rem" }}>
            {monthNames[month]}: USt {money(report.monthVatReceived)} − Vorsteuer {money(report.monthVatPaid)} = <strong>{money(zahllast)}</strong>
          </p>
          <p style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--fg-3)" }}>
            Werte für FinanzOnline (AT) / ELSTER (DE).
          </p>
        </div>
      </div>
    </div>
  );
}
