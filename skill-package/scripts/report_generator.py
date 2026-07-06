#!/usr/bin/env python3
"""
Report Generator — monatliche + jährliche Buchhaltungs-Reports für DACH.

Generiert aus allen Ausgangs- und Eingangsrechnungen:
- EÜR (Einnahmen-Überschuss-Rechnung) nach §4 Abs3 EStG
- USt-Zusammenfassung (zu zahlende USt, Vorabzug, Saldo)
- Forderungs- + Verbindlichkeitsliste
- Steuerberater-fertiger Report als PDF + CSV

Usage:
    python3 report_generator.py monthly --month 2026-07 [--out report.pdf]
    python3 report_generator.py yearly --year 2026 [--out jahresbericht.pdf]
    python3 report_generator.py ustva --month 2026-07              # Nur USt-Voranmeldung
    python3 report_generator.py euer --year 2026                   # Nur EÜR
"""
import json
import sys
import argparse
import csv
import io
from pathlib import Path
from datetime import datetime, date
from collections import defaultdict
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.pdfbase.pdfmetrics import stringWidth

# Databases
OUTGOING_DB = Path("/opt/data/invoice-tool/invoices.json")
INCOMING_DB = Path("/opt/data/invoice-tool/incoming_invoices.json")
PROFILE_DB = Path("/opt/data/invoice-tool/business_profile.json")
NUMBER_DB = Path("/opt/data/invoice-tool/number_sequence.json")


def load_json(path):
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {}


def parse_date(s):
    if not s:
        return None
    for fmt in ["%d.%m.%Y", "%Y-%m-%d", "%d.%m.%y"]:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def month_match(date_str, year_month):
    """Check if a date string is in the given YYYY-MM month."""
    d = parse_date(date_str)
    if not d:
        return False
    return d.year == int(year_month[:4]) and d.month == int(year_month[5:7])


def year_match(date_str, year):
    d = parse_date(date_str)
    if not d:
        return False
    return d.year == int(year)


def money(value):
    return f"€ {value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def get_outgoing_invoices():
    db = load_json(OUTGOING_DB)
    return db.get("invoices", [])


def get_incoming_invoices():
    db = load_json(INCOMING_DB)
    return db.get("invoices", [])


def get_profile():
    return load_json(PROFILE_DB)


def get_invoice_spec(spec_path):
    """Load the enriched JSON spec for an outgoing invoice."""
    p = Path(spec_path)
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    return {}


def collect_data(period_type, period_value):
    """Collect all invoice data for the given period."""
    outgoing = get_outgoing_invoices()
    incoming = get_incoming_invoices()

    if period_type == "monthly":
        match_fn = lambda d: month_match(d, period_value)
    else:
        match_fn = lambda d: year_match(d, period_value)

    # Outgoing: load specs for detailed data
    out_data = []
    for inv in outgoing:
        if not match_fn(inv.get("invoice_date", "")):
            continue
        spec = get_invoice_spec(inv.get("spec_path", ""))
        out_data.append({
            "number": inv["invoice_number"],
            "date": inv.get("invoice_date", ""),
            "recipient": inv.get("recipient_name", ""),
            "status": inv.get("status", ""),
            "paid_date": inv.get("paid_date", ""),
            "net": spec.get("net_total", inv.get("gross_total", 0)),
            "vat": spec.get("vat_amount", 0),
            "gross": spec.get("gross_total", inv.get("gross_total", 0)),
            "tax_mode": spec.get("tax_mode", ""),
            "type": "outgoing",
        })

    # Incoming
    in_data = []
    for inv in incoming:
        if not match_fn(inv.get("invoice_date", "")):
            continue
        in_data.append({
            "number": inv["number"],
            "date": inv.get("invoice_date", ""),
            "issuer": inv.get("issuer_name", ""),
            "status": inv.get("status", ""),
            "paid_date": inv.get("paid_date", ""),
            "net": inv.get("net_amount", 0),
            "vat": inv.get("vat_amount", 0),
            "gross": inv.get("gross_amount", 0),
            "tax_rate": inv.get("tax_rate", 0),
            "category": inv.get("category", ""),
            "type": "incoming",
        })

    return out_data, in_data


def calculate_euer(out_data, in_data):
    """Calculate EÜR (Einnahmen-Überschuss-Rechnung) nach §4 Abs3 EStG."""
    # Einnahmen (Ausgangsrechnungen)
    revenue_net = sum(o["net"] for o in out_data)
    revenue_vat = sum(o["vat"] for o in out_data)
    revenue_gross = sum(o["gross"] for o in out_data)

    # Ausgaben (Eingangsrechnungen) — nach Kategorie gruppiert
    expenses_by_category = defaultdict(lambda: {"net": 0, "vat": 0, "gross": 0})
    for inv in in_data:
        cat = inv.get("category") or "Sonstiges"
        expenses_by_category[cat]["net"] += inv["net"]
        expenses_by_category[cat]["vat"] += inv["vat"]
        expenses_by_category[cat]["gross"] += inv["gross"]

    expenses_net = sum(e["net"] for e in expenses_by_category.values())
    expenses_vat = sum(e["vat"] for e in expenses_by_category.values())
    expenses_gross = sum(e["gross"] for e in expenses_by_category.values())

    # USt-Saldo: eingenommene USt - abgezogene USt
    ust_received = revenue_vat  # USt die wir ausgewiesen haben
    ust_paid = expenses_vat     # USt die wir bezahlt haben (Vorsteuer)
    ust_saldo = ust_received - ust_paid

    # Gewinn
    profit_net = revenue_net - expenses_net

    return {
        "revenue": {
            "net": revenue_net,
            "vat": revenue_vat,
            "gross": revenue_gross,
        },
        "expenses": {
            "by_category": dict(expenses_by_category),
            "net": expenses_net,
            "vat": expenses_vat,
            "gross": expenses_gross,
        },
        "ust": {
            "received": ust_received,
            "paid": ust_paid,
            "saldo": ust_saldo,
        },
        "profit_net": profit_net,
    }


def get_open_receivables(out_data):
    """Offene Forderungen (nicht bezahlte Ausgangsrechnungen)."""
    return [o for o in out_data if o["status"] != "paid"]


def get_open_payables(in_data):
    """Offene Verbindlichkeiten (nicht bezahlte Eingangsrechnungen)."""
    return [i for i in in_data if i["status"] != "paid"]


# ─── PDF Rendering ────────────────────────────────────────────────────────────

def draw_text(c, text, x, y, font="Helvetica", size=9.5, color=colors.black):
    c.setFillColor(color)
    c.setFont(font, size)
    c.drawString(x, y, text)


def draw_text_right(c, text, x, y, font="Helvetica", size=9.5, color=colors.black):
    c.setFillColor(color)
    c.setFont(font, size)
    c.drawRightString(x, y, text)


def draw_section_title(c, title, x, y, size=13):
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", size)
    c.drawString(x, y, title)
    c.setStrokeColor(colors.HexColor("#333333"))
    c.setLineWidth(0.5)
    c.line(x, y - 6, A4[0] - 55, y - 6)


def draw_table_row(c, y, cols, x_start, col_widths, font="Helvetica", size=9, bold=False, bg=None):
    f = "Helvetica-Bold" if bold else font
    c.setFont(f, size)
    if bg:
        c.setFillColor(bg)
        c.rect(x_start, y - 3, sum(col_widths), 16, fill=1, stroke=0)
        c.setFillColor(colors.black if bg == colors.HexColor("#f0f0f0") else colors.white)
    x = x_start
    for i, (text, w) in enumerate(zip(cols, col_widths)):
        if i == len(cols) - 1 or i == len(cols) - 2:
            c.drawRightString(x + w - 4, y + 4, str(text))
        else:
            c.drawString(x + 4, y + 4, str(text))
        x += w


def render_pdf_report(report_data, output_path, period_label, report_type):
    W, H = A4
    left = 55
    right_x = W - 55
    usable_w = W - 2 * left

    profile = get_profile()
    base = profile.get("base", {})

    c = canvas.Canvas(str(output_path), pagesize=A4)
    c.setTitle(f"Buchhaltungsreport {period_label}")

    # ── Header ──
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 20)
    title = "BUCHHALTUNGSREPORT" if report_type == "monthly" else "JAHRESBERICHT"
    c.drawString(left, H - 60, title)
    c.setStrokeColor(colors.black)
    c.setLineWidth(1.0)
    c.line(left, H - 68, right_x, H - 68)

    c.setFont("Helvetica", 10)
    c.drawString(left, H - 85, f"Zeitraum: {period_label}")
    c.drawString(left, H - 100, f"Erstellt am: {datetime.now().strftime('%d.%m.%Y')}")
    if base.get("name"):
        c.drawString(left, H - 115, f"Unternehmen: {base['name']}")
    if base.get("country"):
        c.drawString(left, H - 130, f"Land: {base['country']}")

    y = H - 160

    # ── EÜR ──
    draw_section_title(c, "EINNAHMEN-ÜBERSCHUSS-RECHNUNG (§4 Abs3 EStG)", left, y)
    y -= 25

    euer = report_data["euer"]

    # Einnahmen
    c.setFont("Helvetica-Bold", 10)
    c.drawString(left, y, "Einnahmen (Ausgangsrechnungen)")
    y -= 18

    col_widths = [60, 180, 80, 80, 80]
    headers = ["Datum", "Empfänger", "Netto", "USt", "Brutto"]
    draw_table_row(c, y, headers, left, col_widths, bold=True, bg=colors.HexColor("#333333"))
    y -= 20

    c.setFont("Helvetica", 9)
    for inv in report_data["outgoing"]:
        if y < 100:
            c.showPage()
            y = H - 60
        draw_table_row(c, y, [
            inv["date"],
            inv["recipient"][:25],
            money(inv["net"]),
            money(inv["vat"]),
            money(inv["gross"]),
        ], left, col_widths)
        y -= 16

    y -= 5
    c.setFont("Helvetica-Bold", 9)
    c.line(left, y, left + sum(col_widths), y)
    y -= 16
    draw_table_row(c, y, ["Summe Einnahmen", "", money(euer["revenue"]["net"]), money(euer["revenue"]["vat"]), money(euer["revenue"]["gross"])], left, col_widths, bold=True)
    y -= 25

    # Ausgaben
    if y < 150:
        c.showPage()
        y = H - 60

    c.setFont("Helvetica-Bold", 10)
    c.drawString(left, y, "Ausgaben (Eingangsrechnungen)")
    y -= 18

    headers = ["Datum", "Lieferant", "Netto", "USt", "Brutto"]
    draw_table_row(c, y, headers, left, col_widths, bold=True, bg=colors.HexColor("#333333"))
    y -= 20

    c.setFont("Helvetica", 9)
    for inv in report_data["incoming"]:
        if y < 100:
            c.showPage()
            y = H - 60
        draw_table_row(c, y, [
            inv["date"],
            inv.get("issuer", "")[:25],
            money(inv["net"]),
            money(inv["vat"]),
            money(inv["gross"]),
        ], left, col_widths)
        y -= 16

    y -= 5
    c.setFont("Helvetica-Bold", 9)
    c.line(left, y, left + sum(col_widths), y)
    y -= 16
    draw_table_row(c, y, ["Summe Ausgaben", "", money(euer["expenses"]["net"]), money(euer["expenses"]["vat"]), money(euer["expenses"]["gross"])], left, col_widths, bold=True)
    y -= 25

    # Ausgaben nach Kategorie
    if y < 150:
        c.showPage()
        y = H - 60

    c.setFont("Helvetica-Bold", 10)
    c.drawString(left, y, "Ausgaben nach Kategorie")
    y -= 18

    cat_widths = [250, 80, 80, 80]
    draw_table_row(c, y, ["Kategorie", "Netto", "USt", "Brutto"], left, cat_widths, bold=True, bg=colors.HexColor("#333333"))
    y -= 20
    c.setFont("Helvetica", 9)
    for cat, amounts in sorted(euer["expenses"]["by_category"].items()):
        if y < 100:
            c.showPage()
            y = H - 60
        draw_table_row(c, y, [cat, money(amounts["net"]), money(amounts["vat"]), money(amounts["gross"])], left, cat_widths)
        y -= 16

    y -= 25

    # ── USt-Zusammenfassung ──
    if y < 150:
        c.showPage()
        y = H - 60

    draw_section_title(c, "UMSATZSTEUER-ZUSAMMENFASSUNG", left, y)
    y -= 25

    c.setFont("Helvetica", 10)
    ust = euer["ust"]
    rows = [
        ("Ausgewiesene USt (Einnahmen)", ust["received"]),
        ("Abziehbare Vorsteuer (Ausgaben)", -ust["paid"]),
        ("USt-Saldo (zu zahlen / erstattet)", ust["saldo"]),
    ]
    for label, value in rows:
        c.setFont("Helvetica-Bold" if "Saldo" in label else "Helvetica", 10)
        c.drawString(left, y, label)
        color = colors.red if value < 0 else colors.black
        draw_text_right(c, money(abs(value)), right_x, y, "Helvetica-Bold" if "Saldo" in label else "Helvetica", 10, color)
        y -= 18
        if "Saldo" in label:
            c.setStrokeColor(colors.black)
            c.setLineWidth(0.5)
            c.line(left, y + 8, right_x, y + 8)

    y -= 15

    # ── Ergebnis ──
    if y < 120:
        c.showPage()
        y = H - 60

    draw_section_title(c, "ERGEBNIS", left, y)
    y -= 25

    c.setFont("Helvetica-Bold", 14)
    c.setFillColor(colors.black)
    c.drawString(left, y, "Gewinn (Netto):")
    profit_color = colors.HexColor("#006600") if euer["profit_net"] >= 0 else colors.red
    draw_text_right(c, money(euer["profit_net"]), right_x, y, "Helvetica-Bold", 14, profit_color)
    y -= 25

    c.setFont("Helvetica", 9)
    c.drawString(left, y, "Gewinn = Einnahmen netto - Ausgaben netto")
    y -= 20

    # ── Offene Posten ──
    if y < 150:
        c.showPage()
        y = H - 60

    draw_section_title(c, "OFFENE POSTEN", left, y)
    y -= 25

    # Offene Forderungen
    open_rec = report_data["open_receivables"]
    c.setFont("Helvetica-Bold", 10)
    c.drawString(left, y, f"Offene Forderungen ({len(open_rec)})")
    y -= 16
    c.setFont("Helvetica", 9)
    for inv in open_rec:
        if y < 100:
            c.showPage()
            y = H - 60
        c.drawString(left, y, f"  {inv['number']} — {inv['recipient'][:20]} — {money(inv['gross'])}")
        y -= 14
    if open_rec:
        c.setFont("Helvetica-Bold", 9)
        total_open = sum(o["gross"] for o in open_rec)
        c.drawString(left, y, f"  Summe offene Forderungen: {money(total_open)}")
        y -= 18
    else:
        c.drawString(left, y, "  Keine offenen Forderungen.")
        y -= 14

    y -= 10

    # Offene Verbindlichkeiten
    if y < 120:
        c.showPage()
        y = H - 60

    open_pay = report_data["open_payables"]
    c.setFont("Helvetica-Bold", 10)
    c.drawString(left, y, f"Offene Verbindlichkeiten ({len(open_pay)})")
    y -= 16
    c.setFont("Helvetica", 9)
    for inv in open_pay:
        if y < 100:
            c.showPage()
            y = H - 60
        c.drawString(left, y, f"  {inv['number']} — {inv.get('issuer', '')[:20]} — {money(inv['gross'])}")
        y -= 14
    if open_pay:
        c.setFont("Helvetica-Bold", 9)
        total_open = sum(o["gross"] for o in open_pay)
        c.drawString(left, y, f"  Summe offene Verbindlichkeiten: {money(total_open)}")
        y -= 18
    else:
        c.drawString(left, y, "  Keine offenen Verbindlichkeiten.")
        y -= 14

    # ── Footer ──
    y -= 30
    c.setFont("Helvetica-Oblique", 8)
    c.drawString(left, y, "Dieser Report wurde automatisch generiert und ersetzt keine Steuerberatung.")
    c.drawString(left, y - 12, f"Erstellt am {datetime.now().strftime('%d.%m.%Y um %H:%M')} — maightyOS Invoice Agent")

    c.showPage()
    c.save()


def render_csv_report(report_data, output_path, period_label):
    """Export report as CSV (DATEV-compatible)."""
    with open(output_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f, delimiter=";")
        writer.writerow([f"BUCHHALTUNGSREPORT {period_label}"])
        writer.writerow([f"Erstellt am: {datetime.now().strftime('%d.%m.%Y')}"])
        writer.writerow([])

        # Einnahmen
        writer.writerow(["EINNAHMEN (Ausgangsrechnungen)"])
        writer.writerow(["Datum", "Rechnungsnr", "Empfänger", "Netto", "USt", "Brutto", "Status"])
        for inv in report_data["outgoing"]:
            writer.writerow([inv["date"], inv["number"], inv["recipient"],
                             f"{inv['net']:.2f}".replace(".", ","),
                             f"{inv['vat']:.2f}".replace(".", ","),
                             f"{inv['gross']:.2f}".replace(".", ","),
                             inv["status"]])
        e = report_data["euer"]
        writer.writerow(["", "", "Summe", f"{e['revenue']['net']:.2f}".replace(".", ","),
                         f"{e['revenue']['vat']:.2f}".replace(".", ","),
                         f"{e['revenue']['gross']:.2f}".replace(".", ",")])
        writer.writerow([])

        # Ausgaben
        writer.writerow(["AUSGABEN (Eingangsrechnungen)"])
        writer.writerow(["Datum", "Rechnungsnr", "Lieferant", "Kategorie", "Netto", "USt", "Brutto", "Status"])
        for inv in report_data["incoming"]:
            writer.writerow([inv["date"], inv["number"], inv.get("issuer", ""), inv.get("category", ""),
                             f"{inv['net']:.2f}".replace(".", ","),
                             f"{inv['vat']:.2f}".replace(".", ","),
                             f"{inv['gross']:.2f}".replace(".", ","),
                             inv["status"]])
        writer.writerow(["", "", "", "Summe", f"{e['expenses']['net']:.2f}".replace(".", ","),
                         f"{e['expenses']['vat']:.2f}".replace(".", ","),
                         f"{e['expenses']['gross']:.2f}".replace(".", ",")])
        writer.writerow([])

        # USt
        writer.writerow(["UMSATZSTEUER-ZUSAMMENFASSUNG"])
        writer.writerow(["Ausgewiesene USt", f"{e['ust']['received']:.2f}".replace(".", ",")])
        writer.writerow(["Abziehbare Vorsteuer", f"{e['ust']['paid']:.2f}".replace(".", ",")])
        writer.writerow(["USt-Saldo", f"{e['ust']['saldo']:.2f}".replace(".", ",")])
        writer.writerow([])

        # Ergebnis
        writer.writerow(["ERGEBNIS"])
        writer.writerow(["Gewinn (Netto)", f"{e['profit_net']:.2f}".replace(".", ",")])
        writer.writerow([])

        # Offene Posten
        writer.writerow(["OFFENE FORDERUNGEN"])
        for inv in report_data["open_receivables"]:
            writer.writerow([inv["number"], inv["recipient"], f"{inv['gross']:.2f}".replace(".", ",")])
        writer.writerow([])
        writer.writerow(["OFFENE VERBINDLICHKEITEN"])
        for inv in report_data["open_payables"]:
            writer.writerow([inv["number"], inv.get("issuer", ""), f"{inv['gross']:.2f}".replace(".", ",")])


def cmd_monthly(args):
    out_data, in_data = collect_data("monthly", args.month)
    euer = calculate_euer(out_data, in_data)
    report = {
        "outgoing": out_data,
        "incoming": in_data,
        "euer": euer,
        "open_receivables": get_open_receivables(out_data),
        "open_payables": get_open_payables(in_data),
    }

    period_label = f"{args.month} ({datetime.strptime(args.month + '-01', '%Y-%m-%d').strftime('%B %Y')})"

    # Determine output paths
    base_name = args.out or f"Report_{args.month}"
    if not base_name.endswith(".pdf"):
        base_name += ".pdf"
    pdf_path = Path(base_name)
    csv_path = pdf_path.with_suffix(".csv")

    render_pdf_report(report, pdf_path, period_label, "monthly")
    render_csv_report(report, csv_path, period_label)

    # Summary
    print(f"✅ PDF: {pdf_path}")
    print(f"✅ CSV: {csv_path}")
    print(f"\n📋 Zusammenfassung {period_label}:")
    print(f"   Einnahmen:  {money(euer['revenue']['gross'])} (net {money(euer['revenue']['net'])})")
    print(f"   Ausgaben:   {money(euer['expenses']['gross'])} (net {money(euer['expenses']['net'])})")
    print(f"   USt-Saldo:  {money(euer['ust']['saldo'])} ({'zu zahlen' if euer['ust']['saldo'] > 0 else 'Erstattung' if euer['ust']['saldo'] < 0 else 'ausgeglichen'})")
    print(f"   Gewinn:     {money(euer['profit_net'])}")
    print(f"   Offene Ford: {len(report['open_receivables'])} ({money(sum(o['gross'] for o in report['open_receivables']))})")
    print(f"   Offene Verb: {len(report['open_payables'])} ({money(sum(o['gross'] for o in report['open_payables']))})")


def cmd_yearly(args):
    out_data, in_data = collect_data("yearly", args.year)
    euer = calculate_euer(out_data, in_data)
    report = {
        "outgoing": out_data,
        "incoming": in_data,
        "euer": euer,
        "open_receivables": get_open_receivables(out_data),
        "open_payables": get_open_payables(in_data),
    }

    period_label = f"Jahr {args.year}"

    base_name = args.out or f"Jahresbericht_{args.year}"
    if not base_name.endswith(".pdf"):
        base_name += ".pdf"
    pdf_path = Path(base_name)
    csv_path = pdf_path.with_suffix(".csv")

    render_pdf_report(report, pdf_path, period_label, "yearly")
    render_csv_report(report, csv_path, period_label)

    print(f"✅ PDF: {pdf_path}")
    print(f"✅ CSV: {csv_path}")
    print(f"\n📋 Jahresbericht {args.year}:")
    print(f"   Einnahmen:  {money(euer['revenue']['gross'])}")
    print(f"   Ausgaben:   {money(euer['expenses']['gross'])}")
    print(f"   USt-Saldo:  {money(euer['ust']['saldo'])}")
    print(f"   Gewinn:     {money(euer['profit_net'])}")
    print(f"   Ausgang:    {len(out_data)} Rechnungen")
    print(f"   Eingang:    {len(in_data)} Rechnungen")


def cmd_ustva(args):
    """Nur USt-Voranmeldung-Daten."""
    out_data, in_data = collect_data("monthly", args.month)
    euer = calculate_euer(out_data, in_data)
    ust = euer["ust"]

    print(f"════════════════════════════════════════════")
    print(f"  USt-VORANMELDUNG {args.month}")
    print(f"════════════════════════════════════════════")
    print(f"  Ausgewiesene USt:     {money(ust['received'])}")
    print(f"  Abziehbare Vorsteuer: {money(ust['paid'])}")
    print(f"  ─────────────────────────────────────────")
    if ust["saldo"] > 0:
        print(f"  Zu zahlende USt:      {money(ust['saldo'])}")
    elif ust["saldo"] < 0:
        print(f"  Zu erstattende USt:   {money(abs(ust['saldo']))}")
    else:
        print(f"  Saldo:                {money(0)} (ausgeglichen)")
    print(f"════════════════════════════════════════════")
    print(f"\n  Ausgangsrechnungen mit USt-Ausweis: {len([o for o in out_data if o['vat'] > 0])}")
    print(f"  Eingangsrechnungen mit Vorsteuer:   {len([i for i in in_data if i['vat'] > 0])}")


def cmd_euer(args):
    """Nur EÜR."""
    out_data, in_data = collect_data("yearly", args.year)
    euer = calculate_euer(out_data, in_data)

    print(f"════════════════════════════════════════════")
    print(f"  EÜR (§4 Abs3 EStG) — {args.year}")
    print(f"════════════════════════════════════════════")
    print(f"  Einnahmen netto:    {money(euer['revenue']['net'])}")
    print(f"  Ausgaben netto:     {money(euer['expenses']['net'])}")
    print(f"  ─────────────────────────────────────────")
    print(f"  Gewinn:             {money(euer['profit_net'])}")
    print(f"════════════════════════════════════════════")
    print(f"\n  Ausgaben nach Kategorie:")
    for cat, amounts in sorted(euer["expenses"]["by_category"].items()):
        print(f"    {cat:20s} netto {money(amounts['net']):>12s}")


def main():
    parser = argparse.ArgumentParser(description="Buchhaltungs-Report Generator für DACH")
    sub = parser.add_subparsers(dest="command")

    p_monthly = sub.add_parser("monthly", help="Monatlicher Report")
    p_monthly.add_argument("--month", required=True, help="YYYY-MM (z.B. 2026-07)")
    p_monthly.add_argument("--out", help="Output PDF path")
    p_monthly.set_defaults(func=cmd_monthly)

    p_yearly = sub.add_parser("yearly", help="Jahresbericht")
    p_yearly.add_argument("--year", required=True, help="YYYY (z.B. 2026)")
    p_yearly.add_argument("--out", help="Output PDF path")
    p_yearly.set_defaults(func=cmd_yearly)

    p_ustva = sub.add_parser("ustva", help="Nur USt-Voranmeldung")
    p_ustva.add_argument("--month", required=True, help="YYYY-MM")
    p_ustva.set_defaults(func=cmd_ustva)

    p_euer = sub.add_parser("euer", help="Nur EÜR")
    p_euer.add_argument("--year", required=True, help="YYYY")
    p_euer.set_defaults(func=cmd_euer)

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(1)
    args.func(args)


if __name__ == "__main__":
    main()
