import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../convex/_generated/api";

interface UpgradeModalProps {
  auth: { userId: string; email: string; plan: string };
  onClose: () => void;
}

export function UpgradeModal({ auth, onClose }: UpgradeModalProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const createCheckout = useAction(api.auth.createCheckoutSession);

  const handleUpgrade = async (plan: "starter" | "pro") => {
    setLoading(plan);
    try {
      const result = await createCheckout({
        userId: auth.userId as any,
        email: auth.email,
        plan,
      });
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      } else {
        alert("Stripe noch nicht konfiguriert. Setze STRIPE_SECRET_KEY und STRIPE_PRICE_* env vars.");
      }
    } catch (err: any) {
      alert(err.message || "Fehler beim Starten des Checkouts");
    } finally {
      setLoading(null);
    }
  };

  const plans = [
    {
      id: "starter" as const,
      name: "Starter",
      price: "14,90€",
      features: [
        "Unbegrenzte Rechnungen",
        "Unbegrenzte Aufträge + Angebote",
        "Foto/PDF Upload + AI Vision-Scan",
        "Mahnwesen (3 Stufen)",
        "Eingangsrechnungen unbegrenzt",
        "Buchhaltungs-Report (monatlich)",
      ],
      featured: true,
    },
    {
      id: "pro" as const,
      name: "Pro",
      price: "29,90€",
      features: [
        "Alles aus Starter",
        "Email-Abholung (IMAP)",
        "EÜR (§4 Abs3 EStG)",
        "USt-Voranmeldung-Daten",
        "DATEV-Export",
        "Jahresbericht",
        "Mehrere Unternehmen",
      ],
      featured: false,
    },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Plan wählen</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: "1.5rem", color: "var(--fg-3)" }}>
            Du bist aktuell im <strong style={{ color: "var(--accent)" }}>{auth.plan}</strong> Plan.
          </p>
          <div style={{ display: "grid", gap: "1rem" }}>
            {plans.map((plan) => (
              <div
                key={plan.id}
                className="card"
                style={{
                  border: plan.featured ? "2px solid var(--accent)" : "1px solid var(--border)",
                  padding: "1.5rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <h3 style={{ fontSize: "1.125rem", fontWeight: 600 }}>{plan.name}</h3>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--accent)" }}>
                    {plan.price}<span style={{ fontSize: "0.75rem", fontWeight: 400, opacity: 0.6 }}>/Monat</span>
                  </div>
                </div>
                <ul style={{ listStyle: "none", margin: "1rem 0" }}>
                  {plan.features.map((f) => (
                    <li key={f} style={{ padding: "0.25rem 0", fontSize: "0.8125rem", color: "var(--fg-2)" }}>
                      <span style={{ color: "var(--success)", marginRight: "0.5rem" }}>·</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  className="btn btn-primary"
                  style={{ width: "100%", justifyContent: "center" }}
                  disabled={loading === plan.id || auth.plan === plan.id}
                  onClick={() => handleUpgrade(plan.id)}
                >
                  {loading === plan.id ? "Weiterleitung..." :
                   auth.plan === plan.id ? "Aktueller Plan" :
                   `${plan.name} wählen`}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
