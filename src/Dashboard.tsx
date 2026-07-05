interface DashboardProps {
  auth: { userId: string; email: string; name: string; plan: string };
  onLogout: () => void;
}

export function Dashboard({ auth, onLogout }: DashboardProps) {
  return (
    <div style={{ minHeight: "100vh", background: "#0D3B4C", color: "#fff", padding: "2rem" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "1.8rem" }}>Faktur Dashboard</h1>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <span style={{ opacity: 0.7, fontSize: "0.9rem" }}>
              {auth.email} · {auth.plan}
            </span>
            <button
              onClick={onLogout}
              style={{
                background: "rgba(255,255,255,0.1)",
                border: "none",
                color: "#fff",
                padding: "0.5rem 1rem",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Logout
            </button>
          </div>
        </div>

        {/* Welcome */}
        <div style={{ background: "rgba(255,255,255,0.08)", padding: "2rem", borderRadius: 12, marginBottom: "2rem" }}>
          <h2 style={{ fontSize: "1.4rem", marginBottom: "0.5rem" }}>
            Willkommen, {auth.name}! 👋
          </h2>
          <p style={{ opacity: 0.7 }}>
            Dein Dashboard wird hier eingerichtet. Bald kannst du Rechnungen erstellen,
            Kunden verwalten und Buchhaltungs-Reports generieren.
          </p>
        </div>

        {/* Placeholder cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "1rem" }}>
          <div style={{ background: "rgba(255,255,255,0.08)", padding: "1.5rem", borderRadius: 12 }}>
            <h3 style={{ color: "#E8A48C", marginBottom: "0.5rem" }}>📄 Ausgangsrechnungen</h3>
            <p style={{ opacity: 0.6 }}>Bald: Rechnungen erstellen und verwalten</p>
          </div>
          <div style={{ background: "rgba(255,255,255,0.08)", padding: "1.5rem", borderRadius: 12 }}>
            <h3 style={{ color: "#E8A48C", marginBottom: "0.5rem" }}>📥 Eingangsrechnungen</h3>
            <p style={{ opacity: 0.6 }}>Bald: Lieferanten-Rechnungen erfassen</p>
          </div>
          <div style={{ background: "rgba(255,255,255,0.08)", padding: "1.5rem", borderRadius: 12 }}>
            <h3 style={{ color: "#E8A48C", marginBottom: "0.5rem" }}>👥 Kunden</h3>
            <p style={{ opacity: 0.6 }}>Bald: Kundenstamm verwalten</p>
          </div>
          <div style={{ background: "rgba(255,255,255,0.08)", padding: "1.5rem", borderRadius: 12 }}>
            <h3 style={{ color: "#E8A48C", marginBottom: "0.5rem" }}>📊 Berichte</h3>
            <p style={{ opacity: 0.6 }}>Bald: EÜR, USt-Voranmeldung, DATEV-Export</p>
          </div>
        </div>
      </div>
    </div>
  );
}
