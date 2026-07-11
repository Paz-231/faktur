import { useState, useRef, useEffect } from "react";
import { useMutation, useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import { CreateInvoiceModal, type InitialCustomer } from "./CreateInvoiceModal";

type ScanResult = {
  recipient_name: string;
  recipient_street: string;
  recipient_city: string;
  recipient_uid: string;
  items: { description: string; qty: number; unit_price: number; unit: string }[];
  net_amount: number;
  vat_rate: number;
  tax_mode: string;
  payment_terms: string;
  date: string;
  delivery_date: string;
  invoice_type: string;
};

const VALID_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/tiff"];
const MAX_SIZE = 10 * 1024 * 1024;

interface SmartInvoiceModalProps {
  userId: string;
  sessionToken: string;
  onClose: () => void;
  onCreated?: () => void;
  initialCustomer?: InitialCustomer;
}

// Minimal stroke icons (24px, currentColor)
function ModeIcon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    camera: (
      <>
        <path d="M3 7h3l2-3h8l2 3h3v12H3V7Z" />
        <circle cx="12" cy="13" r="4" />
      </>
    ),
    mic: (
      <>
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0" />
        <path d="M12 18v4" />
      </>
    ),
    edit: (
      <>
        <path d="M14 4l6 6L8 22H2v-6L14 4Z" />
        <path d="M11 7l6 6" />
      </>
    ),
    upload: (
      <>
        <path d="M12 3v14" />
        <path d="M6 9l6-6 6 6" />
        <path d="M4 21h16" />
      </>
    ),
    back: <path d="M19 12H5M11 18l-6-6 6-6" />,
    check: <path d="M20 6L9 17l-5-5" />,
  };
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export function SmartInvoiceModal({ userId, sessionToken, onClose, onCreated, initialCustomer }: SmartInvoiceModalProps) {
  const [mode, setMode] = useState<"choice" | "photo" | "voice" | "manual">("choice");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

  // Photo state
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const generateUploadUrl = useMutation(api.fileUpload.generateUploadUrl);
  const scanOutgoing = useAction(api.fileUpload.scanOutgoingFile);

  // Voice state
  const [voiceText, setVoiceText] = useState("");
  const [recording, setRecording] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recognitionRef = useRef<any>(null);
  const shouldRecordRef = useRef(false); // true while user wants to record — survives re-renders
  const parseVoice = useAction(api.fileUpload.parseVoiceToInvoice);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setVoiceSupported(!!SR);
  }, []);

  // ── Photo scan ──
  const handleFile = async (file: File) => {
    setError("");
    if (!VALID_TYPES.includes(file.type)) {
      setError("Format nicht unterstützt. Erlaubt: PDF, JPG, PNG, WEBP, TIFF");
      return;
    }
    if (file.size > MAX_SIZE) {
      setError("Datei zu groß. Maximum: 10MB");
      return;
    }
    setScanning(true);
    try {
      const uploadUrl = await generateUploadUrl({ sessionToken });
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadResponse.ok) throw new Error("Upload fehlgeschlagen");
      const { storageId } = await uploadResponse.json();
      const result = await scanOutgoing({ sessionToken, fileStorageId: storageId });
      setScanResult(result);
    } catch (err: any) {
      setError(err.message || "Fehler beim Scan");
    } finally {
      setScanning(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  // ── Voice recording ──
  const startRecording = () => {
    setError("");
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setError("Spracherkennung wird von diesem Browser nicht unterstützt. Tippe den Text ein.");
      return;
    }
    const recognition = new SR();
    recognition.lang = "de-AT";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event: any) => {
      let finalText = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalText += event.results[i][0].transcript;
        } else {
          finalText += event.results[i][0].transcript;
        }
      }
      setVoiceText(finalText);
    };
    recognition.onerror = (event: any) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Mikrofon-Zugriff verweigert. Prüfe die Browser-Berechtigung (URL-Leiste → Sicherheit → Mikrofon erlauben) oder tippe den Text direkt ein.");
        shouldRecordRef.current = false;
      } else if (event.error === "no-speech") {
        // no-speech is normal during pauses — don't show error, just let auto-restart handle it
      } else if (event.error === "network") {
        setError("Netzwerkfehler bei der Spracherkennung. Tippe den Text ein.");
        shouldRecordRef.current = false;
      } else if (event.error === "aborted") {
        // User clicked stop — normal, don't show error
      } else {
        setError(`Spracherkennung: ${event.error}`);
      }
      if (event.error !== "no-speech" && event.error !== "aborted") {
        setRecording(false);
      }
    };
    recognition.onend = () => {
      // Chrome stops recognition after a few seconds of silence or periodically.
      // Auto-restart if the user still wants to record (shouldRecordRef survives re-renders).
      if (shouldRecordRef.current) {
        try {
          recognition.start();
        } catch {
          // "recognition has already started" — ignore, it will restart on next onend
        }
      } else {
        setRecording(false);
      }
    };
    recognitionRef.current = recognition;
    shouldRecordRef.current = true;
    recognition.start();
    setRecording(true);
  };

  const stopRecording = () => {
    shouldRecordRef.current = false;
    recognitionRef.current?.stop();
    setRecording(false);
  };

  const handleVoiceParse = async () => {
    if (!voiceText.trim()) {
      setError("Bitte tippe oder diktiere zuerst einen Text");
      return;
    }
    setScanning(true);
    setError("");
    try {
      const result = await parseVoice({ sessionToken, text: voiceText });
      setScanResult(result);
    } catch (err: any) {
      setError(err.message || "Fehler bei der Textanalyse");
    } finally {
      setScanning(false);
    }
  };

  const goBack = () => { setMode("choice"); setError(""); };

  // ── Render ──

  if (mode === "manual") {
    return <CreateInvoiceModal userId={userId} sessionToken={sessionToken} onClose={onClose} onCreated={onCreated} initialCustomer={initialCustomer} />;
  }

  if (scanResult) {
    return <CreateInvoiceModal userId={userId} sessionToken={sessionToken} onClose={onClose} onCreated={onCreated} initialCustomer={initialCustomer} prefillData={scanResult} />;
  }

  const modeOptions = [
    { id: "photo" as const, icon: "camera", title: "Foto / PDF hochladen", desc: "Stundenzettel oder Notiz abfotografieren — KI extrahiert alle Daten" },
    { id: "voice" as const, icon: "mic", title: voiceSupported ? "Diktieren oder tippen" : "Text eingeben", desc: voiceSupported ? "Spracheingabe oder Text — KI erstellt die Rechnung" : "Text beschreiben — KI erstellt die Rechnung" },
    { id: "manual" as const, icon: "edit", title: "Manuell erfassen", desc: "Alle Felder selbst ausfüllen" },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "min(520px, 100%)" }}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            {mode !== "choice" && (
              <button className="btn btn-ghost btn-icon" onClick={goBack} style={{ padding: "0.25rem" }}>
                <ModeIcon name="back" />
              </button>
            )}
            <h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>
              {mode === "choice" ? "Neuer Auftrag" : mode === "photo" ? "Foto / PDF" : mode === "voice" ? "Diktieren / Tippen" : ""}
            </h2>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* ── Choice Screen ── */}
          {mode === "choice" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem", padding: "0.25rem 0" }}>
              <p style={{ fontSize: "0.8125rem", color: "var(--fg-3)", marginBottom: "0.25rem" }}>
                Wie möchtest du den Auftrag erstellen?
              </p>
              {modeOptions.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setMode(opt.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.875rem",
                    padding: "1rem 1.125rem",
                    textAlign: "left",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    color: "var(--fg)",
                    borderRadius: "0.5rem",
                    cursor: "pointer",
                    transition: "border-color 0.15s ease, background 0.15s ease",
                    minHeight: "72px",
                    fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--surface-2)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--surface)"; }}
                >
                  <span style={{ color: "var(--accent)", flexShrink: 0, display: "flex" }}>
                    <ModeIcon name={opt.icon} />
                  </span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--fg)" }}>{opt.title}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--fg-3)", marginTop: "0.125rem" }}>{opt.desc}</div>
                  </div>
                </button>
              ))}
              {error && (
                <div style={{ marginTop: "0.25rem", padding: "0.75rem", background: "var(--surface-2)", border: "1px solid var(--danger)", color: "var(--danger)", fontSize: "0.8125rem", borderRadius: "0.375rem" }}>
                  {error}
                </div>
              )}
            </div>
          )}

          {/* ── Photo Screen ── */}
          {mode === "photo" && (
            <>
              {scanning ? (
                <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
                  <div style={{ marginBottom: "1rem", color: "var(--accent)" }}>
                    <ModeIcon name="camera" />
                  </div>
                  <p style={{ fontSize: "0.875rem", fontWeight: 500 }}>KI analysiert das Dokument...</p>
                  <small style={{ color: "var(--fg-4)", marginTop: "0.375rem", display: "block" }}>Empfänger, Positionen und Beträge werden extrahiert</small>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  style={{
                    border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border)"}`,
                    background: dragOver ? "var(--surface-2)" : "var(--surface)",
                    padding: "2.5rem 1.5rem",
                    textAlign: "center",
                    cursor: "pointer",
                    borderRadius: "0.5rem",
                    transition: "border-color 0.15s ease, background 0.15s ease",
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.tiff"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                    style={{ display: "none" }}
                  />
                  <div style={{ color: "var(--fg-4)", marginBottom: "0.75rem", display: "flex", justifyContent: "center" }}>
                    <ModeIcon name="upload" />
                  </div>
                  <p style={{ fontSize: "0.8125rem", fontWeight: 500 }}>Foto oder PDF hierher ziehen oder klicken</p>
                  <small style={{ color: "var(--fg-4)", marginTop: "0.375rem", display: "block" }}>Stundenzettel, Notiz, Hand-Rechnung · max 10MB</small>
                </div>
              )}
              {error && (
                <div style={{ marginTop: "1rem", padding: "0.75rem", background: "var(--surface-2)", border: "1px solid var(--danger)", color: "var(--danger)", fontSize: "0.8125rem", borderRadius: "0.375rem" }}>
                  {error}
                </div>
              )}
            </>
          )}

          {/* ── Voice Screen ── */}
          {mode === "voice" && (
            <>
              {scanning ? (
                <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
                  <div style={{ marginBottom: "1rem", color: "var(--accent)" }}>
                    <ModeIcon name="mic" />
                  </div>
                  <p style={{ fontSize: "0.875rem", fontWeight: 500 }}>KI analysiert den Text...</p>
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: "1rem" }}>
                    {voiceSupported && (
                      <button
                        onClick={recording ? stopRecording : startRecording}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          padding: "0.75rem 1.125rem",
                          background: recording ? "var(--danger)" : "var(--surface)",
                          border: `1px solid ${recording ? "var(--danger)" : "var(--border)"}`,
                          color: recording ? "white" : "var(--fg)",
                          borderRadius: "0.5rem",
                          cursor: "pointer",
                          fontFamily: "inherit",
                          fontSize: "0.8125rem",
                          fontWeight: 500,
                          marginBottom: "0.75rem",
                          width: "100%",
                          justifyContent: "center",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <span style={{ display: "flex" }}><ModeIcon name="mic" /></span>
                        {recording ? "Aufnahme läuft — Klick zum Stoppen" : "Diktieren starten"}
                      </button>
                    )}
                    {!voiceSupported && (
                      <p style={{ fontSize: "0.75rem", color: "var(--fg-3)", marginBottom: "0.75rem", textAlign: "center" }}>
                        Spracherkennung nicht verfügbar in diesem Browser. Tippe den Text ein.
                      </p>
                    )}
                    <textarea
                      className="input"
                      value={voiceText}
                      onChange={(e) => setVoiceText(e.target.value)}
                      placeholder={"z.B. Rechnung an Müller GmbH in Wien, 10 Stunden Beratung à 85 Euro, Zahlbar innerhalb 14 Tagen..."}
                      rows={5}
                      style={{ width: "100%", resize: "vertical", fontFamily: "inherit", borderRadius: "0.5rem", minHeight: "120px" }}
                      autoFocus={!voiceSupported}
                    />
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={handleVoiceParse}
                    disabled={!voiceText.trim()}
                    style={{ width: "100%", justifyContent: "center", minHeight: "44px" }}
                  >
                    KI analysieren
                  </button>
                  <p style={{ fontSize: "0.6875rem", color: "var(--fg-4)", marginTop: "0.75rem", textAlign: "center" }}>
                    {voiceSupported
                      ? "Diktiere oder tippe — die KI erkennt Empfänger, Positionen, Beträge und Steuerstatus."
                      : "Beschreibe die Rechnung in Textform — die KI erkennt Empfänger, Positionen, Beträge und Steuerstatus."}
                  </p>
                </>
              )}
              {error && (
                <div style={{ marginTop: "1rem", padding: "0.75rem", background: "var(--surface-2)", border: "1px solid var(--danger)", color: "var(--danger)", fontSize: "0.8125rem", borderRadius: "0.375rem" }}>
                  {error}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
