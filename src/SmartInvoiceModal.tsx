import { useState, useRef, useEffect } from "react";
import { useMutation } from "convex/react";
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

export function SmartInvoiceModal({ userId, sessionToken, onClose, onCreated, initialCustomer }: SmartInvoiceModalProps) {
  const [mode, setMode] = useState<"choice" | "photo" | "voice" | "manual">("choice");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

  // Photo state
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const generateUploadUrl = useMutation(api.fileUpload.generateUploadUrl);
  const scanOutgoing = useMutation(api.fileUpload.scanOutgoingFile) as any;

  // Voice state
  const [voiceText, setVoiceText] = useState("");
  const [recording, setRecording] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recognitionRef = useRef<any>(null);
  const parseVoice = useMutation(api.fileUpload.parseVoiceToInvoice) as any;

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
        finalText += event.results[i][0].transcript;
      }
      setVoiceText(finalText);
    };

    recognition.onerror = (event: any) => {
      setError(`Spracherkennung: ${event.error}`);
      setRecording(false);
    };

    recognition.onend = () => {
      setRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setRecording(true);
  };

  const stopRecording = () => {
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

  // ── Render ──

  // If scan result is ready, pass to CreateInvoiceModal as pre-filled data
  if (scanResult) {
    return (
      <CreateInvoiceModal
        userId={userId}
        sessionToken={sessionToken}
        onClose={onClose}
        onCreated={onCreated}
        initialCustomer={initialCustomer}
        prefillData={scanResult}
      />
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "min(520px, 100%)" }}>
        <div className="modal-header">
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Neuer Auftrag</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {mode === "choice" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", padding: "0.5rem 0" }}>
              <p style={{ fontSize: "0.8125rem", color: "var(--fg-3)", marginBottom: "0.5rem" }}>
                Wie möchtest du die Rechnung erstellen?
              </p>

              <button
                className="btn"
                onClick={() => setMode("photo")}
                style={{ display: "flex", alignItems: "center", gap: "0.75rem", justifyContent: "flex-start", padding: "1rem", textAlign: "left" }}
              >
                <span style={{ fontSize: "1.25rem", opacity: 0.5 }}>camera</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>Foto / PDF hochladen</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--fg-4)" }}>Stundenzettel oder Notiz abfotografieren — KI extrahiert alle Daten</div>
                </div>
              </button>

              <button
                className="btn"
                onClick={() => setMode("voice")}
                style={{ display: "flex", alignItems: "center", gap: "0.75rem", justifyContent: "flex-start", padding: "1rem", textAlign: "left" }}
              >
                <span style={{ fontSize: "1.25rem", opacity: 0.5 }}>mic</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>Diktieren oder tippen</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--fg-4)" }}>
                    {voiceSupported ? "Spracheingabe oder Text — KI erstellt die Rechnung" : "Text eingeben — KI erstellt die Rechnung"}
                  </div>
                </div>
              </button>

              <button
                className="btn"
                onClick={() => setMode("manual")}
                style={{ display: "flex", alignItems: "center", gap: "0.75rem", justifyContent: "flex-start", padding: "1rem", textAlign: "left" }}
              >
                <span style={{ fontSize: "1.25rem", opacity: 0.5 }}>edit</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>Manuell erfassen</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--fg-4)" }}>Alle Felder selbst ausfüllen</div>
                </div>
              </button>

              {error && (
                <div style={{ marginTop: "0.5rem", padding: "0.75rem", background: "var(--surface-2)", border: "1px solid var(--danger)", color: "var(--danger)", fontSize: "0.8125rem" }}>
                  {error}
                </div>
              )}
            </div>
          )}

          {mode === "photo" && (
            <div>
              <button className="btn btn-ghost btn-sm" onClick={() => setMode("choice")} style={{ marginBottom: "1rem" }}>← Zurück</button>

              {scanning ? (
                <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
                  <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem", color: "var(--accent)" }}>scanning...</div>
                  <p style={{ fontSize: "0.8125rem" }}>KI analysiert das Dokument...</p>
                  <small style={{ color: "var(--fg-4)" }}>Empfänger, Positionen und Beträge werden extrahiert</small>
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
                    padding: "2.5rem 2rem",
                    textAlign: "center",
                    cursor: "pointer",
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.tiff"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                    style={{ display: "none" }}
                  />
                  <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem", opacity: 0.4, fontFamily: "inherit" }}>upload</div>
                  <p style={{ fontSize: "0.8125rem" }}>Foto oder PDF hierher ziehen oder klicken</p>
                  <small style={{ color: "var(--fg-4)" }}>Stundenzettel, Notiz, Hand-Rechnung · max 10MB</small>
                </div>
              )}

              {error && (
                <div style={{ marginTop: "1rem", padding: "0.75rem", background: "var(--surface-2)", border: "1px solid var(--danger)", color: "var(--danger)", fontSize: "0.8125rem" }}>
                  {error}
                </div>
              )}
            </div>
          )}

          {mode === "voice" && (
            <div>
              <button className="btn btn-ghost btn-sm" onClick={() => setMode("choice")} style={{ marginBottom: "1rem" }}>← Zurück</button>

              {scanning ? (
                <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
                  <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem", color: "var(--accent)" }}>parsing...</div>
                  <p style={{ fontSize: "0.8125rem" }}>KI analysiert den Text...</p>
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: "1rem" }}>
                    {voiceSupported && (
                      <button
                        className={`btn ${recording ? "btn-primary" : "btn"}`}
                        onClick={recording ? stopRecording : startRecording}
                        style={{ marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}
                      >
                        <span>{recording ? "● Aufnahme — Klick zum Stoppen" : "Diktieren starten"}</span>
                      </button>
                    )}
                    <textarea
                      className="input"
                      value={voiceText}
                      onChange={(e) => setVoiceText(e.target.value)}
                      placeholder="z.B. Rechnung an Müller GmbH in Wien, 10 Stunden Beratung à 85 Euro, Zahlbar innerhalb 14 Tagen..."
                      rows={5}
                      style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                    />
                  </div>

                  <button
                    className="btn btn-primary"
                    onClick={handleVoiceParse}
                    disabled={!voiceText.trim()}
                    style={{ width: "100%", justifyContent: "center" }}
                  >
                    KI analysieren
                  </button>

                  <p style={{ fontSize: "0.6875rem", color: "var(--fg-4)", marginTop: "0.75rem", textAlign: "center" }}>
                    {voiceSupported
                      ? "Diktiere oder tippe — die KI erkennt Empfänger, Positionen, Beträge und Steuerstatus."
                      : "Spracherkennung nicht verfügbar in diesem Browser. Tippe den Text ein."}
                  </p>
                </>
              )}

              {error && (
                <div style={{ marginTop: "1rem", padding: "0.75rem", background: "var(--surface-2)", border: "1px solid var(--danger)", color: "var(--danger)", fontSize: "0.8125rem" }}>
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {mode === "manual" && null}
      </div>
    </div>
  );

  // Manual mode → render CreateInvoiceModal directly
  if (mode === "manual") {
    return (
      <CreateInvoiceModal
        userId={userId}
        sessionToken={sessionToken}
        onClose={onClose}
        onCreated={onCreated}
        initialCustomer={initialCustomer}
      />
    );
  }

  return null;
}
