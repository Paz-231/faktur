#!/usr/bin/env python3
"""
Buchhaltungs-Export — exportiert alle registrierten Rechnungen als CSV.

Kompatibel mit:
- DATEV (CSV-Format)
- Lexware
- Kassenbuch
- Excel/Google Sheets (universelles CSV)

Usage:
    python3 export_csv.py [--out export.csv] [--from 2026-01-01] [--to 2026-12-31]
"""
import json
import csv
import sys
import argparse
from pathlib import Path
from datetime import datetime

DB_PATH = Path("/opt/data/invoice-tool/invoices.json")


def main():
    parser = argparse.ArgumentParser(description="Export invoices as CSV for accounting")
    parser.add_argument("--out", help="Output CSV path", default="rechnungen_export.csv")
    parser.add_argument("--from", dest="date_from", help="Filter from date (YYYY-MM-DD)")
    parser.add_argument("--to", dest="date_to", help="Filter to date (YYYY-MM-DD)")
    args = parser.parse_args()

    if not DB_PATH.exists():
        print("❌ No invoices registered. Run 'mahnwesen.py register' first.", file=sys.stderr)
        sys.exit(1)

    db = json.loads(DB_PATH.read_text(encoding="utf-8"))
    invoices = db.get("invoices", [])

    # Date filter
    if args.date_from:
        invoices = [i for i in invoices if i.get("invoice_date", "") >= args.date_from]
    if args.date_to:
        invoices = [i for i in invoices if i.get("invoice_date", "") <= args.date_to]

    if not invoices:
        print("No invoices found for the given filter.")
        return

    # CSV columns — DATEV-compatible + universal
    columns = [
        "Rechnungsnummer",
        "Rechnungsdatum",
        "Leistungsdatum",
        "Empfänger",
        "Empfänger UID",
        "Empfänger Adresse",
        "Netto",
        "USt-Betrag",
        "Brutto",
        "Steuersatz",
        "Steuermodus",
        "Status",
        "Zahlungsdatum",
        "Erinnerung",
        "1. Mahnung",
        "2. Mahnung",
        "Positionen",
        "Beschreibung",
    ]

    output = Path(args.out)
    with open(output, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=columns, delimiter=";")
        writer.writeheader()

        for inv in invoices:
            spec_path = Path(inv.get("spec_path", ""))
            spec = {}
            if spec_path.exists():
                spec = json.loads(spec_path.read_text(encoding="utf-8"))

            items = spec.get("items", [])
            item_descriptions = " | ".join(
                f"{i.get('qty', '')}x {i.get('description', '')} à €{i.get('unit_price', 0):.2f}"
                for i in items
            )

            net = spec.get("net_total", inv.get("gross_total", 0))
            vat = spec.get("vat_amount", 0)
            gross = spec.get("gross_total", inv.get("gross_total", 0))
            tax_mode = spec.get("tax_mode", "kleinunternehmer")
            tax_rate = 0
            if net and vat:
                tax_rate = round(vat / net * 100) if net else 0

            recipient = spec.get("recipient", {})
            issuer = spec.get("issuer", {})

            writer.writerow({
                "Rechnungsnummer": inv["invoice_number"],
                "Rechnungsdatum": inv.get("invoice_date", ""),
                "Leistungsdatum": spec.get("delivery_date", ""),
                "Empfänger": inv.get("recipient_name", ""),
                "Empfänger UID": recipient.get("uid", ""),
                "Empfänger Adresse": f"{recipient.get('street', '')}, {recipient.get('postal_city_country', '')}",
                "Netto": f"{net:.2f}".replace(".", ","),
                "USt-Betrag": f"{vat:.2f}".replace(".", ","),
                "Brutto": f"{gross:.2f}".replace(".", ","),
                "Steuersatz": f"{tax_rate}%",
                "Steuermodus": tax_mode,
                "Status": inv.get("status", ""),
                "Zahlungsdatum": inv.get("paid_date", ""),
                "Erinnerung": inv.get("remind_date", ""),
                "1. Mahnung": inv.get("mahn1_date", ""),
                "2. Mahnung": inv.get("mahn2_date", ""),
                "Positionen": len(items),
                "Beschreibung": item_descriptions,
            })

    print(f"✅ Export: {output}")
    print(f"   {len(invoices)} Rechnung(en) exportiert")
    total = sum(i.get("gross_total", 0) for i in invoices)
    print(f"   Gesamtvolumen: € {total:.2f}")

    # Also export incoming invoices if they exist
    incoming_path = Path("/opt/data/invoice-tool/incoming_invoices.json")
    if incoming_path.exists():
        incoming_db = json.loads(incoming_path.read_text(encoding="utf-8"))
        incoming = incoming_db.get("invoices", [])
        if args.date_from:
            incoming = [i for i in incoming if i.get("invoice_date", "") >= args.date_from]
        if args.date_to:
            incoming = [i for i in incoming if i.get("invoice_date", "") <= args.date_to]
        if incoming:
            incoming_out = str(output).replace(".csv", "_eingang.csv")
            with open(incoming_out, "w", newline="", encoding="utf-8-sig") as f:
                w = csv.DictWriter(f, fieldnames=[
                    "Rechnungsnummer", "Rechnungsdatum", "Lieferant", "UID",
                    "Netto", "USt-Betrag", "Brutto", "Steuersatz",
                    "Kategorie", "Status", "Zahlungsdatum", "Beschreibung",
                ], delimiter=";")
                w.writeheader()
                for inv in incoming:
                    w.writerow({
                        "Rechnungsnummer": inv["number"],
                        "Rechnungsdatum": inv.get("invoice_date", ""),
                        "Lieferant": inv.get("issuer_name", ""),
                        "UID": inv.get("issuer_uid", ""),
                        "Netto": f"{inv.get('net_amount', 0):.2f}".replace(".", ","),
                        "USt-Betrag": f"{inv.get('vat_amount', 0):.2f}".replace(".", ","),
                        "Brutto": f"{inv.get('gross_amount', 0):.2f}".replace(".", ","),
                        "Steuersatz": f"{inv.get('tax_rate', 0)}%",
                        "Kategorie": inv.get("category", ""),
                        "Status": inv.get("status", ""),
                        "Zahlungsdatum": inv.get("paid_date", ""),
                        "Beschreibung": inv.get("description", ""),
                    })
            print(f"✅ Eingang: {incoming_out}")
            print(f"   {len(incoming)} Eingangsrechnung(en) exportiert")
            incoming_total = sum(i.get("gross_amount", 0) for i in incoming)
            print(f"   Gesamtvolumen Eingang: € {incoming_total:.2f}")


if __name__ == "__main__":
    main()
