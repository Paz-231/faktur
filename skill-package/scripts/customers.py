#!/usr/bin/env python3
"""Kundenstamm — manage recurring invoice recipients.

Usage:
    python3 customers.py add <name> --street "..." --city "..." [--uid ...] [--email ...]
    python3 customers.py find <name>
    python3 customers.py list
    python3 customers.py update <name> --street "..." --city "..." [--uid ...] [--email ...]
    python3 customers.py remove <name>
"""
import json, sys, argparse
from pathlib import Path
from datetime import datetime

DB_PATH = Path("/opt/data/invoice-tool/customers.json")

def load_db():
    return json.loads(DB_PATH.read_text(encoding="utf-8")) if DB_PATH.exists() else {"customers": []}

def save_db(db):
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    DB_PATH.write_text(json.dumps(db, ensure_ascii=False, indent=2), encoding="utf-8")

def find_customer(name):
    db = load_db()
    nl = name.lower()
    for c in db["customers"]:
        if c["name"].lower() == nl: return c
    matches = [c for c in db["customers"] if nl in c["name"].lower()]
    return matches[0] if len(matches) == 1 else None

def cmd_add(args):
    db = load_db()
    if find_customer(args.name): print(f"❌ '{args.name}' exists. Use 'update'.", file=sys.stderr); sys.exit(1)
    c = {"name": args.name, "street": args.street or "", "postal_city_country": args.city or "", "uid": args.uid or "", "email": args.email or "", "created_at": datetime.now().isoformat()}
    db["customers"].append(c); save_db(db)
    print(f"✅ Added: {args.name}"); print(json.dumps(c, ensure_ascii=False, indent=2))

def cmd_find(args):
    c = find_customer(args.name)
    print(json.dumps(c, ensure_ascii=False, indent=2)) if c else (print(f"❌ '{args.name}' not found", file=sys.stderr), sys.exit(1))

def cmd_list(args):
    db = load_db()
    if not db["customers"]: print("No customers yet."); return
    for c in db["customers"]: print(f"  {c['name']} — {c.get('street', '?')}, {c.get('postal_city_country', '?')} UID: {c.get('uid', '-')}")

def cmd_update(args):
    db = load_db(); c = find_customer(args.name)
    if not c: print(f"❌ '{args.name}' not found", file=sys.stderr); sys.exit(1)
    if args.street: c["street"] = args.street
    if args.city: c["postal_city_country"] = args.city
    if args.uid is not None: c["uid"] = args.uid
    if args.email is not None: c["email"] = args.email
    c["updated_at"] = datetime.now().isoformat(); save_db(db)
    print(f"✅ Updated: {args.name}"); print(json.dumps(c, ensure_ascii=False, indent=2))

def cmd_remove(args):
    db = load_db(); before = len(db["customers"])
    db["customers"] = [c for c in db["customers"] if c["name"].lower() != args.name.lower()]
    if len(db["customers"]) == before: print(f"❌ '{args.name}' not found", file=sys.stderr); sys.exit(1)
    save_db(db); print(f"✅ Removed: {args.name}")

def main():
    parser = argparse.ArgumentParser(description="Kundenstamm")
    sub = parser.add_subparsers(dest="command")
    p = sub.add_parser("add"); p.add_argument("name"); p.add_argument("--street"); p.add_argument("--city"); p.add_argument("--uid"); p.add_argument("--email"); p.set_defaults(func=cmd_add)
    p = sub.add_parser("find"); p.add_argument("name"); p.set_defaults(func=cmd_find)
    sub.add_parser("list").set_defaults(func=cmd_list)
    p = sub.add_parser("update"); p.add_argument("name"); p.add_argument("--street"); p.add_argument("--city"); p.add_argument("--uid"); p.add_argument("--email"); p.set_defaults(func=cmd_update)
    p = sub.add_parser("remove"); p.add_argument("name"); p.set_defaults(func=cmd_remove)
    args = parser.parse_args()
    if not args.command: parser.print_help(); sys.exit(1)
    args.func(args)

if __name__ == "__main__":
    main()
