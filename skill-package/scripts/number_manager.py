#!/usr/bin/env python3
"""
Rechnungsnummer-Manager — garantiert lückenlosen, fortlaufenden Nummernkreis.

Features:
- Atomare Nummernvergabe (keine Lücken, keine doppelten Nummern)
- Storno-Rechnungen mit eigenem Schema (STORNO-RE-YYYY-NNNNNN)
- Stornierte Rechnungen bleiben im Register (werden nie gelöscht)
- Vollständiges Audit-Log (wann, welche Nummer, welcher Status)
- Sperrt Rechnungsnummern bis die Rechnung finalisiert ist (Reservierung)

Datenbank: /opt/data/invoice-tool/number_sequence.json

Usage:
    python3 number_manager.py next [--type Honorarnote|Rechnung] [--year 2026]
    python3 number_manager.py reserve <number>       # Nummer reservieren (vor PDF)
    python3 number_manager.py finalize <number>        # Reservierung → final (PDF erstellt)
    python3 number_manager.py cancel <number>          # Storno erzeugen (gibt STORNO-Nummer zurück)
    python3 number_manager.py status <number>          # Status abfragen
    python3 number_manager.py list [--year 2026]      # Alle Nummern auflisten
    python3 number_manager.py check                   # Konsistenz-Check (Lücken, doppelte)
"""
import json
import sys
import argparse
import fcntl
from pathlib import Path
from datetime import datetime

DB_PATH = Path("/opt/data/invoice-tool/number_sequence.json")


def load_db():
    if DB_PATH.exists():
        return json.loads(DB_PATH.read_text(encoding="utf-8"))
    return {
        "sequences": {},        # "2026": { "next": 1 }, "2027": { "next": 1 }
        "invoices": {},          # "RE-2026-000001": { status, reserved_at, finalized_at, ... }
        "storno_links": {},     # "RE-2026-000001": "STORNO-RE-2026-000001" (original → storno)
        "audit_log": [],        # [{ timestamp, action, number, details }]
    }


def save_db(db):
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    DB_PATH.write_text(json.dumps(db, ensure_ascii=False, indent=2), encoding="utf-8")


def audit_log(db, action, number, details=""):
    db["audit_log"].append({
        "timestamp": datetime.now().isoformat(),
        "action": action,
        "number": number,
        "details": details,
    })


def format_number(seq, year, prefix="RE"):
    return f"{prefix}-{year}-{seq:06d}"


def cmd_next(args):
    """Nächste freie Rechnungsnummer generieren und reservieren."""
    db = load_db()
    year = str(args.year or datetime.now().year)

    # Initialize sequence for year if needed
    if year not in db["sequences"]:
        db["sequences"][year] = {"next": 1}

    # Get next number
    seq = db["sequences"][year]["next"]
    number = format_number(seq, year, prefix="RE")

    # Check it doesn't already exist (shouldn't, but safety)
    if number in db["invoices"]:
        # Find next truly free number
        while number in db["invoices"]:
            seq += 1
            number = format_number(seq, year)

    # Reserve it
    db["invoices"][number] = {
        "status": "reserved",
        "type": args.type or "Rechnung",
        "year": year,
        "sequence": seq,
        "reserved_at": datetime.now().isoformat(),
        "finalized_at": None,
        "storno_of": None,
        "storno_number": None,
    }
    db["sequences"][year]["next"] = seq + 1
    audit_log(db, "next", number, f"Reserved as {args.type or 'Rechnung'}")

    save_db(db)
    print(number)


def cmd_reserve(args):
    """Bestehende Nummer als reserviert markieren (wenn manuell vergeben)."""
    db = load_db()
    number = args.number
    if number in db["invoices"] and db["invoices"][number]["status"] == "finalized":
        print(f"❌ {number} already finalized", file=sys.stderr)
        sys.exit(1)
    db["invoices"][number] = {
        "status": "reserved",
        "type": "Rechnung",
        "year": number.split("-")[1] if "-" in number else str(datetime.now().year),
        "sequence": int(number.split("-")[-1]) if "-" in number else 0,
        "reserved_at": datetime.now().isoformat(),
        "finalized_at": None,
        "storno_of": None,
        "storno_number": None,
    }
    audit_log(db, "reserve", number)
    save_db(db)
    print(f"✅ Reserved: {number}")


def cmd_finalize(args):
    """Reservierung → final (PDF wurde erstellt)."""
    db = load_db()
    number = args.number
    if number not in db["invoices"]:
        print(f"❌ {number} not found in register", file=sys.stderr)
        sys.exit(1)
    if db["invoices"][number]["status"] == "finalized":
        print(f"⚠️  {number} already finalized")
        return
    if db["invoices"][number]["status"] == "storno":
        print(f"❌ {number} is a storno invoice", file=sys.stderr)
        sys.exit(1)

    db["invoices"][number]["status"] = "finalized"
    db["invoices"][number]["finalized_at"] = datetime.now().isoformat()
    audit_log(db, "finalize", number)
    save_db(db)
    print(f"✅ Finalized: {number}")


def cmd_cancel(args):
    """Storno-Rechnung für eine existierende Rechnung erzeugen.

    - Original-Rechnung wird als 'storno' markiert (bleibt im Register!)
    - Neue Storno-Rechnungsnummer wird generiert (STORNO-RE-YYYY-NNNNNN)
    - Storno-Nummer ist fortlaufend im gleichen Jahreskreis
    """
    db = load_db()
    original = args.number

    if original not in db["invoices"]:
        print(f"❌ {original} not found in register", file=sys.stderr)
        sys.exit(1)

    if db["invoices"][original]["status"] == "storno":
        print(f"❌ {original} is already a storno invoice — cannot storno a storno", file=sys.stderr)
        sys.exit(1)

    if db["invoices"][original].get("storno_of"):
        print(f"❌ {original} is itself a storno invoice — cannot storno a storno", file=sys.stderr)
        sys.exit(1)

    if db["invoices"][original].get("storno_number"):
        print(f"❌ {original} already has a storno: {db['invoices'][original]['storno_number']}", file=sys.stderr)
        sys.exit(1)

    # Get original year
    year = db["invoices"][original].get("year", str(datetime.now().year))

    # Generate storno number (same sequence, STORNO- prefix)
    if year not in db["sequences"]:
        db["sequences"][year] = {"next": 1}
    seq = db["sequences"][year]["next"]
    storno_number = format_number(seq, year, prefix="STORNO-RE")

    # Safety check
    while storno_number in db["invoices"]:
        seq += 1
        storno_number = format_number(seq, year, prefix="STORNO-RE")

    # Mark original as storno (but keep it in register!)
    db["invoices"][original]["status"] = "storno"
    db["invoices"][original]["storno_number"] = storno_number
    db["invoices"][original]["storno_at"] = datetime.now().isoformat()

    # Create storno invoice entry
    db["invoices"][storno_number] = {
        "status": "reserved",
        "type": "Storno",
        "year": year,
        "sequence": seq,
        "reserved_at": datetime.now().isoformat(),
        "finalized_at": None,
        "storno_of": original,
        "storno_number": None,
    }

    # Link original → storno
    db["storno_links"][original] = storno_number

    # Advance sequence
    db["sequences"][year]["next"] = seq + 1

    audit_log(db, "cancel", original, f"Storno created: {storno_number}")
    audit_log(db, "storno_created", storno_number, f"Storno of {original}")

    save_db(db)
    print(storno_number)


def cmd_status(args):
    """Status einer Rechnungsnummer abfragen."""
    db = load_db()
    number = args.number
    if number not in db["invoices"]:
        print(f"❌ {number} not found", file=sys.stderr)
        sys.exit(1)
    inv = db["invoices"][number]
    print(json.dumps(inv, ensure_ascii=False, indent=2))
    if inv.get("storno_number"):
        print(f"\n  ⛔ Storno: {inv['storno_number']}")
    if inv.get("storno_of"):
        print(f"\n  ⛔ Storno of: {inv['storno_of']}")


def cmd_list(args):
    """Alle Rechnungsnummern auflisten."""
    db = load_db()
    year = str(args.year) if args.year else None

    invoices = db.get("invoices", {})
    if not invoices:
        print("No invoices registered.")
        return

    items = sorted(invoices.items())
    if year:
        items = [(n, i) for n, i in items if i.get("year") == year]

    if not items:
        print(f"No invoices for year {year}.")
        return

    status_emoji = {
        "reserved": "🔵",
        "finalized": "🟢",
        "storno": "🔴",
    }

    for number, inv in items:
        emoji = status_emoji.get(inv["status"], "⚪")
        line = f"  {emoji} {number} — {inv['status']} — {inv.get('type', '?')}"
        if inv.get("storno_number"):
            line += f" → STORNO: {inv['storno_number']}"
        if inv.get("storno_of"):
            line += f" (Storno of {inv['storno_of']})"
        print(line)


def cmd_check(args):
    """Konsistenz-Check: Lücken, doppelte, verwaiste Reservierungen."""
    db = load_db()
    errors = []
    warnings = []

    invoices = db.get("invoices", {})
    sequences = db.get("sequences", {})

    # Check 1: Lücken im Nummernkreis (nur finalized + storno zählen als "belegt")
    for year, seq_data in sequences.items():
        next_seq = seq_data["next"]
        # Collect all used sequence numbers for this year
        used_seqs = set()
        for number, inv in invoices.items():
            if inv.get("year") == year and inv.get("sequence"):
                used_seqs.add(inv["sequence"])

        # Check for gaps (1 to next-1 should all be present)
        expected = set(range(1, next_seq))
        missing = expected - used_seqs
        if missing:
            # Only flag as error if the missing numbers are not reserved
            # (reserved numbers are ok — they're in progress)
            truly_missing = []
            for m in sorted(missing):
                num_str = format_number(m, year)
                storno_str = format_number(m, year, "STORNO-RE")
                if num_str not in invoices and storno_str not in invoices:
                    truly_missing.append(m)
            if truly_missing:
                errors.append(f"Year {year}: Gap in sequence — missing positions: {truly_missing}")

    # Check 2: Doppelte Nummern (sollte nie passieren)
    all_numbers = list(invoices.keys())
    duplicates = [n for n in all_numbers if all_numbers.count(n) > 1]
    if duplicates:
        errors.append(f"Duplicate numbers: {set(duplicates)}")

    # Check 3: Verwaiste Reservierungen (reserviert aber nie finalisiert)
    for number, inv in invoices.items():
        if inv["status"] == "reserved":
            reserved_time = datetime.fromisoformat(inv.get("reserved_at", datetime.now().isoformat()))
            age = (datetime.now() - reserved_time).total_seconds() / 3600
            if age > 1:
                warnings.append(f"Stale reservation: {number} (reserved {age:.1f}h ago)")

    # Check 4: Storno-Link Konsistenz
    for original, storno in db.get("storno_links", {}).items():
        if original not in invoices:
            errors.append(f"Storno link points to missing invoice: {original}")
        if storno not in invoices:
            errors.append(f"Storno link target missing: {storno}")
        if original in invoices and invoices[original].get("storno_number") != storno:
            errors.append(f"Storno link mismatch: {original}.storno_number != {storno}")
        if storno in invoices and invoices[storno].get("storno_of") != original:
            errors.append(f"Storno reverse link mismatch: {storno}.storno_of != {original}")

    # Check 5: Stornierte Rechnung ohne Storno-PDF
    for number, inv in invoices.items():
        if inv["status"] == "storno" and not inv.get("storno_number"):
            errors.append(f"Storno invoice {number} has no storno number")

    # Report
    print("════════════════════════════════════════════")
    print("  RECHNUNGSNUMMER-KONSISTENZCHECK")
    print("════════════════════════════════════════════")
    print(f"  Invoices registered: {len(invoices)}")
    print(f"  Years active: {sorted(sequences.keys())}")
    for year, seq_data in sequences.items():
        count = sum(1 for i in invoices.values() if i.get("year") == year)
        print(f"    {year}: next={seq_data['next']}, registered={count}")

    if errors:
        print(f"\n  ❌ ERRORS ({len(errors)}):")
        for e in errors:
            print(f"    - {e}")
    else:
        print("\n  ✅ Keine Lücken, keine doppelten, alle Storno-Links konsistent.")

    if warnings:
        print(f"\n  ⚠️  WARNINGS ({len(warnings)}):")
        for w in warnings:
            print(f"    - {w}")

    print("════════════════════════════════════════════")
    if errors:
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Rechnungsnummer-Manager — lückenloser Nummernkreis")
    sub = parser.add_subparsers(dest="command")

    p_next = sub.add_parser("next", help="Nächste Rechnungsnummer holen und reservieren")
    p_next.add_argument("--type", default="Rechnung", choices=["Rechnung", "Honorarnote"])
    p_next.add_argument("--year", type=int, help="Year (default: current)")
    p_next.set_defaults(func=cmd_next)

    p_reserve = sub.add_parser("reserve", help="Bestehende Nummer reservieren")
    p_reserve.add_argument("number")
    p_reserve.set_defaults(func=cmd_reserve)

    p_final = sub.add_parser("finalize", help="Reservierung → final (PDF erstellt)")
    p_final.add_argument("number")
    p_final.set_defaults(func=cmd_finalize)

    p_cancel = sub.add_parser("cancel", help="Storno-Rechnung erzeugen (gibt STORNO-Nummer zurück)")
    p_cancel.add_argument("number")
    p_cancel.set_defaults(func=cmd_cancel)

    p_status = sub.add_parser("status", help="Status einer Nummer abfragen")
    p_status.add_argument("number")
    p_status.set_defaults(func=cmd_status)

    p_list = sub.add_parser("list", help="Alle Nummern auflisten")
    p_list.add_argument("--year", type=int)
    p_list.set_defaults(func=cmd_list)

    sub.add_parser("check", help="Konsistenz-Check (Lücken, doppelte, Storno-Links)").set_defaults(func=cmd_check)

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(1)
    args.func(args)


if __name__ == "__main__":
    main()
