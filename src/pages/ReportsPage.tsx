import { useState } from "react";
import { useQuery, useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";
import { SelectPicker } from "../SelectPicker";
import { MONTH_NAMES, money } from "../lib";

// ═══════════════════════════════════════════════════════════
// Reports Page — echte Zahlen + CSV-Exporte
// ═══════════════════════════════════════════════════════════
export function ReportsPage({ userId: _userId, sessionToken }: { userId: any; sessionToken: string }) {
  const convex = useConvex();

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());

  // Serverseitige Aggregation über ALLE Belege — die list-Queries
  // liefern nur 100 Einträge, was Steuerzahlen verfälschen würde.
  const summary = useQuery(api.reports.summary, { sessionToken, month, year });

  const report = {
    monthRevenue: summary?.month.revenueNet ?? 0,
    monthExpenses: summary?.month.expensesNet ?? 0,
    monthVatReceived: summary?.month.vatReceived ?? 0,
    monthVatPaid: summary?.month.vatPaid ?? 0,
    monthInvCount: summary?.month.invoiceCount ?? 0,
    monthIncCount: summary?.month.incomingCount ?? 0,
    yearRevenue: summary?.year.revenueNet ?? 0,
    yearExpenses: summary?.year.expensesNet ?? 0,
    yearVatReceived: summary?.year.vatReceived ?? 0,
    yearVatPaid: summary?.year.vatPaid ?? 0,
  };

  const downloadCsv = (fileName: string, rows: (string | number)[][]) => {
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
    // BOM für Excel-Umlaute
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportMonthReport = () => {
    downloadCsv(`faktox-report-${year}-${String(month + 1).padStart(2, "0")}.csv`, [
      ["Faktox Monats-Report", `${MONTH_NAMES[month]} ${year}`],
      [],
      ["Position", "Betrag (EUR)"],
      ["Einnahmen (Netto)", report.monthRevenue.toFixed(2)],
      ["Ausgaben (Netto)", report.monthExpenses.toFixed(2)],
      ["Gewinn (EÜR)", (report.monthRevenue - report.monthExpenses).toFixed(2)],
      ["USt vereinnahmt", report.monthVatReceived.toFixed(2)],
      ["Vorsteuer bezahlt", report.monthVatPaid.toFixed(2)],
      ["USt-Zahllast", (report.monthVatReceived - report.monthVatPaid).toFixed(2)],
    ]);
  };

  const exportYearReport = () => {
    downloadCsv(`faktox-jahresbericht-${year}.csv`, [
      ["Faktox Jahresbericht (EÜR §4 Abs3 EStG)", String(year)],
      [],
      ["Position", "Betrag (EUR)"],
      ["Betriebseinnahmen (Netto)", report.yearRevenue.toFixed(2)],
      ["Betriebsausgaben (Netto)", report.yearExpenses.toFixed(2)],
      ["Gewinn/Verlust", (report.yearRevenue - report.yearExpenses).toFixed(2)],
      ["USt vereinnahmt", report.yearVatReceived.toFixed(2)],
      ["Vorsteuer bezahlt", report.yearVatPaid.toFixed(2)],
      ["USt-Zahllast", (report.yearVatReceived - report.yearVatPaid).toFixed(2)],
    ]);
  };

  const exportDatev = async () => {
    // Alle Belege des Jahres serverseitig holen (nicht nur die letzten 100)
    const data = await convex.query(api.reports.exportRows, { sessionToken, year });
    const rows: (string | number)[][] = [
      ["Belegdatum", "Belegnummer", "Buchungstext", "Netto", "USt-Satz", "USt", "Brutto", "Typ", "Status"],
    ];
    for (const r of data.invoices) {
      rows.push([r.date, r.number, `${r.type} ${r.recipientName}`, r.netAmount.toFixed(2), `${r.taxRate}%`, r.vatAmount.toFixed(2), r.grossAmount.toFixed(2), "Ausgang", r.status]);
    }
    for (const i of data.incoming) {
      rows.push([i.date, i.number, `Eingang ${i.issuerName}`, i.netAmount.toFixed(2), `${i.taxRate}%`, i.vatAmount.toFixed(2), i.grossAmount.toFixed(2), "Eingang", i.status]);
    }
    downloadCsv(`faktox-datev-export-${year}.csv`, rows);
  };

  const zahllast = report.monthVatReceived - report.monthVatPaid;

  return (
    <div className="slide-up">
      <div className="page-header">
        <h1 className="page-title">Berichte</h1>
        <div className="page-actions" style={{ position: "relative" }}>
          <SelectPicker
            value={String(month)}
            onChange={(v) => setMonth(Number(v))}
            options={MONTH_NAMES.map((m, i) => ({ value: String(i), label: m }))}
            style={{ marginBottom: 0, width: "auto" }}
          />
          <SelectPicker
            value={String(year)}
            onChange={(v) => setYear(Number(v))}
            options={[year - 2, year - 1, year, year + 1].filter((v, i, a) => a.indexOf(v) === i).map((y) => ({ value: String(y), label: String(y) }))}
            style={{ marginBottom: 0, width: "auto" }}
          />
        </div>
      </div>

      {/* Monats-Kennzahlen */}
      <h4 style={{ marginBottom: "0.75rem" }}>{MONTH_NAMES[month]} {year}</h4>
      <div className="stat-row">
        <div className="stat">
          <div className="stat-label">Einnahmen (Netto)</div>
          <div className="stat-value accent">{money(report.monthRevenue)}</div>
          <div className="stat-sub">{report.monthInvCount} Ausgangsrechnungen</div>
        </div>
        <div className="stat">
          <div className="stat-label">Ausgaben (Netto)</div>
          <div className="stat-value">{money(report.monthExpenses)}</div>
          <div className="stat-sub">{report.monthIncCount} Eingangsrechnungen</div>
        </div>
        <div className="stat">
          <div className="stat-label">Gewinn (EÜR)</div>
          <div className="stat-value" style={{ color: report.monthRevenue - report.monthExpenses >= 0 ? "var(--success)" : "var(--danger)" }}>
            {money(report.monthRevenue - report.monthExpenses)}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">USt-Zahllast</div>
          <div className="stat-value" style={{ color: zahllast > 0 ? "var(--warn)" : "var(--success)" }}>{money(zahllast)}</div>
          <div className="stat-sub">{zahllast > 0 ? "zu zahlen" : zahllast < 0 ? "Erstattung" : "ausgeglichen"}</div>
        </div>
      </div>

      <div className="card-grid">
        <div className="card">
          <h4>Monatlicher Report</h4>
          <p style={{ marginTop: "0.5rem" }}>EÜR-Summen und USt für {MONTH_NAMES[month]} {year} als CSV.</p>
          <button className="btn btn-sm" style={{ marginTop: "1rem" }} onClick={exportMonthReport}>CSV herunterladen</button>
        </div>
        <div className="card">
          <h4>Jahresbericht</h4>
          <p style={{ marginTop: "0.5rem" }}>
            Vollständige EÜR {year}: Einnahmen {money(report.yearRevenue)}, Ausgaben {money(report.yearExpenses)}.
          </p>
          <button className="btn btn-sm" style={{ marginTop: "1rem" }} onClick={exportYearReport}>CSV herunterladen</button>
        </div>
        <div className="card">
          <h4>DATEV-Export</h4>
          <p style={{ marginTop: "0.5rem" }}>Alle Belege {year} als CSV für deinen Steuerberater.</p>
          <button className="btn btn-sm" style={{ marginTop: "1rem" }} onClick={exportDatev}>Exportieren</button>
        </div>
        <div className="card">
          <h4>USt-Voranmeldung</h4>
          <p style={{ marginTop: "0.5rem" }}>
            {MONTH_NAMES[month]}: USt {money(report.monthVatReceived)} − Vorsteuer {money(report.monthVatPaid)} = <strong>{money(zahllast)}</strong>
          </p>
          <p style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--fg-3)" }}>
            Werte für FinanzOnline (AT) / ELSTER (DE).
          </p>
        </div>
      </div>
    </div>
  );
}
