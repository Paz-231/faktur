import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import {
  createRecurrenceSchedule,
  previewOccurrences,
  type RecurrenceEndMode,
  type RecurrenceFrequency,
} from "../shared/recurrence";
import { money } from "./lib";

interface RecurringOrderModalProps {
  userId: string;
  sessionToken: string;
  plan: string;
  onClose: () => void;
  onCreated?: () => void;
  onUpgrade: () => void;
}

interface RecurringItem {
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  taxRate: number;
}

const UNITS = ["Stunden", "Stück", "Monate", "Pauschal", "Tag", "Quadratmeter"];

function localIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}.${month}.${year}`;
}

export function RecurringOrderModal({
  userId,
  sessionToken,
  plan,
  onClose,
  onCreated,
  onUpgrade,
}: RecurringOrderModalProps) {
  const customers = useQuery(api.customers.list, { userId: userId as any, sessionToken }) ?? [];
  const profile = useQuery(api.profile.get, { userId: userId as any, sessionToken });
  const access = useQuery(api.recurringOrderAccess.getAccess, { sessionToken });
  const createTemplate = useMutation(api.recurringOrders.createTemplate);

  const [title, setTitle] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientStreet, setRecipientStreet] = useState("");
  const [recipientCity, setRecipientCity] = useState("");
  const [recipientUid, setRecipientUid] = useState("");
  const [frequency, setFrequency] = useState<RecurrenceFrequency>("monthly");
  const [startDate, setStartDate] = useState(localIsoDate());
  const [endMode, setEndMode] = useState<RecurrenceEndMode>("never");
  const [endDate, setEndDate] = useState("");
  const [maxOccurrences, setMaxOccurrences] = useState(12);
  const [paymentTerms, setPaymentTerms] = useState(
    "Zahlbar ohne Abzug innerhalb von 7 Tagen nach Rechnungserhalt.",
  );
  const [items, setItems] = useState<RecurringItem[]>([
    {
      description: "",
      qty: 1,
      unit: "Stunden",
      unitPrice: 0,
      taxRate: profile?.currentTaxRate ?? 0,
    },
  ]);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Vienna";
  const taxMode = profile?.currentTaxStatus || "kleinunternehmer";
  const profileTaxRate = profile?.currentTaxRate ?? 0;

  const effectiveItems = items.map((item) => ({
    ...item,
    taxRate: profileTaxRate,
  }));

  const netAmount = effectiveItems.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
  const vatAmount = effectiveItems.reduce(
    (sum, item) => sum + (item.qty * item.unitPrice * item.taxRate) / 100,
    0,
  );
  const grossAmount = netAmount + vatAmount;

  const schedulePreview = useMemo(() => {
    try {
      const schedule = createRecurrenceSchedule({
        frequency,
        startDate,
        timezone,
        endMode,
        ...(endMode === "on_date" && endDate ? { endDate } : {}),
        ...(endMode === "after_occurrences" ? { maxOccurrences } : {}),
      });
      return { dates: previewOccurrences(schedule, 3), message: "" };
    } catch (previewError) {
      return {
        dates: [] as string[],
        message: previewError instanceof Error ? previewError.message : "Terminangaben prüfen",
      };
    }
  }, [frequency, startDate, timezone, endMode, endDate, maxOccurrences]);

  const selectCustomer = (id: string) => {
    setCustomerId(id);
    const customer = customers.find((entry: any) => entry._id === id);
    if (!customer) return;
    setRecipientName(customer.name || "");
    setRecipientStreet(customer.street || "");
    setRecipientCity(customer.postalCityCountry || "");
    setRecipientUid(customer.uid || "");
    if (!title) setTitle(`${frequency === "monthly" ? "Monatlicher" : "Jährlicher"} Auftrag — ${customer.name}`);
  };

  const updateItem = (index: number, field: keyof RecurringItem, value: string | number) => {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]: field === "qty" || field === "unitPrice" || field === "taxRate"
                ? Number(value)
                : value,
            }
          : item,
      ),
    );
  };

  const addItem = () => {
    setItems((current) => [
      ...current,
      {
        description: "",
        qty: 1,
        unit: "Stunden",
        unitPrice: 0,
        taxRate: profileTaxRate,
      },
    ]);
  };

  const removeItem = (index: number) => {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleCreate = async () => {
    if (creating) return;
    setError("");
    if (!access?.allowed) {
      setError(access?.reason || "Tarifstatus wird noch geprüft. Bitte versuche es gleich erneut.");
      return;
    }
    if (!profile) {
      setError("Das Unternehmensprofil wird noch geladen. Bitte versuche es gleich erneut.");
      return;
    }
    if (!title.trim()) {
      setError("Bitte gib der Serie einen Titel.");
      return;
    }
    if (!recipientName.trim() || !recipientStreet.trim() || !recipientCity.trim()) {
      setError("Empfängerdaten sind unvollständig.");
      return;
    }
    if (effectiveItems.some((item) => !item.description.trim() || item.qty <= 0 || item.unitPrice <= 0)) {
      setError("Alle Positionen benötigen Beschreibung, Menge und Preis.");
      return;
    }
    if (schedulePreview.message || schedulePreview.dates.length === 0) {
      setError(schedulePreview.message || "Bitte prüfe die Terminangaben.");
      return;
    }

    setCreating(true);
    try {
      await createTemplate({
        sessionToken,
        title: title.trim(),
        customerId: (customerId || undefined) as any,
        recipientName: recipientName.trim(),
        recipientStreet: recipientStreet.trim(),
        recipientCity: recipientCity.trim(),
        recipientUid: recipientUid.trim() || undefined,
        taxMode,
        taxRate: profileTaxRate,
        items: effectiveItems.map((item, index) => ({
          pos: index + 1,
          description: item.description.trim(),
          qty: item.qty,
          unit: item.unit,
          unitPrice: item.unitPrice,
          total: item.qty * item.unitPrice,
          taxRate: item.taxRate,
        })),
        paymentTerms,
        frequency,
        startDate,
        timezone,
        endMode,
        endDate: endMode === "on_date" ? endDate : undefined,
        maxOccurrences: endMode === "after_occurrences" ? maxOccurrences : undefined,
      });
      onCreated?.();
      onClose();
    } catch (createError: any) {
      setError(createError.message || "Wiederkehrender Auftrag konnte nicht angelegt werden.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={(event) => event.stopPropagation()}
        style={{ maxWidth: "min(900px, 100%)", maxHeight: "94vh", display: "flex", flexDirection: "column" }}
      >
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Wiederkehrender Auftrag</h2>
            <p style={{ marginTop: "0.25rem", fontSize: "0.75rem", color: "var(--fg-3)" }}>
              Zu jedem Termin wird ein neuer Auftrag als Entwurf angelegt.
            </p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Schließen">×</button>
        </div>

        <div className="modal-body" style={{ flex: 1, overflowY: "auto" }}>
          {access && !access.allowed && (
            <div style={{ padding: "0.875rem", border: "1px solid var(--accent)", background: "var(--surface-2)", marginBottom: "1rem" }}>
              <strong style={{ display: "block", marginBottom: "0.25rem" }}>Aktiver Starter- oder Pro-Tarif erforderlich</strong>
              <p style={{ fontSize: "0.8125rem", color: "var(--fg-2)", marginBottom: "0.75rem" }}>
                {access.reason || "Wiederkehrende Aufträge sind für diesen Tarif derzeit nicht verfügbar."}
              </p>
              <button className="btn btn-primary btn-sm" onClick={onUpgrade}>Tarif ansehen</button>
            </div>
          )}

          <div className="field-group" style={{ marginBottom: "1rem" }}>
            <label className="label" htmlFor="recurring-title">Titel der Serie</label>
            <input
              id="recurring-title"
              className="input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Monatliche Betreuung — Kunde GmbH"
            />
          </div>

          <div className="create-invoice-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1.35fr", gap: "1rem" }}>
            <div>
              <h4 style={{ margin: "0 0 0.5rem" }}>Empfänger</h4>
              {customers.length > 0 && (
                <div className="field-group" style={{ marginBottom: "0.5rem" }}>
                  <label className="label" htmlFor="recurring-customer">Kunde auswählen</label>
                  <select
                    id="recurring-customer"
                    className="input"
                    value={customerId}
                    onChange={(event) => selectCustomer(event.target.value)}
                  >
                    <option value="">Manuell eingeben</option>
                    {customers.map((customer: any) => (
                      <option key={customer._id} value={customer._id}>{customer.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="field-group" style={{ marginBottom: "0.5rem" }}>
                <label className="label" htmlFor="recurring-name">Name / Firma</label>
                <input id="recurring-name" className="input" value={recipientName} onChange={(event) => setRecipientName(event.target.value)} />
              </div>
              <div className="field-group" style={{ marginBottom: "0.5rem" }}>
                <label className="label" htmlFor="recurring-street">Straße</label>
                <input id="recurring-street" className="input" value={recipientStreet} onChange={(event) => setRecipientStreet(event.target.value)} />
              </div>
              <div className="field-group" style={{ marginBottom: "0.5rem" }}>
                <label className="label" htmlFor="recurring-city">PLZ + Ort + Land</label>
                <input id="recurring-city" className="input" value={recipientCity} onChange={(event) => setRecipientCity(event.target.value)} />
              </div>
              <div className="field-group" style={{ marginBottom: "0.75rem" }}>
                <label className="label" htmlFor="recurring-uid">UID (optional)</label>
                <input id="recurring-uid" className="input" value={recipientUid} onChange={(event) => setRecipientUid(event.target.value)} />
              </div>
              <div style={{ padding: "0.75rem", border: "1px solid var(--border)", background: "var(--surface-2)" }}>
                <div style={{ fontSize: "0.6875rem", color: "var(--fg-3)" }}>Steuerstatus aus Profil</div>
                <div style={{ marginTop: "0.25rem", fontSize: "0.8125rem", fontWeight: 600 }}>
                  {taxMode} · {profileTaxRate}%
                </div>
              </div>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <h4 style={{ margin: 0 }}>Positionen</h4>
                <button className="btn btn-sm" onClick={addItem}>+ Position</button>
              </div>
              {effectiveItems.map((item, index) => (
                <div key={index} style={{ padding: "0.75rem", border: "1px solid var(--border)", marginBottom: "0.625rem", background: "var(--surface-2)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                    <strong style={{ fontSize: "0.75rem" }}>Position {index + 1}</strong>
                    {effectiveItems.length > 1 && (
                      <button className="btn btn-ghost btn-icon" onClick={() => removeItem(index)} aria-label={`Position ${index + 1} entfernen`}>×</button>
                    )}
                  </div>
                  <div className="field-group" style={{ marginBottom: "0.5rem" }}>
                    <label className="label">Beschreibung</label>
                    <input className="input" value={item.description} onChange={(event) => updateItem(index, "description", event.target.value)} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "0.7fr 1fr 1fr", gap: "0.5rem" }}>
                    <div className="field-group">
                      <label className="label">Menge</label>
                      <input className="input" type="number" min="0.01" step="0.01" value={item.qty} onChange={(event) => updateItem(index, "qty", event.target.value)} />
                    </div>
                    <div className="field-group">
                      <label className="label">Einheit</label>
                      <select className="input" value={item.unit} onChange={(event) => updateItem(index, "unit", event.target.value)}>
                        {UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                      </select>
                    </div>
                    <div className="field-group">
                      <label className="label">Preis</label>
                      <input className="input" type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => updateItem(index, "unitPrice", event.target.value)} />
                    </div>
                  </div>
                  <div style={{ marginTop: "0.5rem", textAlign: "right", fontSize: "0.75rem", fontWeight: 600 }}>
                    {money(item.qty * item.unitPrice)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: "1.25rem", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
            <h4 style={{ margin: "0 0 0.75rem" }}>Wiederholung</h4>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div className="field-group">
                <label className="label">Rhythmus</label>
                <div style={{ display: "flex", gap: "0.375rem" }}>
                  {(["monthly", "yearly"] as const).map((value) => (
                    <button
                      key={value}
                      className={`btn btn-sm ${frequency === value ? "btn-primary" : ""}`}
                      onClick={() => setFrequency(value)}
                      type="button"
                    >
                      {value === "monthly" ? "Monatlich" : "Jährlich"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field-group">
                <label className="label" htmlFor="recurring-start">Startdatum</label>
                <input id="recurring-start" className="input" type="date" min={localIsoDate()} value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </div>
              <div className="field-group">
                <label className="label" htmlFor="recurring-end-mode">Ende</label>
                <select id="recurring-end-mode" className="input" value={endMode} onChange={(event) => setEndMode(event.target.value as RecurrenceEndMode)}>
                  <option value="never">Kein Enddatum</option>
                  <option value="on_date">An einem Datum</option>
                  <option value="after_occurrences">Nach einer Anzahl</option>
                </select>
              </div>
              {endMode === "on_date" && (
                <div className="field-group">
                  <label className="label" htmlFor="recurring-end">Enddatum</label>
                  <input id="recurring-end" className="input" type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} />
                </div>
              )}
              {endMode === "after_occurrences" && (
                <div className="field-group">
                  <label className="label" htmlFor="recurring-count">Anzahl der Aufträge</label>
                  <input id="recurring-count" className="input" type="number" min="1" max="240" value={maxOccurrences} onChange={(event) => setMaxOccurrences(Number(event.target.value))} />
                </div>
              )}
            </div>

            <div style={{ marginTop: "0.875rem", padding: "0.75rem", border: "1px solid var(--border)", background: "var(--surface-2)" }}>
              <div style={{ fontSize: "0.6875rem", color: "var(--fg-3)", marginBottom: "0.375rem" }}>Nächste Termine</div>
              {schedulePreview.message ? (
                <div style={{ color: "var(--danger)", fontSize: "0.75rem" }}>{schedulePreview.message}</div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
                  {schedulePreview.dates.map((previewDate) => (
                    <span key={previewDate} className="badge">{formatDate(previewDate)}</span>
                  ))}
                </div>
              )}
              <p style={{ marginTop: "0.5rem", fontSize: "0.6875rem", color: "var(--fg-3)" }}>
                Start am letzten Monatstag bleibt am jeweiligen Monatsende. Der 29. Februar fällt in Nicht-Schaltjahren auf den 28. Februar.
              </p>
            </div>
          </div>

          <div className="field-group" style={{ marginTop: "1rem" }}>
            <label className="label" htmlFor="recurring-terms">Zahlungsbedingungen</label>
            <input id="recurring-terms" className="input" value={paymentTerms} onChange={(event) => setPaymentTerms(event.target.value)} />
          </div>

          <div style={{ marginTop: "1rem", padding: "0.75rem", border: "1px solid var(--border)", background: "var(--surface-2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem" }}><span>Netto</span><span>{money(netAmount)}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginTop: "0.25rem" }}><span>USt</span><span>{money(vatAmount)}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, marginTop: "0.375rem", paddingTop: "0.375rem", borderTop: "1px solid var(--border)" }}><span>Brutto je Auftrag</span><span>{money(grossAmount)}</span></div>
          </div>

          {error && (
            <div role="alert" style={{ marginTop: "0.875rem", padding: "0.75rem", border: "1px solid var(--danger)", color: "var(--danger)", background: "var(--surface-2)" }}>
              {error}
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ flexShrink: 0 }}>
          <button className="btn" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={creating || access === undefined || !access.allowed || !profile}>
            {creating ? "Serie wird angelegt..." : "Wiederkehrenden Auftrag anlegen"}
          </button>
        </div>
      </div>
    </div>
  );
}
