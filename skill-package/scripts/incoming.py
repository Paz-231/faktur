#!/usr/bin/env python3
"""
Eingangsrechnungen — verwaltet an dich gestellte Rechnungen.

Speichert Lieferanten-Rechnungen, trackt Zahlungsstatus, und integriert
in den Buchhaltungs-Export.

Datenbank: /opt/data/invoice-tool/incoming_invoices.json

Usage:
    python3 incoming.py add --number "RE-2026-123" --issuer "AWS" --date 2026-07-01 --amount 500.00 [--vat 100.00] [--uid "ATU..."]
    python3 incoming.py add-from-spec <spec.json>          # Aus geparstem PDF/Foto
    python3 incoming.py list [--status open|paid] [--issuer "AWS"]
    python3 incoming.py find <number>
    python3 incoming.py paid <number>                       # Als bezahlt markieren
    python3 incoming.py status <number>
    python3 incoming.py summary                              # Zusammenfassung (Gesamt, offen, bezahlt)
"""
import json
import sys
import argparse
from pathlib import Path
from datetime import datetime

DB_PATH = Path("/opt/data/invoice-tool/incoming_invoices.json")


def load_db():
    if DB_PATH.exists():
        return json.loads(DB_PATH.read_text(encoding="utf-8"))
    return {"invoices": []}


def save_db(db):
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    DB_PATH.write_text(json.dumps(db, ensure_ascii=False, indent=2), encoding="utf-8")


def cmd_add(args):
    db = load_db()
    # Check duplicate
    for inv in db["invoices"]:
        if inv["number"] == args.number:
            print(f"❌ Eingangsrechnung {args.number} bereits vorhanden", file=sys.stderr)
            sys.exit(1)

    net = args.amount - (args.vat or 0)
    record = {
        "number": args.number,
        "issuer_name": args.issuer,
        "issuer_uid": args.uid or "",
        "invoice_date": args.date,
        "delivery_date": args.delivery_date or "",
        "net_amount": round(net, 2) if args.vat else args.amount,
        "vat_amount": args.vat or 0.0,
        "gross_amount": args.amount,
        "tax_rate": round(args.vat / net * 100, 1) if args.vat and net else 0.0,
        "currency": args.currency or "EUR",
        "payment_terms": args.payment_terms or "",
        "iban": args.iban or "",
        "bic": args.bic or "",
        "category": args.category or "",
        "description": args.description or "",
        "file_path": args.file or "",
        "status": "open",
        "paid_date": None,
        "paid_amount": None,
        "created_at": datetime.now().isoformat(),
    }
    db["invoices"].append(record)
    save_db(db)
    print(f"✅ Eingangsrechnung gespeichert: {args.number}")
    print(f"   Lieferant:  {args.issuer}")
    print(f"   Datum:      {args.date}")
    print(f"   Betrag:     € {args.amount:.2f}" + (f" (net € {net:.2f} + USt € {args.vat:.2f})" if args.vat else ""))
    print(f"   Status:     open")


def cmd_add_from_spec(args):
    """Aus einem geparsten JSON (z.B. aus PDF/Foto Extraktion) hinzufügen."""
    spec = json.loads(Path(args.spec).read_text(encoding="utf-8"))
    db = load_db()

    number = spec.get("invoice_number", "")
    if not number:
        print("❌ invoice_number fehlt im Spec", file=sys.stderr)
        sys.exit(1)

    for inv in db["invoices"]:
        if inv["number"] == number:
            print(f"❌ {number} bereits vorhanden", file=sys.stderr)
            sys.exit(1)

    issuer = spec.get("issuer", {})
    items = spec.get("items", [])
    net = sum(i.get("total", i.get("qty", 1) * i.get("unit_price", 0)) for i in items)
    vat = spec.get("vat_amount", 0)
    gross = spec.get("gross_total", net + vat)

    record = {
        "number": number,
        "issuer_name": issuer.get("name", ""),
        "issuer_uid": issuer.get("uid", ""),
        "invoice_date": spec.get("invoice_date", ""),
        "delivery_date": spec.get("delivery_date", ""),
        "net_amount": net,
        "vat_amount": vat,
        "gross_amount": gross,
        "tax_rate": round(vat / net * 100, 1) if net and vat else 0.0,
        "currency": "EUR",
        "payment_terms": spec.get("payment_terms", ""),
        "iban": issuer.get("iban", ""),
        "bic": issuer.get("bic", ""),
        "category": "",
        "description": " | ".join(i.get("description", "") for i in items),
        "file_path": args.pdf or "",
        "status": "open",
        "paid_date": None,
        "paid_amount": None,
        "created_at": datetime.now().isoformat(),
    }
    db["invoices"].append(record)
    save_db(db)
    print(f"✅ Eingangsrechnung gespeichert: {number}")
    print(f"   Lieferant:  {issuer.get('name', '?')}")
    print(f"   Betrag:     € {gross:.2f} (net € {net:.2f} + USt € {vat:.2f})")


def cmd_list(args):
    db = load_db()
    invs = db["invoices"]
    if args.status:
        invs = [i for i in invs if i["status"] == args.status]
    if args.issuer:
        invs = [i for i in invs if args.issuer.lower() in i["issuer_name"].lower()]
    if not invs:
        print("Keine Eingangsrechnungen gefunden.")
        return
    status_emoji = {"open": "🟡", "paid": "🟢"}
    for inv in sorted(invs, key=lambda x: x.get("invoice_date", "")):
        e = status_emoji.get(inv["status"], "⚪")
        print(f"  {e} {inv['number']} — {inv['issuer_name']} — € {inv['gross_amount']:.2f} — {inv['invoice_date']} — {inv['status']}")


def cmd_find(args):
    db = load_db()
    for inv in db["invoices"]:
        if inv["number"] == args.number:
            print(json.dumps(inv, ensure_ascii=False, indent=2))
            return
    print(f"❌ {args.number} nicht gefunden", file=sys.stderr)
    sys.exit(1)


def cmd_paid(args):
    db = load_db()
    for inv in db["invoices"]:
        if inv["number"] == args.number:
            inv["status"] = "paid"
            inv["paid_date"] = args.date or datetime.now().strftime("%d.%m.%Y")
            inv["paid_amount"] = args.amount or inv["gross_amount"]
            save_db(db)
            print(f"✅ {args.number} als bezahlt markiert")
            print(f"   Bezahlt am: {inv['paid_date']}")
            print(f"   Betrag:     € {inv['paid_amount']:.2f}")
            return
    print(f"❌ {args.number} nicht gefunden", file=sys.stderr)
    sys.exit(1)


def cmd_status(args):
    db = load_db()
    for inv in db["invoices"]:
        if inv["number"] == args.number:
            print(json.dumps(inv, ensure_ascii=False, indent=2))
            return
    print(f"❌ {args.number} nicht gefunden", file=sys.stderr)
    sys.exit(1)


def cmd_summary(args):
    db = load_db()
    invs = db["invoices"]
    if not invs:
        print("Keine Eingangsrechnungen vorhanden.")
        return
    total_gross = sum(i["gross_amount"] for i in invs)
    total_net = sum(i["net_amount"] for i in invs)
    total_vat = sum(i["vat_amount"] for i in invs)
    open_invs = [i for i in invs if i["status"] == "open"]
    paid_invs = [i for i in invs if i["status"] == "paid"]
    open_total = sum(i["gross_amount"] for i in open_invs)
    paid_total = sum(i["gross_amount"] for i in paid_invs)

    print("════════════════════════════════════════════")
    print("  EINGANGSRECHNUNGEN — ÜBERSICHT")
    print("════════════════════════════════════════════")
    print(f"  Gesamt:         {len(invs)} Rechnungen")
    print(f"  Offen:         {len(open_invs)} (€ {open_total:.2f})")
    print(f"  Bezahlt:       {len(paid_invs)} (€ {paid_total:.2f})")
    print(f"  ─────────────────────────────────────────")
    print(f"  Gesamt netto:  € {total_net:.2f}")
    print(f"  Gesamt USt:    € {total_vat:.2f}")
    print(f"  Gesamt brutto: € {total_gross:.2f}")
    print("════════════════════════════════════════════")

    # Top Lieferanten
    from collections import Counter
    by_issuer = Counter(i["issuer_name"] for i in invs)
    if by_issuer:
        print("\n  Top Lieferanten:")
        for name, count in by_issuer.most_common(5):
            total = sum(i["gross_amount"] for i in invs if i["issuer_name"] == name)
            print(f"    {name}: {count} Rechnungen, € {total:.2f}")
    print("════════════════════════════════════════════")


def main():
    parser = argparse.ArgumentParser(description="Eingangsrechnungen — an dich gestellte Rechnungen verwalten")
    sub = parser.add_subparsers(dest="command")

    # add
    p_add = sub.add_parser("add", help="Neue Eingangsrechnung hinzufügen")
    p_add.add_argument("--number", required=True, help="Rechnungsnummer des Lieferanten")
    p_add.add_argument("--issuer", required=True, help="Lieferant / Rechnungssteller")
    p_add.add_argument("--date", required=True, help="Rechnungsdatum (DD.MM.YYYY oder YYYY-MM-DD)")
    p_add.add_argument("--amount", type=float, required=True, help="Bruttobetrag")
    p_add.add_argument("--vat", type=float, help="USt-Betrag (falls angegeben)")
    p_add.add_argument("--uid", help="UID des Lieferanten")
    p_add.add_argument("--delivery-date", help="Leistungsdatum")
    p_add.add_argument("--payment-terms", help="Zahlungsbedingungen")
    p_add.add_argument("--iban")
    p_add.add_argument("--bic")
    p_add.add_argument("--category", help="Kategorie (z.B. Server, Software, Beratung)")
    p_add.add_argument("--description", help="Beschreibung")
    p_add.add_argument("--currency", default="EUR")
    p_add.add_argument("--file", help="Pfad zur PDF/Datei")
    p_add.set_defaults(func=cmd_add)

    # add-from-spec
    p_spec = sub.add_parser("add-from-spec", help="Aus JSON-Spec hinzufügen (z.B. geparstes PDF/Foto)")
    p_spec.add_argument("spec", help="Pfad zur JSON-Spec")
    p_spec.add_argument("--pdf", help="Pfad zur Original-PDF")
    p_spec.set_defaults(func=cmd_add_from_spec)

    # list
    p_list = sub.add_parser("list", help="Eingangsrechnungen auflisten")
    p_list.add_argument("--status", choices=["open", "paid"])
    p_list.add_argument("--issuer", help="Filter nach Lieferant")
    p_list.set_defaults(func=cmd_list)

    # find
    p_find = sub.add_parser("find", help="Eingangsrechnung suchen")
    p_find.add_argument("number")
    p_find.set_defaults(func=cmd_find)

    # paid
    p_paid = sub.add_parser("paid", help="Als bezahlt markieren")
    p_paid.add_argument("number")
    p_paid.add_argument("--date", help="Zahlungsdatum (DD.MM.YYYY)")
    p_paid.add_argument("--amount", type=float, help="Tatsächlich bezahlter Betrag")
    p_paid.set_defaults(func=cmd_paid)

    # status
    p_status = sub.add_parser("status", help="Details anzeigen")
    p_status.add_argument("number")
    p_status.set_defaults(func=cmd_status)

    # summary
    sub.add_parser("summary", help="Übersicht: Gesamt, offen, bezahlt, Top Lieferanten").set_defaults(func=cmd_summary)

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(1)
    args.func(args)


if __name__ == "__main__":
    main()
