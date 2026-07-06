#!/usr/bin/env python3
"""
Datei-Manager — speichert hochgeladene Rechnungs-PDFs und Fotos strukturiert ab.

Legt Dateien ab in: /opt/data/invoice-tool/incoming_files/{YYYY}/{MM}/
Dateiname: {YYYYMMDD}_{original_name}

Usage:
    python3 file_manager.py store <file.pdf> [--invoice-number "RE-2026-071"]
    python3 file_manager.py list [--year 2026]
    python3 file_manager.py find <invoice_number>
    python3 file_manager.py attach <invoice_number> <file.pdf>
"""
import json
import sys
import argparse
import shutil
from pathlib import Path
from datetime import datetime

STORAGE_DIR = Path("/opt/data/invoice-tool/incoming_files")
DB_PATH = Path("/opt/data/invoice-tool/file_registry.json")

VALID_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".webp", ".heic", ".tiff", ".bmp", ".gif"}


def load_db():
    if DB_PATH.exists():
        return json.loads(DB_PATH.read_text(encoding="utf-8"))
    return {"files": []}


def save_db(db):
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    DB_PATH.write_text(json.dumps(db, ensure_ascii=False, indent=2), encoding="utf-8")


def cmd_store(args):
    src = Path(args.file)
    if not src.exists():
        print(f"❌ Datei nicht gefunden: {src}", file=sys.stderr)
        sys.exit(1)

    if src.suffix.lower() not in VALID_EXTENSIONS:
        print(f"❌ Format nicht unterstützt: {src.suffix}", file=sys.stderr)
        print(f"   Erlaubt: {', '.join(sorted(VALID_EXTENSIONS))}", file=sys.stderr)
        sys.exit(1)

    # Build storage path: incoming_files/{YYYY}/{MM}/
    now = datetime.now()
    year = str(now.year)
    month = f"{now.month:02d}"
    dest_dir = STORAGE_DIR / year / month
    dest_dir.mkdir(parents=True, exist_ok=True)

    # Filename: {YYYYMMDD}_{original_name}
    date_prefix = now.strftime("%Y%m%d")
    dest_name = f"{date_prefix}_{src.name}"
    dest = dest_dir / dest_name

    # Handle duplicate names
    counter = 1
    while dest.exists():
        stem = src.stem
        dest_name = f"{date_prefix}_{stem}_{counter}{src.suffix}"
        dest = dest_dir / dest_name
        counter += 1

    # Copy file
    shutil.copy2(str(src), str(dest))

    # Register in DB
    db = load_db()
    record = {
        "stored_path": str(dest),
        "original_name": src.name,
        "file_type": src.suffix.lower(),
        "file_size": dest.stat().st_size,
        "stored_at": now.isoformat(),
        "invoice_number": args.invoice_number or "",
        "invoice_type": "incoming",
    }
    db["files"].append(record)
    save_db(db)

    size_kb = dest.stat().st_size / 1024
    print(f"✅ Datei gespeichert: {dest}")
    print(f"   Original:    {src.name}")
    print(f"   Format:      {src.suffix.lower()}")
    print(f"   Größe:       {size_kb:.1f} KB")
    if args.invoice_number:
        print(f"   Rechnung:    {args.invoice_number}")


def cmd_list(args):
    db = load_db()
    files = db.get("files", [])
    if args.year:
        files = [f for f in files if f"incoming_files/{args.year}/" in f.get("stored_path", "")]
    if not files:
        print("Keine Dateien gespeichert.")
        return
    type_emoji = {".pdf": "📄", ".jpg": "🖼️", ".jpeg": "🖼️", ".png": "🖼️", ".webp": "🖼️"}
    for f in sorted(files, key=lambda x: x.get("stored_at", ""), reverse=True):
        emoji = type_emoji.get(f.get("file_type", ""), "📎")
        inv = f" — {f['invoice_number']}" if f.get("invoice_number") else ""
        size = f.get("file_size", 0) / 1024
        print(f"  {emoji} {Path(f['stored_path']).name} ({size:.0f} KB){inv}")


def cmd_find(args):
    db = load_db()
    matches = [f for f in db["files"] if args.invoice_number.lower() in (f.get("invoice_number") or "").lower()]
    if not matches:
        print(f"Keine Dateien für Rechnung '{args.invoice_number}' gefunden.")
        return
    for f in matches:
        print(json.dumps(f, ensure_ascii=False, indent=2))


def cmd_attach(args):
    """Bestehende Datei mit einer Eingangsrechnung verknüpfen."""
    src = Path(args.file)
    if not src.exists():
        print(f"❌ Datei nicht gefunden: {src}", file=sys.stderr)
        sys.exit(1)

    db = load_db()

    # Check if file already stored
    existing = None
    for f in db["files"]:
        if Path(f["stored_path"]).name == src.name or f["original_name"] == src.name:
            existing = f
            break

    if existing:
        existing["invoice_number"] = args.invoice_number
        save_db(db)
        print(f"✅ Verknüpft: {existing['original_name']} → {args.invoice_number}")
    else:
        # Store + attach
        args.invoice_number = args.invoice_number
        cmd_store(args)


def main():
    parser = argparse.ArgumentParser(description="Datei-Manager — speichert Rechnungs-PDFs und Fotos")
    sub = parser.add_subparsers(dest="command")

    p_store = sub.add_parser("store", help="Datei speichern")
    p_store.add_argument("file", help="Pfad zur Datei")
    p_store.add_argument("--invoice-number", help="Rechnungsnummer zum Verknüpfen")
    p_store.set_defaults(func=cmd_store)

    p_list = sub.add_parser("list", help="Gespeicherte Dateien auflisten")
    p_list.add_argument("--year", type=int)
    p_list.set_defaults(func=cmd_list)

    p_find = sub.add_parser("find", help="Datei für Rechnung finden")
    p_find.add_argument("invoice_number")
    p_find.set_defaults(func=cmd_find)

    p_attach = sub.add_parser("attach", help="Datei mit Rechnung verknüpfen")
    p_attach.add_argument("invoice_number")
    p_attach.add_argument("file")
    p_attach.set_defaults(func=cmd_attach)

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(1)
    args.func(args)


if __name__ == "__main__":
    main()
