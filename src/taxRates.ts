// ═══════════════════════════════════════════════════════════
// DACH USt-Sätze — Österreich + Deutschland
// Rechtlich korrekte Umsatzsteuersätze für alle Positionen
// ═══════════════════════════════════════════════════════════

export interface TaxRateOption {
  value: string; // "20" | "13" | "10" | "19" | "7" | "0"
  label: string; // "20% (AT)"
  rate: number; // 20
  country: string; // "AT" | "DE" | "ALL"
  desc: string; // Kurzbeschreibung
}

// Alle verfügbaren USt-Sätze für das Dropdown pro Position
export const TAX_RATE_OPTIONS: TaxRateOption[] = [
  // Österreich
  { value: "20", label: "20% — AT Standard", rate: 20, country: "AT", desc: "Normalsatz (Standard)" },
  { value: "13", label: "13% — AT ermäßigt", rate: 13, country: "AT", desc: "Lebende Tiere, Pflanzen, Holz, Kultureinrichtungen, Beherbergung" },
  { value: "10", label: "10% — AT stark ermäßigt", rate: 10, country: "AT", desc: "Lebensmittel, Bücher, Zeitungen, Personenbeförderung, Pharmazeutika" },
  { value: "4.9", label: "4,9% — AT Grundnahrungsmittel", rate: 4.9, country: "AT", desc: "Ausgewählte Grundnahrungsmittel (Butter, Brot, Obst) — seit Juli 2026" },
  // Deutschland
  { value: "19", label: "19% — DE Standard", rate: 19, country: "DE", desc: "Normalsatz (Standard)" },
  { value: "7", label: "7% — DE ermäßigt", rate: 7, country: "DE", desc: "Lebensmittel, Bücher, Zeitungen, Personenbeförderung, Gastronomie (ohne Getränke)" },
  // 0%
  { value: "0", label: "0% — Steuerfrei", rate: 0, country: "ALL", desc: "Kleinunternehmer, Reverse Charge, befreit" },
];

// Für SelectPicker
export const TAX_RATE_SELECT_OPTIONS = TAX_RATE_OPTIONS.map((t) => ({
  value: t.value,
  label: t.label,
}));

// Map: value → rate
export const TAX_RATE_MAP: Record<string, number> = TAX_RATE_OPTIONS.reduce((acc, t) => {
  acc[t.value] = t.rate;
  return acc;
}, {} as Record<string, number>);

// Steuer-Breakdown: gruppiert nach Steuersatz
export interface TaxBreakdownEntry {
  taxRate: number; // 20, 13, 10, 19, 7, 0
  netAmount: number;
  vatAmount: number;
  grossAmount: number;
}

// Berechnet den Steuer-Breakdown aus Items mit einzelnen Steuersätzen
export function computeTaxBreakdown(
  items: { total: number; taxRate: number }[]
): TaxBreakdownEntry[] {
  const groups: Record<number, { netAmount: number; vatAmount: number; grossAmount: number }> = {};

  for (const item of items) {
    const rate = item.taxRate || 0;
    if (!groups[rate]) groups[rate] = { netAmount: 0, vatAmount: 0, grossAmount: 0 };
    groups[rate].netAmount += item.total;
    const vat = rate > 0 ? (item.total * rate) / 100 : 0;
    groups[rate].vatAmount += vat;
    groups[rate].grossAmount += item.total + vat;
  }

  return Object.entries(groups)
    .map(([rate, v]) => ({
      taxRate: Number(rate),
      netAmount: v.netAmount,
      vatAmount: v.vatAmount,
      grossAmount: v.grossAmount,
    }))
    .sort((a, b) => b.taxRate - a.taxRate);
}

// Summiert alle Items zu Gesamt-Netto/USt/Brutto
export function computeTotals(
  items: { total: number; taxRate: number }[]
): { netAmount: number; vatAmount: number; grossAmount: number } {
  let netAmount = 0;
  let vatAmount = 0;
  for (const item of items) {
    netAmount += item.total;
    const rate = item.taxRate || 0;
    if (rate > 0) vatAmount += (item.total * rate) / 100;
  }
  return { netAmount, vatAmount, grossAmount: netAmount + vatAmount };
}

// Steuertext für Steuersatz (für PDF und UI)
export function taxRateLabel(rate: number): string {
  const opt = TAX_RATE_OPTIONS.find((t) => t.rate === rate);
  return opt ? opt.label : `${rate}%`;
}
