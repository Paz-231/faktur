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
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0D3B4C" }}>
      <div style={{ background: "rgba(255,255,255,0.08)", padding: "3rem", borderRadius: 16, maxWidth: 420, width: "90%" }}>
        <h1 style={{ textAlign: "center", fontSize: "2rem", marginBottom: "0.5rem" }}>Faktur</h1>
        <p style={{ textAlign: "center", opacity: 0.7, marginBottom: "2rem" }}>Einloggen mit Magic-Link</p>

        {status === "sent" ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ color: "#8DAA8C", fontSize: "1.1rem", marginBottom: "1rem" }}>
              ✅ Magic-Link gesendet!
            </div>
            <p style={{ opacity: 0.7, fontSize: "0.9rem" }}>
              Check dein Postfach: {email}. Der Link ist 15 Minuten gültig.
            </p>
            {error && (
              <div style={{ marginTop: "1rem", padding: "1rem", background: "rgba(255,255,255,0.05)", borderRadius: 8, wordBreak: "break-all", fontSize: "0.8rem" }}>
                {error}
              </div>
            )}
            <button onClick={() => setStatus("idle")} style={{ marginTop: "1.5rem", background: "none", border: "none", color: "#E8A48C", cursor: "pointer", textDecoration: "underline" }}>
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
              style={{
                width: "100%",
                padding: "1rem 1.5rem",
                borderRadius: 8,
                border: "none",
                fontSize: "1rem",
                marginBottom: "1rem",
                background: "rgba(255,255,255,0.95)",
              }}
              required
            />
            <button
              type="submit"
              disabled={status === "sending"}
              style={{
                width: "100%",
                padding: "1rem",
                borderRadius: 8,
                border: "none",
                background: "#E8A48C",
                color: "#0D3B4C",
                fontWeight: 700,
                fontSize: "1.1rem",
                cursor: status === "sending" ? "wait" : "pointer",
              }}
            >
              {status === "sending" ? "Sende..." : "Magic-Link anfordern"}
            </button>
            {error && status === "error" && (
              <p style={{ color: "#E8A48C", marginTop: "1rem", fontSize: "0.9rem" }}>{error}</p>
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
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0D3B4C" }}>
      <div style={{ textAlign: "center" }}>
        {error ? (
          <>
            <h1 style={{ color: "#E8A48C" }}>❌ Login fehlgeschlagen</h1>
            <p style={{ opacity: 0.7 }}>{error}</p>
          </>
        ) : (
          <>
            <h1>Einloggen...</h1>
            <p style={{ opacity: 0.7 }}>Überprüfe Token...</p>
          </>
        )}
      </div>
    </div>
  );
}
