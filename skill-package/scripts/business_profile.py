#!/usr/bin/env python3
"""
Unternehmensprofil-Manager — verwaltet Unternehmensstruktur und Steuerstatus.

Problem: Wenn sich die Unternehmensstruktur ändert (z.B. Kleinunternehmer → USt-pflichtig),
müssen Rechnungen ab dem Stichtag anders behandelt werden. Alte Rechnungen behalten
den alten Steuerstatus. Neue Rechnungen bekommen den neuen.

Features:
- Speichert Unternehmensprofile mit Gültigkeitszeitraum (von/bis)
- Verwaltet Steuerstatus-Änderungen (Kleinunternehmer → USt-pflichtig, etc.)
- Automatische Bestimmung des korrekten Steuerstatus für ein bestimmtes Datum
- Audit-Log aller Änderungen
- UID-Änderungen werden versioniert

Datenbank: /opt/data/invoice-tool/business_profile.json

Usage:
    python3 business_profile.py show                              # Aktuelles Profil anzeigen
    python3 business_profile.py set --name "..." --street "..."   # Basisdaten setzen
    python3 business_profile.py tax-status --status kleinunternehmer --from 2026-01-01
    python3 business_profile.py tax-status --status ust_standard --from 2026-07-01  # Wechsel
    python3 business_profile.py tax-status --status ust_standard --from 2026-07-01 --rate 20
    python3 business_profile.py for-date 2026-06-15              # Steuerstatus für bestimmtes Datum
    python3 business_profile.py history                           # Alle Änderungen
    python3 business_profile.py legal-form --form einzelunternehmen
    python3 business_profile.py uid ATU12345678                   # UID ändern
"""
import json
import sys
import argparse
from pathlib import Path
from datetime import datetime, date

DB_PATH = Path("/opt/data/invoice-tool/business_profile.json")

VALID_LEGAL_FORMS = [
    "einzelunternehmen",
    "gbr",
    "ohg",
    "kg",
    "gmbh",
    "ug",
    "ag",
    "eg",
    "verein",
    "freelancer",
    "sole_trader",
]

VALID_TAX_STATUSES = [
    "kleinunternehmer",      # AT: §6 Abs1 Z27 UStG, DE: §19 UStG — 0% USt
    "ust_standard",          # Regulär umsatzsteuerpflichtig (AT 20%, DE 19%)
    "ust_ermaessigt",        # Ermäßigter Steuersatz (AT 10%/13%, DE 7%) — nur für bestimmte Leistungen
    "reverse_charge",        # Steuerschuldnerschaft des Leistungsempfängers
    "befreit",               # Von USt befreit (z.B. ärztliche Heilbehandlung)
    "nicht_uid_pflichtig",   # Unter der UID-Grenze (AT: €35.000)
]

# Default tax rates per status and country
DEFAULT_RATES = {
    "AT": {
        "kleinunternehmer": 0.0,
        "ust_standard": 20.0,
        "ust_ermaessigt": 10.0,   # 10% für Tourismus, 13% für lebende Tiere
        "reverse_charge": 0.0,
        "befreit": 0.0,
    },
    "DE": {
        "kleinunternehmer": 0.0,
        "ust_standard": 19.0,
        "ust_ermaessigt": 7.0,
        "reverse_charge": 0.0,
        "befreit": 0.0,
    },
}

# Legal form → affects UID requirement and invoice format
LEGAL_FORM_INFO = {
    "einzelunternehmen": {"uid_required": "optional", "suffix": ""},
    "gbr": {"uid_required": "optional", "suffix": "GbR"},
    "ohg": {"uid_required": "yes", "suffix": "OHG"},
    "kg": {"uid_required": "yes", "suffix": "KG"},
    "gmbh": {"uid_required": "yes", "suffix": "GmbH"},
    "ug": {"uid_required": "yes", "suffix": "UG (haftungsbeschränkt)"},
    "ag": {"uid_required": "yes", "suffix": "AG"},
    "eg": {"uid_required": "yes", "suffix": "eG"},
    "verein": {"uid_required": "optional", "suffix": "e.V."},
    "freelancer": {"uid_required": "no", "suffix": ""},
    "sole_trader": {"uid_required": "optional", "suffix": ""},
}


def load_db():
    if DB_PATH.exists():
        return json.loads(DB_PATH.read_text(encoding="utf-8"))
    return {
        "base": {
            "name": None,
            "street": None,
            "postal_city_country": None,
            "country": "AT",
            "email": None,
            "phone": None,
            "legal_form": "einzelunternehmen",
            "bank_owner": None,
            "iban": None,
            "bic": None,
        },
        "uid_history": [],       # [{ uid, valid_from, valid_until, changed_at }]
        "tax_status_history": [], # [{ status, valid_from, valid_until, rate, reason, changed_at }]
        "audit_log": [],
    }


def save_db(db):
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    DB_PATH.write_text(json.dumps(db, ensure_ascii=False, indent=2), encoding="utf-8")


def audit(db, action, details):
    db["audit_log"].append({
        "timestamp": datetime.now().isoformat(),
        "action": action,
        "details": details,
    })


def parse_date(s):
    """Parse date string: '2026-07-01' or '01.07.2026' → date object."""
    if not s:
        return None
    for fmt in ["%Y-%m-%d", "%d.%m.%Y", "%d.%m.%y"]:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    print(f"❌ Invalid date format: {s} (use YYYY-MM-DD or DD.MM.YYYY)", file=sys.stderr)
    sys.exit(1)


def date_str(d):
    if d is None:
        return None
    if isinstance(d, str):
        return d
    return d.isoformat()


def get_tax_status_for_date(db, target_date):
    """Get the tax status that was valid on a specific date."""
    if isinstance(target_date, str):
        target_date = parse_date(target_date)

    history = sorted(db.get("tax_status_history", []), key=lambda x: x["valid_from"])

    active = None
    for entry in history:
        entry_from = parse_date(entry["valid_from"])
        if entry_from <= target_date:
            active = entry
        else:
            break

    return active


def get_uid_for_date(db, target_date):
    """Get the UID that was valid on a specific date."""
    if isinstance(target_date, str):
        target_date = parse_date(target_date)

    history = sorted(db.get("uid_history", []), key=lambda x: x["valid_from"])

    active = None
    for entry in history:
        entry_from = parse_date(entry["valid_from"])
        if entry_from <= target_date:
            active = entry
        else:
            break

    return active


def get_tax_note(status, country):
    """Get the mandatory tax note for a given status."""
    notes = {
        "kleinunternehmer": {
            "AT": "Gemäß § 6 Abs. 1 Z 27 UStG von der Umsatzsteuer befreit.",
            "DE": "Gemäß § 19 UStG Kleinunternehmer — keine Umsatzsteuer ausgewiesen.",
        },
        "reverse_charge": {
            "AT": "Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge).",
            "DE": "Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge gem. § 13b UStG).",
        },
        "befreit": {
            "AT": "Von der Umsatzsteuer befreit.",
            "DE": "Von der Umsatzsteuer befreit.",
        },
    }
    if status in notes and country in notes[status]:
        return notes[status][country]
    return ""


def cmd_show(args):
    """Aktuelles Profil anzeigen."""
    db = load_db()
    today = date.today().isoformat()
    tax = get_tax_status_for_date(db, today)
    uid = get_uid_for_date(db, today)

    print("════════════════════════════════════════════")
    print("  UNTERNEHMENSPROFIL (aktuell)")
    print("════════════════════════════════════════════")
    base = db["base"]
    print(f"  Name:           {base.get('name', '❌ nicht gesetzt')}")
    print(f"  Rechtsform:     {base.get('legal_form', 'einzelunternehmen')}")
    if lf := LEGAL_FORM_INFO.get(base.get("legal_form", ""), {}):
        print(f"  Suffix:         {lf.get('suffix', '-')}")
    print(f"  Adresse:        {base.get('street', '❌')}")
    print(f"                 {base.get('postal_city_country', '❌')}")
    print(f"  Land:           {base.get('country', 'AT')}")
    if uid:
        print(f"  UID:            {uid.get('uid', '—')}")
    else:
        print(f"  UID:            — (keine gesetzt)")
    if base.get("email"):
        print(f"  Email:          {base['email']}")
    if base.get("phone"):
        print(f"  Telefon:        {base['phone']}")
    if base.get("iban"):
        print(f"  Bankverbindung:")
        print(f"    Inhaber:      {base.get('bank_owner', base.get('name', '—'))}")
        print(f"    IBAN:         {base['iban']}")
        if base.get("bic"):
            print(f"    BIC:          {base['bic']}")

    print()
    if tax:
        print(f"  Steuerstatus:   {tax['status']}")
        print(f"  Steuersatz:     {tax.get('rate', 0)}%")
        print(f"  Gültig seit:    {tax['valid_from']}")
        if tax.get("valid_until"):
            print(f"  Gültig bis:     {tax['valid_until']}")
        if tax.get("reason"):
            print(f"  Grund:          {tax['reason']}")
        note = get_tax_note(tax["status"], base.get("country", "AT"))
        if note:
            print(f"  Steuerhinweis:  \"{note}\"")
    else:
        print(f"  Steuerstatus:   ❌ nicht gesetzt")

    print()
    print(f"  Steuerstatus-Historie: {len(db.get('tax_status_history', []))} Einträge")
    print(f"  UID-Historie:          {len(db.get('uid_history', []))} Einträge")
    print(f"  Audit-Log:             {len(db.get('audit_log', []))} Einträge")
    print("════════════════════════════════════════════")


def cmd_set(args):
    """Basisdaten setzen."""
    db = load_db()
    changed = []
    if args.name:
        db["base"]["name"] = args.name; changed.append("name")
    if args.street:
        db["base"]["street"] = args.street; changed.append("street")
    if args.city:
        db["base"]["postal_city_country"] = args.city; changed.append("postal_city_country")
    if args.country:
        db["base"]["country"] = args.country.upper(); changed.append("country")
    if args.email is not None:
        db["base"]["email"] = args.email; changed.append("email")
    if args.phone is not None:
        db["base"]["phone"] = args.phone; changed.append("phone")
    if args.bank_owner is not None:
        db["base"]["bank_owner"] = args.bank_owner; changed.append("bank_owner")
    if args.iban is not None:
        db["base"]["iban"] = args.iban; changed.append("iban")
    if args.bic is not None:
        db["base"]["bic"] = args.bic; changed.append("bic")
    audit(db, "set_base", ", ".join(changed))
    save_db(db)
    print(f"✅ Updated: {', '.join(changed)}")


def cmd_legal_form(args):
    """Rechtsform ändern."""
    db = load_db()
    if args.form not in VALID_LEGAL_FORMS:
        print(f"❌ Invalid legal form. Valid: {VALID_LEGAL_FORMS}", file=sys.stderr)
        sys.exit(1)
    old = db["base"].get("legal_form", "?")
    db["base"]["legal_form"] = args.form
    audit(db, "legal_form", f"{old} → {args.form}")
    save_db(db)
    info = LEGAL_FORM_INFO.get(args.form, {})
    print(f"✅ Rechtsform: {old} → {args.form}")
    if info.get("suffix"):
        print(f"   Suffix: {info['suffix']}")
    print(f"   UID erforderlich: {info.get('uid_required', '?')}")


def cmd_tax_status(args):
    """Steuerstatus setzen (mit Gültigkeitsdatum)."""
    db = load_db()
    if args.status not in VALID_TAX_STATUSES:
        print(f"❌ Invalid status. Valid: {VALID_TAX_STATUSES}", file=sys.stderr)
        sys.exit(1)

    valid_from = args.from_date or date.today().isoformat()
    valid_from_date = parse_date(valid_from)
    country = db["base"].get("country", "AT")

    # Determine rate
    if args.rate is not None:
        rate = args.rate
    else:
        rate = DEFAULT_RATES.get(country, {}).get(args.status, 0.0)

    # Close previous status (set valid_until)
    history = sorted(db.get("tax_status_history", []), key=lambda x: x["valid_from"])
    for entry in history:
        entry_from = parse_date(entry["valid_from"])
        if entry.get("valid_until") is None and entry_from < valid_from_date:
            # Set valid_until to day before new status
            entry["valid_until"] = (valid_from_date - __import__("datetime").timedelta(days=1)).isoformat()

    # Add new entry
    new_entry = {
        "status": args.status,
        "valid_from": valid_from,
        "valid_until": None,
        "rate": rate,
        "country": country,
        "reason": args.reason or "",
        "changed_at": datetime.now().isoformat(),
    }
    db["tax_status_history"].append(new_entry)
    db["tax_status_history"] = sorted(db["tax_status_history"], key=lambda x: x["valid_from"])

    audit(db, "tax_status", f"Set {args.status} ({rate}%) from {valid_from}")
    save_db(db)

    print(f"✅ Steuerstatus gesetzt:")
    print(f"   Status:      {args.status}")
    print(f"   Steuersatz:  {rate}%")
    print(f"   Gültig ab:   {valid_from}")
    print(f"   Land:        {country}")
    if args.reason:
        print(f"   Grund:       {args.reason}")
    note = get_tax_note(args.status, country)
    if note:
        print(f"   Hinweis:     \"{note}\"")

    # Warn if this is a transition
    if len(db["tax_status_history"]) > 1:
        print(f"\n   ⚠️  Steuerstatus-Wechsel registriert!")
        print(f"   Rechnungen vor {valid_from} behalten den alten Status.")
        print(f"   Rechnungen ab {valid_from} verwenden den neuen Status ({rate}%).")


def cmd_uid(args):
    """UID setzen/ändern (mit Gültigkeitsdatum)."""
    db = load_db()
    valid_from = args.from_date or date.today().isoformat()
    valid_from_date = parse_date(valid_from)

    # Close previous UID
    history = sorted(db.get("uid_history", []), key=lambda x: x["valid_from"])
    for entry in history:
        entry_from = parse_date(entry["valid_from"])
        if entry.get("valid_until") is None and entry_from < valid_from_date:
            entry["valid_until"] = (valid_from_date - __import__("datetime").timedelta(days=1)).isoformat()

    new_entry = {
        "uid": args.uid,
        "valid_from": valid_from,
        "valid_until": None,
        "changed_at": datetime.now().isoformat(),
    }
    db["uid_history"].append(new_entry)
    db["uid_history"] = sorted(db["uid_history"], key=lambda x: x["valid_from"])

    audit(db, "uid_change", f"Set UID {args.uid} from {valid_from}")
    save_db(db)
    print(f"✅ UID gesetzt: {args.uid}")
    print(f"   Gültig ab: {valid_from}")


def cmd_for_date(args):
    """Steuerstatus für ein bestimmtes Datum abfragen."""
    db = load_db()
    target = parse_date(args.date)
    tax = get_tax_status_for_date(db, target)
    uid = get_uid_for_date(db, target)

    print(f"════════════════════════════════════════════")
    print(f"  PROFIL FÜR DATUM: {target.isoformat()}")
    print(f"════════════════════════════════════════════")
    if tax:
        print(f"  Steuerstatus:  {tax['status']}")
        print(f"  Steuersatz:    {tax.get('rate', 0)}%")
        print(f"  Gültig von:    {tax['valid_from']}")
        if tax.get("valid_until"):
            print(f"  Gültig bis:    {tax['valid_until']}")
        note = get_tax_note(tax["status"], db["base"].get("country", "AT"))
        if note:
            print(f"  Hinweis:       \"{note}\"")
    else:
        print(f"  Steuerstatus:  ❌ kein Status für dieses Datum")
    if uid:
        print(f"  UID:           {uid.get('uid', '—')}")
    else:
        print(f"  UID:           — (keine für dieses Datum)")
    print(f"════════════════════════════════════════════")


def cmd_history(args):
    """Vollständige Historie anzeigen."""
    db = load_db()

    print("════════════════════════════════════════════")
    print("  STEUERSTATUS-HISTORIE")
    print("════════════════════════════════════════════")
    for entry in sorted(db.get("tax_status_history", []), key=lambda x: x["valid_from"]):
        until = entry.get("valid_until") or "heute"
        print(f"  {entry['valid_from']} → {until}")
        print(f"    Status: {entry['status']} ({entry.get('rate', 0)}%)")
        if entry.get("reason"):
            print(f"    Grund:  {entry['reason']}")

    print()
    print("════════════════════════════════════════════")
    print("  UID-HISTORIE")
    print("════════════════════════════════════════════")
    for entry in sorted(db.get("uid_history", []), key=lambda x: x["valid_from"]):
        until = entry.get("valid_until") or "heute"
        print(f"  {entry['valid_from']} → {until}: {entry.get('uid', '—')}")

    print()
    print("════════════════════════════════════════════")
    print("  AUDIT-LOG (letzte 20)")
    print("════════════════════════════════════════════")
    for entry in db.get("audit_log", [])[-20:]:
        print(f"  {entry['timestamp'][:19]}  {entry['action']}: {entry['details']}")
    print("════════════════════════════════════════════")


def main():
    parser = argparse.ArgumentParser(description="Unternehmensprofil-Manager")
    sub = parser.add_subparsers(dest="command")

    sub.add_parser("show", help="Aktuelles Profil anzeigen").set_defaults(func=cmd_show)

    p_set = sub.add_parser("set", help="Basisdaten setzen")
    p_set.add_argument("--name")
    p_set.add_argument("--street")
    p_set.add_argument("--city", help="PLZ + Ort + Land")
    p_set.add_argument("--country", choices=["AT", "DE", "CH"])
    p_set.add_argument("--email")
    p_set.add_argument("--phone")
    p_set.add_argument("--bank-owner")
    p_set.add_argument("--iban")
    p_set.add_argument("--bic")
    p_set.set_defaults(func=cmd_set)

    p_form = sub.add_parser("legal-form", help="Rechtsform ändern")
    p_form.add_argument("--form", required=True, choices=VALID_LEGAL_FORMS)
    p_form.set_defaults(func=cmd_legal_form)

    p_tax = sub.add_parser("tax-status", help="Steuerstatus setzen (mit Gültigkeitsdatum)")
    p_tax.add_argument("--status", required=True, choices=VALID_TAX_STATUSES)
    p_tax.add_argument("--from", dest="from_date", help="Gültig ab (YYYY-MM-DD)")
    p_tax.add_argument("--rate", type=float, help="Steuersatz überschreiben (z.B. 20, 19, 10, 7, 0)")
    p_tax.add_argument("--reason", help="Grund für den Wechsel")
    p_tax.set_defaults(func=cmd_tax_status)

    p_uid = sub.add_parser("uid", help="UID setzen/ändern")
    p_uid.add_argument("uid")
    p_uid.add_argument("--from", dest="from_date", help="Gültig ab (YYYY-MM-DD)")
    p_uid.set_defaults(func=cmd_uid)

    p_for = sub.add_parser("for-date", help="Steuerstatus für bestimmtes Datum abfragen")
    p_for.add_argument("date")
    p_for.set_defaults(func=cmd_for_date)

    sub.add_parser("history", help="Vollständige Historie").set_defaults(func=cmd_history)

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(1)
    args.func(args)


if __name__ == "__main__":
    main()
