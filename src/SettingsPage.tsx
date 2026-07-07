import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import { convexSiteUrl } from "./lib";

interface SettingsPageProps {
  auth: { userId: string; email: string; name: string; plan: string };
}

const TAX_MODES = [
  { value: "kleinunternehmer", label: "Kleinunternehmer (0% USt)" },
  { value: "ust_standard", label: "USt-pflichtig (AT 20% / DE 19%)" },
  { value: "ust_ermaessigt", label: "Ermäßigt (AT 10% / DE 7%)" },
  { value: "reverse_charge", label: "Reverse Charge (0%)" },
  { value: "befreit", label: "Befreit (0%)" },
];

export function SettingsPage({ auth }: SettingsPageProps) {
  const settings = useQuery(api.settings.get, { userId: auth.userId as any });
  const profile = useQuery(api.profile.get, { userId: auth.userId as any });
  const upsertSettings = useMutation(api.settings.upsert);
  const createProfile = useMutation(api.profile.create);
  const updateBusinessProfile = useMutation(api.profile.update);
  const changeTaxStatus = useMutation(api.profile.changeTaxStatus);
  const createBillingPortal = useAction(api.auth.createBillingPortal);

  const [rechnungMode, setRechnungMode] = useState<"auto" | "manual">("manual");
  const [defaultTaxMode, setDefaultTaxMode] = useState("kleinunternehmer");
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Profile form
  const [profileForm, setProfileForm] = useState({
    name: "",
    street: "",
    postalCityCountry: "",
    country: "AT",
    email: "",
    phone: "",
    legalForm: "einzelunternehmen",
    bankOwner: "",
    iban: "",
    bic: "",
    currentUid: "",
    currentTaxStatus: "kleinunternehmer",
    currentTaxRate: 0,
  });
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // Tax status change
  const [showTaxChange, setShowTaxChange] = useState(false);
  const [newTaxStatus, setNewTaxStatus] = useState("ust_standard");
  const [newTaxRate, setNewTaxRate] = useState(20);
  const [newTaxDate, setNewTaxDate] = useState(new Date().toISOString().split("T")[0]);
  const [newTaxReason, setNewTaxReason] = useState("");
  const [savingTax, setSavingTax] = useState(false);

  // Billing portal
  const [billingLoading, setBillingLoading] = useState(false);

  // Sync settings from query
  if (settings && !settingsLoaded) {
    setRechnungMode(settings.rechnungMode as "auto" | "manual");
    setDefaultTaxMode(settings.defaultTaxMode);
    setSettingsLoaded(true);
  }

  // Sync profile from query
  if (profile && !profileLoaded) {
    setProfileForm({
      name: profile.name || "",
      street: profile.street || "",
      postalCityCountry: profile.postalCityCountry || "",
      country: profile.country || "AT",
      email: profile.email || "",
      phone: profile.phone || "",
      legalForm: profile.legalForm || "einzelunternehmen",
      bankOwner: profile.bankOwner || "",
      iban: profile.iban || "",
      bic: profile.bic || "",
      currentUid: profile.currentUid || "",
      currentTaxStatus: profile.currentTaxStatus || "kleinunternehmer",
      currentTaxRate: profile.currentTaxRate || 0,
    });
    setProfileLoaded(true);
  }

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await upsertSettings({
        userId: auth.userId as any,
        rechnungMode,
        defaultTaxMode,
      });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      if (profile) {
        await updateBusinessProfile({
          profileId: profile._id,
          name: profileForm.name || undefined,
          street: profileForm.street || undefined,
          postalCityCountry: profileForm.postalCityCountry || undefined,
          country: profileForm.country || undefined,
          email: profileForm.email || undefined,
          phone: profileForm.phone || undefined,
          legalForm: profileForm.legalForm || undefined,
          bankOwner: profileForm.bankOwner || undefined,
          iban: profileForm.iban || undefined,
          bic: profileForm.bic || undefined,
          currentUid: profileForm.currentUid || undefined,
        });
      } else {
        // Create new profile
        await createProfile({
          userId: auth.userId as any,
          name: profileForm.name,
          street: profileForm.street,
          postalCityCountry: profileForm.postalCityCountry,
          country: profileForm.country,
          email: profileForm.email || undefined,
          phone: profileForm.phone || undefined,
          legalForm: profileForm.legalForm,
          bankOwner: profileForm.bankOwner || undefined,
          iban: profileForm.iban || undefined,
          bic: profileForm.bic || undefined,
          currentUid: profileForm.currentUid || undefined,
          currentTaxStatus: profileForm.currentTaxStatus,
          currentTaxRate: profileForm.currentTaxRate,
        });
      }
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleTaxChange = async () => {
    setSavingTax(true);
    try {
      if (profile) {
        await changeTaxStatus({
          profileId: profile._id,
          status: newTaxStatus,
          rate: newTaxRate,
          validFrom: newTaxDate,
          reason: newTaxReason || undefined,
        });
        setShowTaxChange(false);
        setProfileLoaded(false); // Force reload
      }
    } finally {
      setSavingTax(false);
    }
  };

  const handleBillingPortal = async () => {
    setBillingLoading(true);
    try {
      const result = await createBillingPortal({ userId: auth.userId as any });
      if (result.portalUrl) {
        window.location.href = result.portalUrl;
      } else {
        alert("Stripe noch nicht konfiguriert oder kein aktives Abo.");
      }
    } finally {
      setBillingLoading(false);
    }
  };

  const taxRateForMode: Record<string, number> = {
    kleinunternehmer: 0,
    ust_standard: 20,
    ust_ermaessigt: 10,
    reverse_charge: 0,
    befreit: 0,
  };

  return (
    <div className="slide-up">
      <div className="page-header">
        <h1 className="page-title">Einstellungen</h1>
      </div>

      {/* Rechnung-Modus */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h4 style={{ marginBottom: "0.75rem" }}>Rechnung-Generierung</h4>
        <p style={{ marginBottom: "1rem", fontSize: "0.8125rem" }}>
          Lege fest, wann Rechnungen aus Aufträgen generiert werden.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
          <div
            onClick={() => setRechnungMode("manual")}
            style={{
              flex: 1,
              padding: "1rem",
              border: rechnungMode === "manual" ? "2px solid var(--accent)" : "1px solid var(--border)",
              background: rechnungMode === "manual" ? "var(--surface-2)" : "var(--surface)",
              cursor: "pointer",
              transition: "border-color 0.15s ease",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: "0.25rem", fontSize: "0.875rem" }}>Manuell</div>
            <div style={{ fontSize: "0.75rem", color: "var(--fg-3)" }}>
              Rechnung wird erstellt wenn du im Auftrag auf "Rechnung erstellen" klickst.
            </div>
          </div>
          <div
            onClick={() => setRechnungMode("auto")}
            style={{
              flex: 1,
              padding: "1rem",
              border: rechnungMode === "auto" ? "2px solid var(--accent)" : "1px solid var(--border)",
              background: rechnungMode === "auto" ? "var(--surface-2)" : "var(--surface)",
              cursor: "pointer",
              transition: "border-color 0.15s ease",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: "0.25rem", fontSize: "0.875rem" }}>Automatisch</div>
            <div style={{ fontSize: "0.75rem", color: "var(--fg-3)" }}>
              Rechnung wird automatisch generiert wenn ein Auftrag bestätigt wird.
            </div>
          </div>
        </div>
        <div className="field-group">
          <label className="label">Standard-Steuerstatus</label>
          <select className="select" value={defaultTaxMode} onChange={(e) => setDefaultTaxMode(e.target.value)}>
            {TAX_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <button className="btn btn-primary btn-sm" onClick={handleSaveSettings} disabled={savingSettings} style={{ marginTop: "0.5rem" }}>
          {savingSettings ? "Speichere..." : settingsSaved ? "· Gespeichert" : "Einstellungen speichern"}
        </button>
      </div>

      {/* Unternehmensprofil */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h4 style={{ marginBottom: "0.75rem" }}>Unternehmensprofil</h4>
        <p style={{ marginBottom: "1rem", fontSize: "0.8125rem" }}>
          Diese Daten erscheinen auf deinen Rechnungen als Absender.
        </p>

        <div className="field-group">
          <label className="label">Name / Firma</label>
          <input className="input" value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} placeholder="Max Mustermann" />
        </div>
        <div className="field-group">
          <label className="label">Straße</label>
          <input className="input" value={profileForm.street} onChange={(e) => setProfileForm({ ...profileForm, street: e.target.value })} placeholder="Musterstraße 1" />
        </div>
        <div className="field-row">
          <div className="field-group">
            <label className="label">PLZ + Ort + Land</label>
            <input className="input" value={profileForm.postalCityCountry} onChange={(e) => setProfileForm({ ...profileForm, postalCityCountry: e.target.value })} placeholder="1010 Wien, Österreich" />
          </div>
          <div className="field-group">
            <label className="label">Land</label>
            <select className="select" value={profileForm.country} onChange={(e) => setProfileForm({ ...profileForm, country: e.target.value })}>
              <option value="AT">Österreich</option>
              <option value="DE">Deutschland</option>
              <option value="CH">Schweiz</option>
            </select>
          </div>
        </div>
        <div className="field-row">
          <div className="field-group">
            <label className="label">UID-Nummer</label>
            <input className="input" value={profileForm.currentUid} onChange={(e) => setProfileForm({ ...profileForm, currentUid: e.target.value })} placeholder="ATU12345678" />
          </div>
          <div className="field-group">
            <label className="label">Rechtsform</label>
            <select className="select" value={profileForm.legalForm} onChange={(e) => setProfileForm({ ...profileForm, legalForm: e.target.value })}>
              <option value="einzelunternehmen">Einzelunternehmen</option>
              <option value="gbr">GbR</option>
              <option value="gmbh">GmbH</option>
              <option value="ug">UG</option>
              <option value="ag">AG</option>
              <option value="freelancer">Freelancer</option>
              <option value="verein">Verein</option>
            </select>
          </div>
        </div>
        <div className="field-row">
          <div className="field-group">
            <label className="label">Email</label>
            <input className="input" value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} placeholder="info@firma.at" />
          </div>
          <div className="field-group">
            <label className="label">Telefon</label>
            <input className="input" value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} placeholder="+43 676 1234567" />
          </div>
        </div>

        <h4 style={{ marginTop: "1rem", marginBottom: "0.75rem" }}>Bankverbindung</h4>
        <div className="field-group">
          <label className="label">Kontoinhaber</label>
          <input className="input" value={profileForm.bankOwner} onChange={(e) => setProfileForm({ ...profileForm, bankOwner: e.target.value })} placeholder="Max Mustermann" />
        </div>
        <div className="field-row">
          <div className="field-group">
            <label className="label">IBAN</label>
            <input className="input" value={profileForm.iban} onChange={(e) => setProfileForm({ ...profileForm, iban: e.target.value })} placeholder="AT12 3456 7890 1234 5678" />
          </div>
          <div className="field-group">
            <label className="label">BIC</label>
            <input className="input" value={profileForm.bic} onChange={(e) => setProfileForm({ ...profileForm, bic: e.target.value })} placeholder="ABCDATWW" />
          </div>
        </div>

        <button className="btn btn-primary btn-sm" onClick={handleSaveProfile} disabled={savingProfile} style={{ marginTop: "0.5rem" }}>
          {savingProfile ? "Speichere..." : profileSaved ? "· Gespeichert" : "Profil speichern"}
        </button>
      </div>

      {/* Steuerstatus */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h4 style={{ marginBottom: "0.75rem" }}>Steuerstatus</h4>
        {profile ? (
          <>
            <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "1rem" }}>
              <span className="badge badge-accent" style={{ fontSize: "0.75rem" }}>
                {profile.currentTaxStatus} ({profile.currentTaxRate}%)
              </span>
              <button className="btn btn-sm" onClick={() => setShowTaxChange(!showTaxChange)}>
                {showTaxChange ? "Abbrechen" : "Status wechseln"}
              </button>
            </div>

            {showTaxChange && (
              <div style={{ padding: "1rem", background: "var(--surface-2)", border: "1px solid var(--border)", marginBottom: "1rem" }}>
                <div className="field-group">
                  <label className="label">Neuer Steuerstatus</label>
                  <select className="select" value={newTaxStatus} onChange={(e) => {
                    setNewTaxStatus(e.target.value);
                    setNewTaxRate(taxRateForMode[e.target.value] ?? 0);
                  }}>
                    {TAX_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div className="field-row">
                  <div className="field-group">
                    <label className="label">Gültig ab</label>
                    <input className="input" type="date" value={newTaxDate} onChange={(e) => setNewTaxDate(e.target.value)} />
                  </div>
                  <div className="field-group">
                    <label className="label">Steuersatz (%)</label>
                    <input className="input" type="number" value={newTaxRate} onChange={(e) => setNewTaxRate(Number(e.target.value))} />
                  </div>
                </div>
                <div className="field-group">
                  <label className="label">Grund (optional)</label>
                  <input className="input" value={newTaxReason} onChange={(e) => setNewTaxReason(e.target.value)} placeholder="Überschreitung Kleinunternehmergrenze" />
                </div>
                <div style={{ padding: "0.75rem", background: "var(--surface)", border: "1px solid var(--warn)", fontSize: "0.75rem", color: "var(--fg-3)", marginBottom: "0.75rem" }}>
                  Rechnungen vor dem Wechseldatum behalten den alten Status. Rechnungen danach verwenden den neuen.
                </div>
                <button className="btn btn-primary btn-sm" onClick={handleTaxChange} disabled={savingTax}>
                  {savingTax ? "Speichere..." : "Steuerstatus wechseln"}
                </button>
              </div>
            )}
          </>
        ) : (
          <p style={{ color: "var(--fg-3)", fontSize: "0.8125rem" }}>Erstelle zuerst dein Unternehmensprofil.</p>
        )}
      </div>

      {/* Data Backup */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h4 style={{ marginBottom: "0.75rem" }}>Datensicherung</h4>
        <p style={{ marginBottom: "1rem", fontSize: "0.8125rem" }}>
          Deine Daten sind sicher. Tägliche automatische Backups um 05:00 MEZ. 90 Tage Aufbewahrung.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <a
            href={`${convexSiteUrl()}/exportAllData?token=${localStorage.getItem("faktox_session")}`}
            className="btn btn-primary btn-sm"
            style={{ textDecoration: "none" }}
          >
            Vollständigen Export herunterladen (JSON)
          </a>
        </div>
        <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: "var(--surface-2)", border: "1px solid var(--border)", fontSize: "0.75rem", color: "var(--fg-3)" }}>
          <strong>3-fach Schutz:</strong>
          <br />
          1. Convex Cloud (primäre Datenbank, täglich gesichert durch Convex)
          <br />
          2. Automatisches JSON-Backup in Convex Storage (täglich 05:00 MEZ, 90 Tage)
          <br />
          3. Manueller Export (diese Schaltfläche) — vollständige JSON-Datei mit allen Daten
        </div>
      </div>

      {/* Subscription */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h4 style={{ marginBottom: "0.75rem" }}>Abonnement</h4>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>Aktueller Plan: {auth.plan}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--fg-3)" }}>
              {auth.plan === "free" && "3 Rechnungen/Monat — upgrade für unlimited"}
              {auth.plan === "starter" && "14,90€/Monat — unlimited Rechnungen + AI Scan"}
              {auth.plan === "pro" && "29,90€/Monat — alle Features"}
            </div>
          </div>
          {auth.plan !== "free" && (
            <button className="btn btn-sm" onClick={handleBillingPortal} disabled={billingLoading}>
              {billingLoading ? "Lade..." : "Abo verwalten (Stripe)"}
            </button>
          )}
        </div>
      </div>

      {/* Account */}
      <div className="card">
        <h4 style={{ marginBottom: "0.75rem" }}>Account</h4>
        <div style={{ fontSize: "0.8125rem", color: "var(--fg-2)" }}>
          <div style={{ marginBottom: "0.25rem" }}>Email: {auth.email}</div>
          <div style={{ marginBottom: "0.25rem" }}>Name: {auth.name}</div>
        </div>
      </div>
    </div>
  );
}
