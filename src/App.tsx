import { useState, useEffect, lazy, Suspense } from "react";
import { useMutation } from "convex/react";
import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import { useAuth } from "./useAuth";
import { api } from "../convex/_generated/api";
import { convexSiteUrl } from "./lib";

// Code-split: Dashboard and SkillDownloadPage are lazy-loaded
// to reduce initial bundle for landing page visitors
const Dashboard = lazy(() => import("./Dashboard").then(m => ({ default: m.Dashboard })));
const SkillDownloadPage = lazy(() => import("./SkillDownloadPage").then(m => ({ default: m.SkillDownloadPage })));

// ── Minimal SVG Icons ───────────────────────────────────
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const icons: Record<string, React.ReactNode> = {
      camera: <><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></>,
      dach: <><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></>,
      report: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></>,
      mail: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></>,
      bell: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
      shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
      upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>,
      eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>,
      relax: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></>,
      check: <polyline points="20 6 9 17 4 12" />,
      lock: <><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
      refresh: <><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></>,
      file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>,
      credit: <><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></>,
      cancel: <><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></>,
  };
  const p = icons[name];
  if (!p) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      {p}
    </svg>
  );
}

export default function App() {
  const [showLogin, setShowLogin] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [navScrolled, setNavScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setNavScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);
  const [loginEmail, setLoginEmail] = useState("");
  const [skillEmail, setSkillEmail] = useState("");
  const [skillBuying, setSkillBuying] = useState(false);
  const [downloadToken, setDownloadToken] = useState<string | null>(null);
  const [magicToken, setMagicToken] = useState<string | null>(null);
  const { auth, logout, loading: authLoading } = useAuth();

  // Check URL for magic-link token (from email) and skill download token
  useEffect(() => {
    // Magic link: /auth/verify?token=... (email link)
    const url = new URL(window.location.href);
    if (url.pathname.startsWith("/auth/verify")) {
      const token = url.searchParams.get("token");
      if (token) {
        setMagicToken(token);
        return;
      }
    }

    const checkHash = () => {
      const hash = window.location.hash;
      if (hash.includes("skill-download") || hash.includes("skill-success")) {
        const params = new URLSearchParams(hash.split("?")[1] || "");
        const token = params.get("token");
        if (token) setDownloadToken(token);
      }
    };
    checkHash();
    window.addEventListener("hashchange", checkHash);
    return () => window.removeEventListener("hashchange", checkHash);
  }, []);

  const { scrollYProgress } = useScroll();
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 });

  // Liquid background transforms
  const bgY = useTransform(smoothProgress, [0, 1], ["0%", "50%"]);
  const bgScale = useTransform(smoothProgress, [0, 0.5, 1], [1, 1.1, 1.2]);
  const bgOpacity = useTransform(smoothProgress, [0, 0.3, 0.7, 1], [0.6, 0.4, 0.3, 0.2]);

  // Hero parallax
  const heroY = useTransform(smoothProgress, [0, 0.3], ["0%", "30%"]);

  const handleSkillBuy = async () => {
    if (!skillEmail) return;
    setSkillBuying(true);
    try {
      const resp = await fetch(`${convexSiteUrl()}/createSkillCheckout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: skillEmail }),
      });
      const data = await resp.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert("Stripe noch nicht konfiguriert. Kontaktiere paz@faktox.online");
      }
    } catch {
      alert("Fehler beim Verbinden mit Stripe");
    } finally {
      setSkillBuying(false);
    }
  };

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  const openLogin = (email?: string) => {
    if (email) setLoginEmail(email);
    setShowLogin(true);
  };

  // Magic-link verification (from email link) has priority
  if (magicToken) {
    return <MagicLinkVerify token={magicToken} />;
  }

  return (
    <div className="landing">
      {/* If authenticated (server-validated), show Dashboard */}
      {auth.userId && !downloadToken && (
        <Suspense fallback={<div style={{ padding: "2rem", textAlign: "center", color: "var(--fg-3)" }}>Lade...</div>}>
        <Dashboard
          auth={{
            userId: auth.userId,
            email: auth.email || "",
            name: auth.name || "",
            plan: auth.plan || "free",
            sessionToken: auth.sessionToken || "",
          }}
          onLogout={logout}
        />
        </Suspense>
      )}

      {/* While validating a stored session, don't flash the landing page */}
      {!auth.userId && authLoading && !downloadToken && (
        <div className="landing-loading">Faktox<span>.</span></div>
      )}

      {/* Otherwise show landing page */}
      {!auth.userId && !authLoading && (
        <>
      {/* Liquid animated background */}
      <motion.div
        className="liquid-bg"
        style={{
          y: bgY,
          scale: bgScale,
          opacity: bgOpacity,
          background: `radial-gradient(ellipse 80% 50% at 50% -20%, var(--accent), transparent),
                       radial-gradient(ellipse 60% 40% at 80% 50%, var(--accent), transparent),
                       radial-gradient(ellipse 60% 40% at 20% 80%, var(--accent), transparent)`,
          backgroundSize: "100% 100%, 60% 60%, 50% 50%",
          backgroundRepeat: "no-repeat",
          filter: "blur(80px)",
        }}
      />

      <div className="landing-content">
        {/* Nav */}
        <nav className={`landing-nav ${navScrolled ? "scrolled" : ""}`}>
          <div className="landing-nav-logo">Faktox<span>.</span></div>
          <div className="landing-nav-links">
            <a onClick={() => scrollTo("features")}>Features</a>
            <a onClick={() => scrollTo("how")}>So funktioniert's</a>
            <a onClick={() => scrollTo("pricing")}>Preise</a>
            <a onClick={() => scrollTo("faq")}>FAQ</a>
            <button className="landing-nav-login" onClick={() => openLogin()}>Einloggen</button>
            <button className="btn btn-primary btn-sm landing-nav-cta" onClick={() => scrollTo("start")}>
              Kostenlos starten
            </button>
          </div>
          {/* Mobile menu button */}
          <button
            className="landing-nav-mobile-btn"
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            aria-label="Menue"
          >
            <span style={{ fontSize: "1.125rem", lineHeight: 1 }}>≡</span>
          </button>
        </nav>
        <div className="landing-nav-spacer" />

        {/* Mobile drawer */}
        {mobileNavOpen && (
          <>
            <div className="landing-nav-mobile-backdrop open" onClick={() => setMobileNavOpen(false)} />
            <div className="landing-nav-mobile-drawer open">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <div className="landing-nav-logo" style={{ fontSize: "1.125rem" }}>Faktox<span>.</span></div>
                <button
                  className="landing-nav-mobile-btn"
                  onClick={() => setMobileNavOpen(false)}
                  aria-label="Schliessen"
                  style={{ border: "none", fontSize: "1.25rem" }}
                >×</button>
              </div>
              <a onClick={() => { scrollTo("features"); setMobileNavOpen(false); }}>Features</a>
              <a onClick={() => { scrollTo("how"); setMobileNavOpen(false); }}>So funktioniert's</a>
              <a onClick={() => { scrollTo("pricing"); setMobileNavOpen(false); }}>Preise</a>
              <a onClick={() => { scrollTo("faq"); setMobileNavOpen(false); }}>FAQ</a>
              <button className="btn btn-sm" onClick={() => { openLogin(); setMobileNavOpen(false); }}>Einloggen</button>
              <button className="btn btn-primary btn-sm" onClick={() => { scrollTo("start"); setMobileNavOpen(false); }}>Kostenlos starten</button>
            </div>
          </>
        )}

        {/* Hero */}
        <motion.section className="hero" id="start" style={{ y: heroY }}>
          <motion.div
            initial={{ opacity: 1, y: 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
          >
            <span className="hero-badge">Rechnungen + Buchhaltung für Selbständige in AT & DE</span>
            <h1>Rechnung fertig<br />in <span>30 Sekunden.</span></h1>
            <p>
              Foto machen oder diktieren — Faktox erstellt DACH-konforme Rechnungen
              und Honorarnoten, mahnt säumige Kunden automatisch und liefert dir den
              Steuerberater-fertigen Report. Ohne Excel. Ohne Papierkram.
            </p>
            <SignupCta ctaLabel="Kostenlos starten" onDevLogin={(email) => openLogin(email)} />
            <div className="hero-trust">
                          <span><Icon name="credit" size={14} /> Keine Kreditkarte nötig</span>
                          <span><Icon name="check" size={14} /> 3 Rechnungen/Monat gratis</span>
                          <span><Icon name="cancel" size={14} /> Jederzeit kündbar</span>
                        </div>
            <div className="scroll-hint">scroll</div>
          </motion.div>
        </motion.section>

        {/* Value stats strip */}
        <motion.section
          className="stats-strip"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5 }}
        >
          <div className="stats-strip-item">
            <div className="stats-strip-value">30 Sek.</div>
            <div className="stats-strip-label">bis zur fertigen Rechnung</div>
          </div>
          <div className="stats-strip-item">
            <div className="stats-strip-value">100%</div>
            <div className="stats-strip-label">AT & DE konform (UStG)</div>
          </div>
          <div className="stats-strip-item">
            <div className="stats-strip-value">3 Stufen</div>
            <div className="stats-strip-label">automatisches Mahnwesen</div>
          </div>
          <div className="stats-strip-item">
            <div className="stats-strip-value">0</div>
            <div className="stats-strip-label">Excel-Tabellen nötig</div>
          </div>
        </motion.section>

        {/* Features */}
        <motion.section
          className="section"
          id="features"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="section-title">Alles drin. Nichts zu viel.</h2>
          <p className="section-subtitle">Dein komplettes Rechnungs- und Buchhaltungs-Cockpit.</p>

          {/* Dashboard Mockup */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5 }}
          >
            <div className="mockup">
              <div className="mockup-bar">
                <div className="mockup-dot"></div>
                <div className="mockup-dot"></div>
                <div className="mockup-dot"></div>
                <span className="mockup-url">faktox.online/dashboard</span>
              </div>
              <div className="mockup-body">
                <div className="mockup-sidebar">
                  <div className="mockup-sidebar-nav">
                    <div className="mockup-sidebar-item active"><span className="mockup-sidebar-icon"></span>Dashboard</div>
                    <div className="mockup-sidebar-item"><span className="mockup-sidebar-icon"></span>Analytics</div>
                    <div className="mockup-sidebar-item"><span className="mockup-sidebar-icon"></span>Aufträge</div>
                    <div className="mockup-sidebar-item"><span className="mockup-sidebar-icon"></span>Eingang</div>
                    <div className="mockup-sidebar-item"><span className="mockup-sidebar-icon"></span>Kunden</div>
                    <div className="mockup-sidebar-item"><span className="mockup-sidebar-icon"></span>Berichte</div>
                  </div>
                  <div className="mockup-table">
                    <div className="mockup-stats">
                      <div className="mockup-stat">
                        <div className="mockup-stat-label">Einnahmen</div>
                        <div className="mockup-stat-value accent">€ 2.400</div>
                      </div>
                      <div className="mockup-stat">
                        <div className="mockup-stat-label">Ausgaben</div>
                        <div className="mockup-stat-value">€ 879</div>
                      </div>
                      <div className="mockup-stat">
                        <div className="mockup-stat-label">Gewinn</div>
                        <div className="mockup-stat-value">€ 1.521</div>
                      </div>
                      <div className="mockup-stat">
                        <div className="mockup-stat-label">USt-Saldo</div>
                        <div className="mockup-stat-value">€ -488</div>
                      </div>
                    </div>
                    <div className="mockup-table-header">
                      <span>Nummer</span><span>Datum</span><span>Kunde</span><span>Betrag</span><span>Status</span>
                    </div>
                    <div className="mockup-table-row">
                      <span className="num">RE-2026-000001</span><span>05.07.2026</span><span>Andrea Moser</span><span className="amount">€ 900,00</span><span><span className="mockup-badge success">Bezahlt</span></span>
                    </div>
                    <div className="mockup-table-row">
                      <span className="num">RE-2026-000002</span><span>08.07.2026</span><span>TechSupply GmbH</span><span className="amount">€ 1.500,00</span><span><span className="mockup-badge accent">Gesendet</span></span>
                    </div>
                    <div className="mockup-table-row">
                      <span className="num">RE-2026-000003</span><span>12.07.2026</span><span>maighty Labs</span><span className="amount">€ 750,00</span><span><span className="mockup-badge">Entwurf</span></span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Feature cards */}
          <div className="features-grid" style={{ marginTop: "2.5rem" }}>
            {[
                          { icon: "camera", label: "AI", title: "Foto & Voice-Eingabe", desc: "Fotografiere den Stundenzettel oder diktiere die Rechnung. KI extrahiert alle Daten automatisch." },
                          { icon: "dach", label: "DACH", title: "AT & DE konform", desc: "Honorarnoten mit §6 Abs1 Z27 UStG. DE-Rechnungen mit §19 UStG. Kleinunternehmer-Logik automatisch." },
                          { icon: "report", label: "Report", title: "Buchhaltungs-Report", desc: "EÜR nach §4 Abs3 EStG, USt-Voranmeldung, DATEV-Export. Monatlich und jährlich. Steuerberater-fertig." },
                          { icon: "mail", label: "Email", title: "Automatische Abholung", desc: "Rechnungen an eine spezielle Email-Adresse werden automatisch abgeholt, gescannt und abgelegt." },
                          { icon: "bell", label: "Mahnwesen", title: "3-stufiges Mahnwesen", desc: "Zahlungserinnerung, 1. und 2. Mahnung. Automatisch generiert, lückenloser Nummernkreis." },
                          { icon: "shield", label: "Audit", title: "Lückenlos & Storno", desc: "Rechnungsnummern atomar, fortlaufend, nie wiederverwendet. Jede Storno bekommt eine Storno-Rechnung." },
                        ].map((f, i) => (
                          <motion.div
                            key={i}
                            className="feature-card"
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-50px" }}
                            transition={{ duration: 0.4, delay: i * 0.08 }}
                          >
                            <div className="feature-label"><Icon name={f.icon} size={14} /> {f.label}</div>
                            <h3>{f.title}</h3>
                            <p>{f.desc}</p>
                          </motion.div>
                        ))}
          </div>
        </motion.section>

        {/* How it works */}
        <motion.section
          className="section"
          id="how"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="section-title">So funktioniert's</h2>
          <p className="section-subtitle">Drei Schritte. Kein Handbuch nötig.</p>
          <div className="how-grid">
                      {[
                        { icon: "upload", step: "01", title: "Erfassen", desc: "Foto vom Stundenzettel, Diktat oder ein paar Klicks — die KI füllt Empfänger, Positionen und Steuersatz automatisch aus." },
                        { icon: "eye", step: "02", title: "Prüfen & Senden", desc: "Ein Blick auf die Vorschau, bestätigen, fertig. Nummernkreis, Steuertext und Zahlungsziel setzt Faktox korrekt." },
                        { icon: "relax", step: "03", title: "Zurücklehnen", desc: "Faktox überwacht Zahlungseingänge, mahnt automatisch in 3 Stufen und legt alles für deinen Steuerberater ab." },
                      ].map((s, i) => (
                        <motion.div
                          key={i}
                          className="how-item"
                          initial={{ opacity: 0, y: 20 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.4, delay: i * 0.12 }}
                        >
                          <div className="how-step"><Icon name={s.icon} size={18} /></div>
                          <h3>{s.title}</h3>
                          <p>{s.desc}</p>
                        </motion.div>
                      ))}
          </div>
        </motion.section>

        {/* Moat */}
        <motion.section
          className="moat-section"
          id="moat"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="section-title">Warum nicht einfach Excel?</h2>
          <p className="section-subtitle">Vier Gründe warum Faktox Rechnungsstellung sicherer macht.</p>

          {/* Analytics + Upload Mockups */}
          <div className="mockup-row">
            <motion.div
              className="mockup"
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
            >
              <div className="mockup-bar">
                <div className="mockup-dot"></div>
                <div className="mockup-dot"></div>
                <div className="mockup-dot"></div>
                <span className="mockup-url">faktox.online/analytics</span>
              </div>
              <div className="mockup-body">
                <div className="mockup-stats">
                  <div className="mockup-stat">
                    <div className="mockup-stat-label">Jahresgewinn</div>
                    <div className="mockup-stat-value accent">€ 7.521</div>
                  </div>
                  <div className="mockup-stat">
                    <div className="mockup-stat-label">USt-Saldo</div>
                    <div className="mockup-stat-value">€ -488</div>
                  </div>
                </div>
                <div className="mockup-chart">
                  <div className="mockup-bar-chart gray" style={{ height: "20%" }}></div>
                  <div className="mockup-bar-chart" style={{ height: "45%" }}></div>
                  <div className="mockup-bar-chart gray" style={{ height: "15%" }}></div>
                  <div className="mockup-bar-chart" style={{ height: "70%" }}></div>
                  <div className="mockup-bar-chart" style={{ height: "55%" }}></div>
                  <div className="mockup-bar-chart" style={{ height: "90%" }}></div>
                </div>
              </div>
            </motion.div>

            <motion.div
              className="mockup"
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
            >
              <div className="mockup-bar">
                <div className="mockup-dot"></div>
                <div className="mockup-dot"></div>
                <div className="mockup-dot"></div>
                <span className="mockup-url">faktox.online/eingang</span>
              </div>
              <div className="mockup-body">
                <div className="mockup-upload">
                  <div className="mockup-upload-text">Foto oder PDF hierher ziehen</div>
                  <div style={{ fontSize: "0.5625rem", color: "var(--fg-4)", marginTop: "0.5rem" }}>PDF, JPG, PNG · max 10MB</div>
                </div>
                <div className="mockup-table-header">
                  <span>Lieferant</span><span>Betrag</span><span>Status</span>
                </div>
                <div className="mockup-table-row" style={{ gridTemplateColumns: "1fr 0.8fr 0.6fr" }}>
                  <span>Amazon Web Services</span><span className="amount">€ 89,50</span><span><span className="mockup-badge success">Bezahlt</span></span>
                </div>
                <div className="mockup-table-row" style={{ gridTemplateColumns: "1fr 0.8fr 0.6fr" }}>
                  <span>OpenRouter</span><span className="amount">€ 45,00</span><span><span className="mockup-badge accent">Offen</span></span>
                </div>
              </div>
            </motion.div>
          </div>

          <div className="moat-grid" style={{ marginTop: "2.5rem" }}>
                      {[
                        { icon: "lock", title: "UID-Pflicht-Prüfung", desc: "USt-pflichtig ohne UID? Rechnung wird blockiert. Kein Steuerausweis ohne UID-Nummer." },
                        { icon: "refresh", title: "Steuerstatus-Wechsel", desc: "Vom Kleinunternehmer zur USt-Pflicht. System erkennt das Datum und wendet den korrekten Steuersatz an." },
                        { icon: "file", title: "Storno-Logik", desc: "Jede Storno-Rechnung hat eine eigene Nummer. Keine Lücken im Nummernkreis. Vollständiger Audit-Trail." },
                        { icon: "shield", title: "DACH-Moat", desc: "AT/DE Steuerrecht, UStG, Kleinunternehmer-Regelung. US-Tools können das nicht leisten." },
                      ].map((m, i) => (
                        <motion.div
                          key={i}
                          className="moat-item"
                          initial={{ opacity: 0, x: -20 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.4, delay: i * 0.1 }}
                        >
                          <div className="moat-icon"><Icon name={m.icon} size={18} /></div>
                          <h4>{m.title}</h4>
                          <p>{m.desc}</p>
                        </motion.div>
                      ))}
          </div>
        </motion.section>

        {/* Pricing */}
        <motion.section
          className="pricing-section"
          id="pricing"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="section-title">Preise</h2>
          <p className="section-subtitle">Faire Preise. Keine versteckten Kosten. Jederzeit kündbar.</p>
          <div className="plans">
            {[
              {
                name: "Free", price: "0€", period: "/Monat", sub: "Für den Start",
                features: ["3 Rechnungen pro Monat", "3 Aufträge + Angebote", "AT-Honorarnoten + DE-Rechnungen", "Kundenstamm", "Kleinunternehmer-Logik", "Storno-Logik"],
                featured: false,
              },
              {
                name: "Starter", price: "29€", period: "/Monat", sub: "Für Solo-Selbständige",
                features: ["Unbegrenzte Rechnungen", "Unbegrenzte Aufträge + Angebote", "Mahnwesen (3 Stufen)", "Eingangsrechnungen unbegrenzt", "Buchhaltungs-Report (monatlich)", "Storno-Logik"],
                featured: true,
              },
              {
                name: "Pro", price: "49€", period: "/Monat", sub: "Für Anspruchsvolle",
                features: ["Alles aus Starter", "AI Foto-Scan (Vision API)", "AI Diktier- & Texteingabe", "Email-Abholung (IMAP)", "EÜR (§4 Abs3 EStG)", "USt-Voranmeldung-Daten", "DATEV-Export", "Jahresbericht", "Mehrere Unternehmen"],
                featured: false,
              },
            ].map((plan, i) => (
              <motion.div
                key={i}
                className={`plan ${plan.featured ? "featured" : ""}`}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
              >
                <h3>{plan.name}</h3>
                <div className="price">{plan.price}<span> {plan.period}</span></div>
                <div className="price-sub">{plan.sub}</div>
                <ul>
                  {plan.features.map((f, j) => <li key={j}>{f}</li>)}
                </ul>
                <button
                  className={`btn ${plan.featured ? "btn-primary" : ""}`}
                  onClick={() => openLogin()}
                >
                  {plan.name === "Free" ? "Kostenlos starten" : `${plan.name} wählen`}
                </button>
              </motion.div>
            ))}
          </div>
          <p className="pricing-note">
            Alle Pläne starten kostenlos — Upgrade erst, wenn du mehr brauchst. Preise inkl. USt.
          </p>
        </motion.section>

        {/* Skill Section */}
        <motion.section
          className="section"
          id="skill"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="section-title">Faktox als Skill</h2>
          <p className="section-subtitle">Der komplette Rechnungs-Agent als Skill für Claude Code, Cursor & Co.</p>

          <div className="skill-card">
            <div className="skill-header">
              <div>
                <span className="feature-label">FÜR ENTWICKLER</span>
                <h3 style={{ fontSize: "1.5rem", fontWeight: 700, marginTop: "0.5rem" }}>Faktox Invoice Agent</h3>
                <p style={{ fontSize: "0.875rem", color: "var(--fg-2)", marginTop: "0.5rem" }}>
                  13 Python-Scripts + SKILL.md + Templates. DACH-konform, mit AI Foto-Scan,
                  Mahnwesen, Buchhaltungs-Report. Installiere es in deinem AI-Assistenten
                  und erstelle Rechnungen per Voice oder Text.
                </p>
              </div>
              <div className="skill-price">249€<span>einmalig</span></div>
            </div>

            <div className="skill-features">
              {[
                "13 Production-Scripts (Python)",
                "AT-Honorarnoten + DE-Rechnungen",
                "AI Foto-Scan (Vision API)",
                "Lückenloser Nummernkreis + Storno",
                "Steuerstatus-Wechsel (Kleinunternehmer → USt-pflichtig)",
                "Mahnwesen (3 Stufen)",
                "Buchhaltungs-Report (EÜR, UStVA, DATEV)",
                "Eingangsrechnungen + Email-Abholung",
                "Komplette SKILL.md mit Anleitung",
                "JSON Templates (AT + DE)",
                "Einzelplatz-Lizenz, sofort downloadbar",
                "Fortlaufende Updates inklusive — immer die aktuellste Version",
              ].map((f, i) => (
                <div className="skill-feature" key={i}>
                  <span className="skill-check">—</span>
                  <span>{f}</span>
                </div>
              ))}
            </div>

            <div className="skill-cta">
              <input
                className="input"
                type="email"
                placeholder="deine@email.at"
                value={skillEmail}
                onChange={(e) => setSkillEmail(e.target.value)}
              />
              <button className="btn btn-primary" onClick={handleSkillBuy} disabled={skillBuying}>
                {skillBuying ? "Weiterleitung..." : "Jetzt kaufen — 249€"}
              </button>
            </div>

            <p style={{ fontSize: "0.6875rem", color: "var(--fg-4)", marginTop: "0.75rem", textAlign: "center" }}>
              Nach Zahlungseingang erhältst du sofort den Download-Link per Email.
            </p>
          </div>
        </motion.section>

        {/* FAQ */}
        <motion.section
          className="section faq-section"
          id="faq"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="section-title">Häufige Fragen</h2>
          <p className="section-subtitle">Alles, was du vor dem Start wissen willst.</p>
          <div className="faq-list">
            {[
              { q: "Ist Faktox wirklich kostenlos? Ja. Der Free-Plan mit 3 Rechnungen und 3 Aufträgen pro Monat ist dauerhaft kostenlos — ohne Kreditkarte. Erst wenn du mehr brauchst, lohnt sich Starter (29€/Monat)." },
              { q: "Sind die Rechnungen rechtskonform für Österreich und Deutschland?", a: "Ja. Faktox erstellt AT-Honorarnoten mit §6 Abs1 Z27 UStG-Hinweis und DE-Rechnungen mit §19 UStG. Kleinunternehmer-Regelung, Reverse Charge und Steuerstatus-Wechsel werden automatisch korrekt abgebildet. Faktox ersetzt keine Steuerberatung." },
              { q: "Wie funktioniert der Foto-Scan?", a: "Du lädst ein Foto oder PDF einer Rechnung hoch — die KI extrahiert Lieferant, Beträge, Steuersatz und Kategorie automatisch und legt die Eingangsrechnung sauber ab. Verfügbar ab dem Pro-Plan." },
              { q: "Was passiert mit meinen Daten?", a: "Deine Daten liegen verschlüsselt auf EU-Servern (Convex, Region eu-west-1). Tägliche automatische Backups, 90 Tage Aufbewahrung, jederzeit vollständiger JSON-Export mit einem Klick. DSGVO-konform." },
              { q: "Kann ich jederzeit kündigen?", a: "Ja. Monatlich kündbar, direkt im Stripe-Portal unter Einstellungen. Deine Daten bleiben erhalten und exportierbar — auch im Free-Plan." },
              { q: "Brauche ich Buchhaltungswissen?", a: "Nein. Faktox nimmt dir Nummernkreis, Steuertexte, Mahnfristen und Reports ab. Für den Jahresabschluss exportierst du einfach den Steuerberater-fertigen Report (EÜR, UStVA, DATEV)." },
            ].map((item, i) => (
              <details className="faq-item" key={i}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </motion.section>

        {/* Final CTA */}
        <motion.section
          className="final-cta"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2>Starte heute.</h2>
          <p>Keine Kreditkarte nötig. 3 Rechnungen gratis. Upgrade jederzeit.</p>
          <SignupCta ctaLabel="Kostenlos starten" onDevLogin={(email) => openLogin(email)} />
        </motion.section>

        {/* Footer */}
        <footer className="landing-footer">
          <div className="footer-grid">
            <div className="footer-col">
              <div className="footer-brand">Faktox<span>.</span></div>
              <p>Rechnungen + Buchhaltung mit KI fuer Selbständige in AT & DE.</p>
            </div>
            <div className="footer-col">
              <h4>Produkt</h4>
              <a onClick={() => scrollTo("features")}>Features</a>
              <a onClick={() => scrollTo("pricing")}>Preise</a>
              <a onClick={() => scrollTo("how")}>So funktioniert's</a>
              <a onClick={() => scrollTo("faq")}>FAQ</a>
            </div>
            <div className="footer-col">
              <h4>Rechtliches</h4>
              <a href="/legal/impressum">Impressum</a>
              <a href="/legal/datenschutz">Datenschutz</a>
              <a href="/legal/agb">AGB</a>
              <a href="/legal/cookies">Cookie-Richtlinie</a>
            </div>
            <div className="footer-col">
              <h4>Kontakt</h4>
              <a href="https://maighty-labs.com" target="_blank" rel="noopener">maighty-labs.com</a>
              <a href="mailto:info@maighty-labs.com">info@maighty-labs.com</a>
            </div>
          </div>
          <div className="footer-bottom">
            <p>© 2026 maighty Labs. Alle Rechte vorbehalten. Faktox ersetzt keine Steuerberatung.</p>
          </div>
        </footer>
      </div>

      {/* Login modal */}
      {showLogin && !auth.userId && (
        <LoginModal initialEmail={loginEmail} onClose={() => setShowLogin(false)} />
      )}
        </>
      )}

      {/* Download page for skill buyers (works on both landing + dashboard) */}
      {downloadToken && (
        <Suspense fallback={<div style={{ padding: "2rem", textAlign: "center", color: "var(--fg-3)" }}>Lade...</div>}>
        <SkillDownloadPage token={downloadToken} />
        </Suspense>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Signup CTA — Email rein, Magic-Link raus. Landet zusätzlich
// in der Waitlist (Marketing), Login-Flow startet sofort.
// ═══════════════════════════════════════════════════════════
function SignupCta({ ctaLabel, onDevLogin }: { ctaLabel: string; onDevLogin: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const requestMagicLink = useMutation(api.auth.requestMagicLink);
  const joinWaitlist = useMutation(api.waitlist.join);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || state === "sending") return;
    setState("sending");
    setError("");
    try {
      // Capture email for marketing regardless of login outcome
      joinWaitlist({ email }).catch(() => {});
      const result = await requestMagicLink({ email });
      if (result.success === false) {
        setError(result.message || "Bitte warte vor der nächsten Anfrage");
        setState("error");
        return;
      }
      if (result.dev) {
        // No email provider configured — hand over to the login modal
        // where the dev token can be entered manually.
        onDevLogin(email);
        setState("idle");
        return;
      }
      setState("sent");
    } catch (err: any) {
      setError(err.message || "Fehler beim Senden");
      setState("error");
    }
  };

  if (state === "sent") {
    return (
      <div className="waitlist-success">
        <div className="waitlist-success-text">Login-Link gesendet an {email}</div>
        <p style={{ fontSize: "0.8125rem", color: "var(--fg-3)" }}>
          Check dein Postfach — der Link ist 15 Minuten gültig.
        </p>
      </div>
    );
  }

  return (
    <form className="hero-cta" onSubmit={handleSubmit}>
      <input
        className="hero-input"
        type="email"
        placeholder="deine@email.at"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <button type="submit" className="btn btn-primary btn-lg" disabled={state === "sending"}>
        {state === "sending" ? "Sende Login-Link..." : ctaLabel}
      </button>
      {state === "error" && (
        <div className="hero-cta-error">{error}</div>
      )}
    </form>
  );
}

// ═══════════════════════════════════════════════════════════
// Magic-Link Verify — Ziel des Email-Links (/auth/verify?token=)
// ═══════════════════════════════════════════════════════════
function MagicLinkVerify({ token }: { token: string }) {
  const [error, setError] = useState("");
  const [inAppBrowser, setInAppBrowser] = useState(false);
  const completeLogin = useMutation(api.auth.completeLogin);

  useEffect(() => {
    // Detect in-app browser (Gmail, Instagram, Facebook, etc.)
    const ua = navigator.userAgent.toLowerCase();
    const isInApp = ua.includes("gmail") || ua.includes("inbox") ||
      (ua.includes("instagram") && !ua.includes("chrome")) ||
      (ua.includes("fban") && !ua.includes("chrome")) ||
      (ua.includes("line") && !ua.includes("chrome")) ||
      ua.includes("wv") || // Android WebView
      (navigator.standalone === false && !ua.includes("safari") && !ua.includes("chrome") && !ua.includes("firefox") && !ua.includes("edge"));

    if (isInApp) {
      setInAppBrowser(true);
      return; // Don't auto-login in in-app browser — session won't persist
    }

    let cancelled = false;
    (async () => {
      try {
        const result = await completeLogin({ token });
        if (cancelled) return;
        if (!result.success) {
          if (!cancelled) setError(result.error || "Token ungültig oder abgelaufen");
          return;
        }
        localStorage.setItem("faktox_session", result.sessionToken!);
        window.history.replaceState({}, "", "/");
        window.location.reload();
      } catch (err: any) {
        if (!cancelled) setError(err.message || "Token ungültig oder abgelaufen");
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const currentUrl = window.location.href;

  return (
    <div className="auth-page">
      <div className="auth-box" style={{ textAlign: "center" }}>
        <h1>Faktox<span>.</span></h1>

        {inAppBrowser && (
          <>
            <p style={{ marginTop: "1rem", fontSize: "0.9375rem", color: "var(--fg-2)" }}>
              Du öffnest diesen Link in einem App-internen Browser.
            </p>
            <p style={{ marginTop: "0.5rem", fontSize: "0.8125rem", color: "var(--fg-3)" }}>
              Damit dein Login gespeichert wird, öffne den Link in deinem Standard-Browser (Safari oder Chrome).
            </p>
            <div style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
              <button
                className="btn btn-primary"
                onClick={() => {
                  // Try to open in default browser — works on most platforms
                  window.location.href = currentUrl;
                }}
                style={{ width: "100%", justifyContent: "center" }}
              >
                In Browser öffnen
              </button>
              <button
                className="btn"
                onClick={() => {
                  navigator.clipboard?.writeText(currentUrl).then(() => {
                    alert("Link kopiert. Öffne deinen Browser und füge ihn ein.");
                  }).catch(() => {
                    // Fallback — show the URL
                    prompt("Kopiere diesen Link:", currentUrl);
                  });
                }}
                style={{ width: "100%", justifyContent: "center" }}
              >
                Link kopieren
              </button>
            </div>
            <p style={{ marginTop: "1.5rem", fontSize: "0.75rem", color: "var(--fg-4)" }}>
              Tipp: Halte den Login-Button in der Email gedrückt und wähle "In Safari öffnen" oder "In Chrome öffnen".
            </p>
          </>
        )}

        {!inAppBrowser && error && (
          <>
            <p style={{ color: "var(--danger)", marginTop: "1rem" }}>{error}</p>
            <button
              className="btn btn-primary"
              style={{ marginTop: "1rem" }}
              onClick={() => { window.history.replaceState({}, "", "/"); window.location.reload(); }}
            >
              Zurück zur Startseite
            </button>
          </>
        )}

        {!inAppBrowser && !error && (
          <p style={{ marginTop: "1rem" }}>Einloggen...</p>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Login Modal — Magic-Link anfordern (+ Dev-Token-Eingabe)
// ═══════════════════════════════════════════════════════════
function LoginModal({ initialEmail, onClose }: { initialEmail?: string; onClose: () => void }) {
  const [email, setEmail] = useState(initialEmail || "");
  const [sent, setSent] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [verifyToken, setVerifyToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const requestMagicLink = useMutation(api.auth.requestMagicLink);
  const verifyMagicLink = useMutation(api.auth.completeLogin);

  const handleRequest = async () => {
    if (!email || busy) return;
    setError("");
    setBusy(true);
    try {
      const result = await requestMagicLink({ email });
      if (result.success === false) {
        setError(result.message || "Bitte warte vor der nächsten Anfrage");
        return;
      }
      if (result.dev && result.token) {
        // Dev mode — token comes back directly
        setDevMode(true);
        setVerifyToken(result.token);
      }
      setSent(true);
    } catch (err: any) {
      setError(err.message || "Fehler beim Senden");
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    if (!verifyToken || busy) return;
    setError("");
    setBusy(true);
    try {
      const result = await verifyMagicLink({ token: verifyToken });
      if (!result.success) {
        setError(result.error || "Token ungültig");
        return;
      }
      if (result.sessionToken) {
        localStorage.setItem("faktox_session", result.sessionToken);
        window.location.reload(); // Reload to trigger useAuth
      }
    } catch (err: any) {
      setError(err.message || "Token ungültig");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "min(400px, 100%)" }}>
        <div className="modal-header">
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Faktox<span style={{ color: "var(--accent)" }}>.</span></h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {error && (
            <div style={{ marginBottom: "0.75rem", padding: "0.75rem", border: "1px solid var(--danger)", color: "var(--danger)", fontSize: "0.8125rem" }}>
              {error}
            </div>
          )}
          {sent && !devMode ? (
            <div style={{ textAlign: "center" }}>
              <p style={{ color: "var(--success)", marginBottom: "0.5rem" }}>Login-Link gesendet an {email}</p>
              <p style={{ fontSize: "0.75rem", color: "var(--fg-3)" }}>
                Check dein Postfach — der Link ist 15 Minuten gültig.
              </p>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: "1rem" }} onClick={() => setSent(false)}>
                Andere Email verwenden
              </button>
            </div>
          ) : sent && devMode ? (
            <>
              <p style={{ marginBottom: "0.75rem", fontSize: "0.8125rem", color: "var(--fg-3)" }}>
                Dev-Modus (kein Email-Versand konfiguriert): Token bestätigen zum Einloggen
              </p>
              <input
                className="input"
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                placeholder="magic-link-token"
                style={{ marginBottom: "0.75rem" }}
              />
              <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={handleVerify} disabled={busy}>
                {busy ? "Prüfe..." : "Einloggen"}
              </button>
            </>
          ) : (
            <>
              <p style={{ marginBottom: "1rem", fontSize: "0.8125rem", color: "var(--fg-3)" }}>
                Einloggen oder Account erstellen — mit Magic-Link, ohne Passwort.
              </p>
              <input
                className="input"
                type="email"
                placeholder="deine@email.at"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ marginBottom: "0.75rem" }}
                onKeyDown={(e) => e.key === "Enter" && handleRequest()}
                autoFocus
              />
              <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={handleRequest} disabled={busy}>
                {busy ? "Sende..." : "Magic-Link anfordern"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
