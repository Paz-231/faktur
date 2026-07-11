import { useState, useRef, useEffect } from "react";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectPickerProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  label?: string;
  placeholder?: string;
  style?: React.CSSProperties;
}

/**
 * SelectPicker — Custom dropdown im Faktox-Design.
 * Ersetzt native <select> überall im Projekt.
 *
 * Design-Merkmale (gleich wie CustomerPicker/DatePicker):
 * - position: absolute popup, z-index 300
 * - var(--surface) background, var(--border) border
 * - 44px min-height touch target
 * - Chevron-SVG statt Browser-Pfeil
 * - Außerhalb-Klick schließt das Popup
 * - 0.5rem border-radius auf Items
 */
export function SelectPicker({ value, onChange, options, label, placeholder, style }: SelectPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div className="field-group" ref={ref} style={{ position: "relative", ...(style || {}) }}>
      {label && <label className="label">{label}</label>}
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.625rem 0.75rem",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: "0.8125rem",
          minHeight: "44px",
          color: selected ? "var(--fg)" : "var(--fg-4)",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected ? selected.label : (placeholder || "— wählen —")}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          style={{ color: "var(--fg-3)", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }}
        >
          <path d="M3 4.5 6 8l3-3.5" />
        </svg>
      </div>

      {open && (
        <div className="select-picker-popup">
          {options.length === 0 ? (
            <div className="select-picker-empty">Keine Optionen</div>
          ) : (
            options.map((o) => (
              <button
                key={o.value}
                className={`select-picker-item ${o.value === value ? "selected" : ""}`}
                onClick={() => { onChange(o.value); setOpen(false); }}
                type="button"
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
