import { useState, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

const VALID_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/tiff"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

interface FileUploadProps {
  userId: string;
  onUploaded?: () => void;
}

export function FileUpload({ userId, onUploaded }: FileUploadProps) {
  const [status, setStatus] = useState<"idle" | "uploading" | "scanning" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateUploadUrl = useMutation(api.fileUpload.generateUploadUrl);
  const createIncoming = useMutation(api.fileUpload.createIncomingFromFile);

  const handleFile = async (file: File) => {
    setError("");

    // Validate
    if (!VALID_TYPES.includes(file.type)) {
      setError(`Format nicht unterstützt: ${file.type}. Erlaubt: PDF, JPG, PNG, WEBP, TIFF`);
      setStatus("error");
      return;
    }

    if (file.size > MAX_SIZE) {
      setError("Datei zu groß. Maximum: 10MB");
      setStatus("error");
      return;
    }

    setStatus("uploading");

    try {
      // Step 1: Get upload URL from Convex
      const uploadUrl = await generateUploadUrl({});

      // Step 2: Upload file directly to Convex Storage
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("Upload fehlgeschlagen");
      }

      const { storageId } = await uploadResponse.json();

      // Step 3: Create incoming invoice record + trigger AI scan
      setStatus("scanning");
      await createIncoming({
        userId: userId as any,
        fileStorageId: storageId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      });

      setStatus("done");
      setTimeout(() => {
        setStatus("idle");
        onUploaded?.();
      }, 2000);

    } catch (err: any) {
      setError(err.message || "Fehler beim Upload");
      setStatus("error");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div>
      <div
        onClick={handleClick}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border)"}`,
          background: dragOver ? "var(--surface-2)" : "var(--surface)",
          padding: "2rem",
          textAlign: "center",
          cursor: status === "idle" || status === "done" ? "pointer" : "wait",
          transition: "border-color 0.15s ease, background 0.15s ease",
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.tiff"
          onChange={handleChange}
          style={{ display: "none" }}
        />

        {status === "idle" && (
          <>
            <div style={{ fontSize: "2rem", marginBottom: "0.5rem", opacity: 0.5 }}>📷</div>
            <p style={{ fontSize: "0.8125rem" }}>Foto oder PDF hierher ziehen oder klicken zum Auswählen</p>
            <small style={{ color: "var(--fg-4)" }}>PDF, JPG, PNG, WEBP · max 10MB</small>
          </>
        )}

        {status === "uploading" && (
          <>
            <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>⬆️</div>
            <p style={{ fontSize: "0.8125rem" }}>Lade hoch...</p>
          </>
        )}

        {status === "scanning" && (
          <>
            <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🔍</div>
            <p style={{ fontSize: "0.8125rem" }}>KI scannt Rechnung...</p>
            <small style={{ color: "var(--fg-4)" }}>Daten werden automatisch extrahiert</small>
          </>
        )}

        {status === "done" && (
          <>
            <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>✅</div>
            <p style={{ fontSize: "0.8125rem", color: "var(--success)" }}>Rechnung hochgeladen und gescannt!</p>
          </>
        )}

        {status === "error" && (
          <>
            <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>❌</div>
            <p style={{ fontSize: "0.8125rem", color: "var(--danger)" }}>{error}</p>
            <small style={{ color: "var(--fg-4)", cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); setStatus("idle"); }}>
              Erneut versuchen
            </small>
          </>
        )}
      </div>
    </div>
  );
}
