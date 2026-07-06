#!/usr/bin/env python3
"""
Email Rechnungs-Checker — ruft Rechnungen von einer dedizierten Email-Adresse ab.

Verbindet sich per IMAP, sucht nach Emails mit PDF/JPG/PNG Anhängen,
extrahiert die Anhänge, und legt sie im System ab.

Unterstützt:
- IMAP (alle Provider: Gmail, Outlook, Strato, World4You, etc.)
- Anhänge: PDF, JPG, PNG, WEBP
- Filterung nach Absender, Betreff, Datum
- Automatische Weiterverarbeitung: Datei speichern + Vision-Scan + Eingangsrechnung anlegen

Usage:
    python3 email_checker.py                          # Einmalig abrufen
    python3 email_checker.py --auto-add               # Abrufen + automatisch scannen+anlegen
    python3 email_checker.py --since 2026-07-01       # Nur ab Datum
    python3 email_checker.py --mark-read              # Emails als gelesen markieren nach Download
    python3 email_checker.py --dry-run                # Nur anzeigen, nichts speichern

Env vars:
    IMAP_HOST          z.B. imap.gmail.com, imap.strato.de
    IMAP_PORT          z.B. 993 (SSL)
    IMAP_USER          Email-Adresse
    IMAP_PASSWORD      Passwort oder App-Password
    IMAP_FOLDER        Posteingang-Ordner (default: INBOX)
    INVOICE_EMAIL_FILTER  Optional: nur Emails an diese Adresse (bei Catch-All)
"""
import json
import sys
import os
import argparse
import email
import imaplib
from pathlib import Path
from datetime import datetime
from email.header import decode_header

STORAGE_DIR = Path("/opt/data/invoice-tool/incoming_files")
DB_PATH = Path("/opt/data/invoice-tool/file_registry.json")
INCOMING_DB = Path("/opt/data/invoice-tool/incoming_invoices.json")
LOG_PATH = Path("/opt/data/invoice-tool/email_checker.log")

VALID_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".webp", ".tiff"}


def log(msg):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{timestamp}] {msg}"
    print(line)
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def decode_str(s):
    if s is None:
        return ""
    decoded = decode_header(s)
    parts = []
    for content, charset in decoded:
        if isinstance(content, bytes):
            parts.append(content.decode(charset or "utf-8", errors="replace"))
        else:
            parts.append(content)
    return "".join(parts)


def save_attachment(part, filename, email_date):
    """Speichert einen Anhang im Datei-System."""
    now = datetime.now()
    year = str(now.year)
    month = f"{now.month:02d}"
    dest_dir = STORAGE_DIR / year / month
    dest_dir.mkdir(parents=True, exist_ok=True)

    date_prefix = email_date.strftime("%Y%m%d") if email_date else now.strftime("%Y%m%d")
    dest_name = f"{date_prefix}_{filename}"

    dest = dest_dir / dest_name
    counter = 1
    while dest.exists():
        stem = Path(filename).stem
        dest_name = f"{date_prefix}_{stem}_{counter}{Path(filename).suffix}"
        dest = dest_dir / dest_name
        counter += 1

    payload = part.get_payload(decode=True)
    if payload:
        dest.write_bytes(payload)
        return dest
    return None


def register_file(stored_path, original_name, invoice_number=""):
    """Registriert eine Datei im File-Registry."""
    db_path = DB_PATH
    if db_path.exists():
        db = json.loads(db_path.read_text(encoding="utf-8"))
    else:
        db = {"files": []}

    p = Path(stored_path)
    db["files"].append({
        "stored_path": str(p),
        "original_name": original_name,
        "file_type": p.suffix.lower(),
        "file_size": p.stat().st_size,
        "stored_at": datetime.now().isoformat(),
        "invoice_number": invoice_number,
        "invoice_type": "incoming",
        "source": "email",
    })
    db_path.write_text(json.dumps(db, ensure_ascii=False, indent=2), encoding="utf-8")


def parse_email_date(msg):
    date_str = msg.get("Date", "")
    try:
        from email.utils import parsedate_to_datetime
        return parsedate_to_datetime(date_str)
    except Exception:
        return None


def check_emails(args):
    host = os.environ.get("IMAP_HOST", "")
    port = int(os.environ.get("IMAP_PORT", "993"))
    user = os.environ.get("IMAP_USER", "")
    password = os.environ.get("IMAP_PASSWORD", "")
    folder = os.environ.get("IMAP_FOLDER", "INBOX")
    email_filter = os.environ.get("INVOICE_EMAIL_FILTER", "")

    if not host or not user or not password:
        log("❌ IMAP credentials not set. Set IMAP_HOST, IMAP_USER, IMAP_PASSWORD env vars.")
        sys.exit(1)

    log(f"🔗 Verbinde mit {host}:{port} als {user}...")

    try:
        mail = imaplib.IMAP4_SSL(host, port)
        mail.login(user, password)
        mail.select(folder)
        log(f"✅ Verbunden. Postfach: {folder}")
    except Exception as e:
        log(f"❌ IMAP Verbindung fehlgeschlagen: {e}")
        sys.exit(1)

    # Build search criteria
    search_criteria = "(UNSEEN)"
    if args.since:
        # IMAP date format: 01-Jul-2026
        try:
            dt = datetime.strptime(args.since, "%Y-%m-%d")
            date_str = dt.strftime("%d-%b-%Y")
            search_criteria = f'(SINCE {date_str})'
        except ValueError:
            pass

    log(f"🔍 Suche: {search_criteria}")

    try:
        status, messages = mail.search(None, search_criteria)
    except Exception as e:
        log(f"❌ Suche fehlgeschlagen: {e}")
        mail.logout()
        sys.exit(1)

    message_ids = messages[0].split()
    log(f"📬 {len(message_ids)} ungelesene Email(s) gefunden.")

    if not message_ids:
        mail.logout()
        log("✅ Keine neuen Emails.")
        return

    processed = 0
    saved_files = []

    for msg_id in message_ids:
        try:
            status, msg_data = mail.fetch(msg_id, "(RFC822)")
            if status != "OK":
                continue

            raw = msg_data[0][1]
            msg = email.message_from_bytes(raw)

            subject = decode_str(msg.get("Subject", ""))
            from_addr = decode_str(msg.get("From", ""))
            to_addr = decode_str(msg.get("To", ""))
            email_date = parse_email_date(msg)

            log(f"\n📧 Email von: {from_addr}")
            log(f"   Betreff: {subject}")
            log(f"   An: {to_addr}")
            if email_date:
                log(f"   Datum: {email_date.strftime('%d.%m.%Y')}")

            # Filter by recipient if set
            if email_filter and email_filter.lower() not in to_addr.lower():
                log(f"   ⏭️  Übersprungen (Filter: {email_filter})")
                continue

            # Extract attachments
            attachments = []
            for part in msg.walk():
                if part.get_content_maintype() == "multipart":
                    continue
                filename = part.get_filename()
                if not filename:
                    continue
                filename = decode_str(filename)
                ext = Path(filename).suffix.lower()
                if ext not in VALID_EXTENSIONS:
                    log(f"   ⏭️  Anhang ignoriert: {filename} ({ext})")
                    continue
                attachments.append((part, filename, ext))

            if not attachments:
                log(f"   ⏭️  Keine Rechnungs-Anhänge gefunden.")
                continue

            log(f"   📎 {len(attachments)} Anhang/Anhänge gefunden.")

            for part, filename, ext in attachments:
                if args.dry_run:
                    log(f"   🔍 [DRY RUN] Würde speichern: {filename}")
                    saved_files.append({"name": filename, "path": None, "subject": subject, "from": from_addr})
                    continue

                stored = save_attachment(part, filename, email_date)
                if stored:
                    register_file(stored, filename, "")
                    size_kb = stored.stat().st_size / 1024
                    type_emoji = {"pdf": "📄", ".jpg": "🖼️", ".png": "🖼️"}.get(ext, "📎")
                    log(f"   ✅ {type_emoji} Gespeichert: {stored.name} ({size_kb:.0f} KB)")
                    saved_files.append({
                        "name": filename,
                        "path": str(stored),
                        "subject": subject,
                        "from": from_addr,
                        "date": email_date.strftime("%d.%m.%Y") if email_date else "",
                    })

            # Mark as read
            if args.mark_read:
                mail.store(msg_id, "+FLAGS", "\\Seen")
                log(f"   ✉️  Als gelesen markiert.")

            processed += 1

        except Exception as e:
            log(f"   ❌ Fehler bei Email {msg_id}: {e}")
            continue

    mail.logout()

    log(f"\n════════════════════════════════════")
    log(f"✅ Fertig: {processed} Email(s) verarbeitet, {len(saved_files)} Datei(en) gespeichert.")

    if saved_files and args.auto_add:
        log(f"\n🔍 Starte Vision-Scan für {len(saved_files)} Datei(en)...")
        import subprocess
        for f in saved_files:
            if not f.get("path"):
                continue
            log(f"   Scanne {f['name']}...")
            try:
                result = subprocess.run(
                    [sys.executable, "/opt/data/invoice-tool/scripts/scan_invoice.py",
                     f["path"], "--auto-add"],
                    capture_output=True, text=True, timeout=60,
                )
                if result.returncode == 0:
                    log(f"   ✅ Gescannt und abgelegt.")
                else:
                    log(f"   ⚠️  Scan fehlgeschlagen: {result.stderr[:200]}")
            except Exception as e:
                log(f"   ⚠️  Scan-Fehler: {e}")

    # Save summary for cron delivery
    summary = {
        "timestamp": datetime.now().isoformat(),
        "emails_processed": processed,
        "files_saved": len(saved_files),
        "files": saved_files,
    }
    summary_path = Path("/opt/data/invoice-tool/email_checker_last.json")
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Email Rechnungs-Checker")
    parser.add_argument("--auto-add", action="store_true", help="Gescannte Dateien automatisch als Eingangsrechnung anlegen")
    parser.add_argument("--since", help="Nur ab Datum (YYYY-MM-DD)")
    parser.add_argument("--mark-read", action="store_true", help="Emails als gelesen markieren")
    parser.add_argument("--dry-run", action="store_true", help="Nur anzeigen, nichts speichern")
    args = parser.parse_args()

    log("════════════════════════════════════")
    log("📬 EMAIL RECHNUNGS-CHECKER")
    log("════════════════════════════════════")
    check_emails(args)


if __name__ == "__main__":
    main()
