import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";

// ═══════════════════════════════════════════════════════════
// PDF-Builder — DACH-konforme Dokumente (Rechnung/Honorarnote,
// Angebot, Auftragsbestätigung) als pure Funktion.
// Läuft in der Convex-Default-Runtime (pdf-lib ist pure JS).
// ═══════════════════════════════════════════════════════════

export type DocKind = "rechnung" | "angebot" | "auftrag";

export interface PdfIssuer {
  name: string;
  street: string;
  postalCityCountry: string;
  email?: string;
  phone?: string;
  uid?: string;
  bankOwner?: string;
  iban?: string;
  bic?: string;
}

export interface PdfItem {
  pos: number;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  total: number;
}

export interface PdfDocument {
  title: string; // "RECHNUNG" | "HONORARNOTE" | "ANGEBOT" | "AUFTRAGSBESTÄTIGUNG"
  number: string;
  date: string;
  deliveryDate?: string;
  periodStart?: string;
  periodEnd?: string;
  validUntil?: string; // Angebote
  recipientName: string;
  recipientStreet: string;
  recipientCity: string;
  recipientUid?: string;
  taxRate: number;
  taxNote?: string;
  netAmount: number;
  vatAmount: number;
  grossAmount: number;
  items: PdfItem[];
  paymentTerms?: string;
  footer?: string;
}

const A4: [number, number] = [595.28, 841.89];
const LEFT = 55;
const RIGHT = 55;

function money(v: number): string {
  const s = (v || 0).toFixed(2);
  const [int, dec] = s.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `€ ${grouped},${dec}`;
}

// WinAnsi (Standard-Fonts) kann nicht alle Unicode-Zeichen —
// unbekannte Zeichen ersetzen statt beim Encoden zu crashen.
const WINANSI_EXTRA = new Set("\u20AC\u201E\u201C\u201D\u2018\u2019\u201A\u2013\u2014\u2026\u0160\u0161\u017D\u017E\u0152\u0153\u0178\u2020\u2021\u2030\u2039\u203A\u02DC\u02C6\u2022\u2122");
function sanitize(text: string): string {
  let out = "";
  for (const ch of String(text || "")) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0x0a || code === 0x0d || code === 0x09) {
      out += " ";
    } else if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WINANSI_EXTRA.has(ch)) {
      out += ch;
    } else {
      out += "?";
    }
  }
  return out;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = sanitize(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export async function buildDocumentPdf(doc: PdfDocument, issuer: PdfIssuer): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0, 0, 0);
  const gray = rgb(0.45, 0.45, 0.45);

  let page = pdf.addPage(A4);
  const [W, H] = A4;
  const rightX = W - RIGHT;
  const usable = W - LEFT - RIGHT;
  let y = H - 70;

  const text = (p: PDFPage, t: string, x: number, yy: number, f: PDFFont, size: number, color = black) =>
    p.drawText(sanitize(t), { x, y: yy, size, font: f, color });
  const textRight = (p: PDFPage, t: string, x: number, yy: number, f: PDFFont, size: number, color = black) => {
    const s = sanitize(t);
    p.drawText(s, { x: x - f.widthOfTextAtSize(s, size), y: yy, size, font: f, color });
  };

  const newPage = () => {
    page = pdf.addPage(A4);
    y = H - 70;
  };
  const ensureSpace = (needed: number) => {
    if (y - needed < 60) newPage();
  };

  // ── Kopf ──
  text(page, doc.title, LEFT, y, bold, 22);
  y -= 8;
  page.drawLine({ start: { x: LEFT, y }, end: { x: rightX, y }, thickness: 0.8, color: black });
  y -= 40;

  // ── Aussteller (links) + Meta (rechts) ──
  const metaTop = y;
  text(page, "Aussteller", LEFT, y, bold, 11);
  y -= 17;
  const issuerLines = [
    issuer.name,
    issuer.street,
    issuer.postalCityCountry,
    issuer.phone ? `Tel. ${issuer.phone}` : "",
    issuer.email ? `Email: ${issuer.email}` : "",
    issuer.uid ? `UID: ${issuer.uid}` : "",
  ].filter(Boolean);
  for (const line of issuerLines) {
    text(page, line, LEFT, y, font, 9.2);
    y -= 14;
  }

  // Meta rechts
  let my = metaTop;
  const metaRow = (label: string, value: string) => {
    textRight(page, label, rightX - 110, my, bold, 9.2);
    textRight(page, value, rightX, my, font, 9.2);
    my -= 15;
  };
  metaRow("Nummer:", doc.number);
  metaRow("Datum:", doc.date);
  if (doc.deliveryDate) metaRow("Leistungsdatum:", doc.deliveryDate);
  if (doc.periodStart) metaRow("Zeitraum:", `${doc.periodStart}${doc.periodEnd ? ` - ${doc.periodEnd}` : ""}`);
  if (doc.validUntil) metaRow("Gültig bis:", doc.validUntil);

  y = Math.min(y, my) - 22;

  // ── Empfänger ──
  text(page, "Empfänger", LEFT, y, bold, 11);
  y -= 17;
  const recipLines = [
    doc.recipientName,
    doc.recipientStreet,
    doc.recipientCity,
    doc.recipientUid ? `UID: ${doc.recipientUid}` : "",
  ].filter(Boolean);
  for (const line of recipLines) {
    text(page, line, LEFT, y, font, 9.2);
    y -= 14;
  }
  y -= 20;

  // ── Positionstabelle ──
  const cols = [
    { label: "Pos.", w: 34, align: "center" as const },
    { label: "Bezeichnung", w: usable - 34 - 50 - 72 - 84 - 84, align: "left" as const },
    { label: "Menge", w: 50, align: "right" as const },
    { label: "Einheit", w: 72, align: "left" as const },
    { label: "Preis/Einh.", w: 84, align: "right" as const },
    { label: "Gesamt", w: 84, align: "right" as const },
  ];
  const headerH = 20;

  const drawTableHeader = () => {
    page.drawRectangle({ x: LEFT, y: y - headerH + 6, width: usable, height: headerH, color: rgb(0.2, 0.2, 0.2) });
    let cx = LEFT;
    for (const col of cols) {
      const ty = y - headerH + 12;
      if (col.align === "right") {
        textRight(page, col.label, cx + col.w - 6, ty, bold, 8, rgb(1, 1, 1));
      } else if (col.align === "center") {
        const wdt = bold.widthOfTextAtSize(col.label, 8);
        text(page, col.label, cx + (col.w - wdt) / 2, ty, bold, 8, rgb(1, 1, 1));
      } else {
        text(page, col.label, cx + 6, ty, bold, 8, rgb(1, 1, 1));
      }
      cx += col.w;
    }
    y -= headerH + 8;
  };

  drawTableHeader();

  for (const item of doc.items) {
    const descLines = wrapText(item.description, font, 8.9, cols[1].w - 12);
    const rowH = Math.max(18, descLines.length * 12 + 8);
    if (y - rowH < 80) {
      newPage();
      drawTableHeader();
    }
    let cx = LEFT;
    const baseline = y - 6;
    // Pos
    {
      const s = String(item.pos);
      const wdt = font.widthOfTextAtSize(s, 8.9);
      text(page, s, cx + (cols[0].w - wdt) / 2, baseline, font, 8.9);
      cx += cols[0].w;
    }
    // Beschreibung (mehrzeilig)
    descLines.forEach((line, i) => text(page, line, cx + 6, baseline - i * 12, font, 8.9));
    cx += cols[1].w;
    // Menge
    textRight(page, String(item.qty), cx + cols[2].w - 6, baseline, font, 8.9);
    cx += cols[2].w;
    // Einheit
    text(page, item.unit || "", cx + 6, baseline, font, 8.9);
    cx += cols[3].w;
    // Preis
    textRight(page, money(item.unitPrice), cx + cols[4].w - 6, baseline, font, 8.9);
    cx += cols[4].w;
    // Gesamt
    textRight(page, money(item.total), cx + cols[5].w - 6, baseline, font, 8.9);

    y -= rowH;
    page.drawLine({ start: { x: LEFT, y: y + 2 }, end: { x: rightX, y: y + 2 }, thickness: 0.3, color: rgb(0.8, 0.8, 0.8) });
  }
  y -= 18;

  // ── Summen ──
  ensureSpace(80);
  const sumRow = (label: string, value: string, isBold = false) => {
    textRight(page, label, rightX - 130, y, isBold ? bold : font, isBold ? 10.5 : 9.2);
    textRight(page, value, rightX, y, isBold ? bold : font, isBold ? 10.5 : 9.2);
    y -= 17;
  };
  sumRow("Gesamt netto", money(doc.netAmount));
  if (doc.taxRate > 0 && doc.vatAmount > 0) {
    sumRow(`Umsatzsteuer (${doc.taxRate.toFixed(0)}%)`, money(doc.vatAmount));
  }
  page.drawLine({ start: { x: rightX - 200, y: y + 10 }, end: { x: rightX, y: y + 10 }, thickness: 0.5, color: black });
  y -= 4;
  sumRow("Gesamtbetrag", money(doc.grossAmount), true);
  y -= 10;

  // ── Steuerhinweis ──
  if (doc.taxNote) {
    ensureSpace(30);
    for (const line of wrapText(doc.taxNote, font, 8.9, usable)) {
      text(page, line, LEFT, y, font, 8.9, gray);
      y -= 12;
    }
    y -= 10;
  }

  // ── Zahlungsbedingungen ──
  if (doc.paymentTerms) {
    ensureSpace(50);
    text(page, "Zahlungsbedingungen", LEFT, y, bold, 11);
    y -= 16;
    for (const line of wrapText(doc.paymentTerms, font, 9.2, usable)) {
      text(page, line, LEFT, y, font, 9.2);
      y -= 13;
    }
    y -= 14;
  }

  // ── Bankverbindung ──
  if (issuer.iban) {
    ensureSpace(70);
    text(page, "Bankverbindung", LEFT, y, bold, 11);
    y -= 16;
    const bankRows: [string, string][] = [];
    if (issuer.bankOwner) bankRows.push(["Inhaber:", issuer.bankOwner]);
    bankRows.push(["IBAN:", issuer.iban]);
    if (issuer.bic) bankRows.push(["BIC:", issuer.bic]);
    for (const [label, value] of bankRows) {
      text(page, label, LEFT, y, bold, 9.2);
      text(page, value, LEFT + 70, y, font, 9.2);
      y -= 14;
    }
    y -= 14;
  }

  // ── Fußnote ──
  const footer = doc.footer || "Dieses Dokument wurde elektronisch erstellt und ist ohne Unterschrift gültig.";
  ensureSpace(30);
  for (const line of wrapText(footer, font, 8.5, usable)) {
    text(page, line, LEFT, y, font, 8.5, gray);
    y -= 11;
  }

  return await pdf.save();
}
