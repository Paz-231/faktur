import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

export function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  const requestMagicLink = useMutation(api.auth.requestMagicLink);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setStatus("sending");
    setError("");
    try {
      const result = await requestMagicLink({ email });
      if (result.dev) {
        // Dev mode — show link directly
        setStatus("sent");
        setError(`DEV: ${result.link}`);
      } else {
        setStatus("sent");
      }
    } catch (err: any) {
      setStatus("error");
      setError(err.message || "Fehler beim Senden");
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-box">
        <h1>Faktur<span>.</span></h1>
        <p>Einloggen mit Magic-Link</p>

        {status === "sent" ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ color: "var(--success)", fontSize: "1rem", marginBottom: "1rem" }}>
              ✅ Magic-Link gesendet!
            </div>
            <p style={{ opacity: 0.6, fontSize: "0.8125rem" }}>
              Check dein Postfach: {email}. Der Link ist 15 Minuten gültig.
            </p>
            {error && (
              <div style={{ marginTop: "1rem", padding: "0.75rem", background: "var(--surface-2)", border: "1px solid var(--border)", wordBreak: "break-all", fontSize: "0.75rem" }}>
                {error}
              </div>
            )}
            <button onClick={() => setStatus("idle")} className="btn btn-ghost btn-sm" style={{ marginTop: "1.5rem" }}>
              Andere Email verwenden
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              type="email"
              placeholder="deine@email.at"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status === "sending"}
              className="auth-input"
              required
            />
            <button
              type="submit"
              disabled={status === "sending"}
              className="auth-btn"
            >
              {status === "sending" ? "Sende..." : "Magic-Link anfordern"}
            </button>
            {error && status === "error" && (
              <p style={{ color: "var(--danger)", marginTop: "0.75rem", fontSize: "0.8125rem", textAlign: "center" }}>{error}</p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

export function VerifyPage({ token, onSuccess }: { token: string; onSuccess: () => void }) {
  const [error, setError] = useState("");
  const verifyMagicLink = useMutation(api.auth.completeLogin);

  useState(() => {
    (async () => {
      try {
        const result = await verifyMagicLink({ token });
        localStorage.setItem("faktur_auth", JSON.stringify(result));
        onSuccess();
      } catch (err: any) {
        setError(err.message || "Token ungültig");
      }
    })();
  });

  return (
    <div className="auth-page">
      <div className="auth-box" style={{ textAlign: "center" }}>
        {error ? (
          <>
            <h1 style={{ color: "var(--danger)" }}>❌ Login fehlgeschlagen</h1>
            <p style={{ opacity: 0.6, marginTop: "0.5rem" }}>{error}</p>
          </>
        ) : (
          <>
            <h1>Faktur<span>.</span></h1>
            <p>Einloggen...</p>
          </>
        )}
      </div>
    </div>
  );
}
