import { useState, useEffect, lazy, Suspense } from "react";
import { useMutation } from "convex/react";
import { useAuth } from "./useAuth";
import { api } from "../convex/_generated/api";

// Code-split: Landing, Dashboard und SkillDownloadPage werden lazy
// geladen — Besucher laden nur, was ihre Route braucht.
const LandingPage = lazy(() => import("./LandingPage"));
const Dashboard = lazy(() => import("./Dashboard").then(m => ({ default: m.Dashboard })));
const SkillDownloadPage = lazy(() => import("./SkillDownloadPage").then(m => ({ default: m.SkillDownloadPage })));

export default function App() {
  const [showLogin, setShowLogin] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
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

      {/* Otherwise show landing page (lazy — enthält framer-motion) */}
      {!auth.userId && !authLoading && !downloadToken && (
        <Suspense fallback={<div className="landing-loading">Faktox<span>.</span></div>}>
          <LandingPage onOpenLogin={openLogin} />
        </Suspense>
      )}

      {/* Login modal */}
      {showLogin && !auth.userId && (
        <LoginModal initialEmail={loginEmail} onClose={() => setShowLogin(false)} />
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
