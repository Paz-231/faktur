#!/usr/bin/env python3
"""
Rechnungs-Scanner — extrahiert Daten aus hochgeladenen Rechnungs-Fotos/PDFs per Vision API.

Unterstützt: PDF, JPG, PNG, WEBP, TIFF, HEIC
Nutzt OpenRouter Vision API (z.B. gpt-4o, claude-3.5-sonnet)

Workflow:
    1. Foto/PDF wird im file_manager gespeichert
    2. Dieses Script sendet das Bild an die Vision API
    3. Vision API extrahiert: Rechnungsnummer, Datum, Lieferant, Beträge, Positionen
    4. Ergebnis als JSON spec → kann direkt in incoming.py importiert werden

Usage:
    python3 scan_invoice.py <file.jpg|file.pdf> [--out spec.json]
    python3 scan_invoice.py <file.jpg> --auto-add    # Scannt + speichert direkt als Eingangsrechnung

Env: BUILT_IN_FORGE_API_URL, BUILT_IN_FORGE_API_KEY, VISION_MODEL (default: openai/gpt-4o)
"""
import json
import sys
import os
import argparse
import base64
import requests
from pathlib import Path

VISION_MODEL = os.environ.get("VISION_MODEL", "openai/gpt-4o")
API_URL = os.environ.get("BUILT_IN_FORGE_API_URL", "https://openrouter.ai/api")
API_KEY = os.environ.get("BUILT_IN_FORGE_API_KEY", "")

SYSTEM_PROMPT = """You are an invoice scanner for Austrian and German invoices (Eingangsrechnungen).

Extract ALL visible data from the invoice image/PDF. Return a JSON object:

{
  "invoice_number": "RE-2026-123",
  "invoice_date": "01.07.2026",
  "delivery_date": "30.06.2026",
  "issuer": {
    "name": "Lieferant GmbH",
    "street": "Straße 1",
    "postal_city_country": "1010 Wien, Österreich",
    "uid": "ATU12345678",
    "email": "",
    "iban": "",
    "bic": ""
  },
  "items": [
    {"description": "Produkt/Dienstleistung", "qty": 1, "unit": "Stück", "unit_price": 100.00}
  ],
  "net_amount": 100.00,
  "vat_amount": 20.00,
  "gross_amount": 120.00,
  "tax_rate": 20.0,
  "payment_terms": "Zahlbar innerhalb 14 Tagen.",
  "category_guess": "Server|Software|Hardware|Beratung|Büro|Sonstiges"
}

Rules:
- Extract ONLY what is visible. Leave empty string "" if not visible.
- Parse amounts: "€ 1.234,56" → 1234.56 (float)
- Parse dates: convert to DD.MM.YYYY format
- For "brutto gleich netto" (Kleinunternehmer): vat_amount=0, tax_rate=0
- Guess category from issuer/items
- Return ONLY the JSON, no explanation.
"""


def file_to_base64(file_path):
    """Convert file to base64 data URL."""
    p = Path(file_path)
    ext = p.suffix.lower()

    mime_map = {
        ".pdf": "application/pdf",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".tiff": "image/tiff",
        ".gif": "image/gif",
    }

    mime = mime_map.get(ext, "application/octet-stream")
    data = p.read_bytes()
    b64 = base64.b64encode(data).decode("utf-8")
    return f"data:{mime};base64,{b64}"


def scan_file(file_path):
    """Send file to Vision API and extract invoice data."""
    if not API_KEY:
        print("❌ BUILT_IN_FORGE_API_KEY nicht gesetzt", file=sys.stderr)
        sys.exit(1)

    p = Path(file_path)
    if not p.exists():
        print(f"❌ Datei nicht gefunden: {p}", file=sys.stderr)
        sys.exit(1)

    ext = p.suffix.lower()
    valid = {".pdf", ".jpg", ".jpeg", ".png", ".webp", ".tiff", ".bmp", ".gif"}
    if ext not in valid:
        print(f"❌ Format nicht unterstützt: {ext}", file=sys.stderr)
        print(f"   Erlaubt: {', '.join(sorted(valid))}", file=sys.stderr)
        sys.exit(1)

    print(f"🔍 Scanne {p.name} ({p.stat().st_size / 1024:.0f} KB) mit {VISION_MODEL}...")

    data_url = file_to_base64(file_path)

    response = requests.post(
        f"{API_URL}/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": VISION_MODEL,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": [
                    {"type": "text", "text": "Extrahiere alle Rechnungsdaten aus diesem Dokument."},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ]},
            ],
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
        },
        timeout=60,
    )
    response.raise_for_status()
    content = response.json()["choices"][0]["message"]["content"]
    result = json.loads(content)
    return result


def main():
    parser = argparse.ArgumentParser(description="Rechnungs-Scanner — extrahiert Daten aus Fotos/PDFs")
    parser.add_argument("file", help="Pfad zur Rechnungsdatei (PDF, JPG, PNG, etc.)")
    parser.add_argument("--out", help="Output JSON spec path")
    parser.add_argument("--auto-add", action="store_true", help="Direkt als Eingangsrechnung speichern")
    args = parser.parse_args()

    result = scan_file(args.file)

    # Save spec
    out_path = Path(args.out) if args.out else Path(args.file).with_suffix(".json")
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✅ JSON gespeichert: {out_path}")

    # Print summary
    issuer = result.get("issuer", {})
    print(f"\n📋 Extrahiert:")
    print(f"   Rechnungsnr:  {result.get('invoice_number', '?')}")
    print(f"   Lieferant:    {issuer.get('name', '?')}")
    print(f"   Datum:        {result.get('invoice_date', '?')}")
    print(f"   Netto:        € {result.get('net_amount', 0):.2f}")
    print(f"   USt:          € {result.get('vat_amount', 0):.2f}")
    print(f"   Brutto:       € {result.get('gross_amount', 0):.2f}")
    if result.get("category_guess"):
        print(f"   Kategorie:    {result['category_guess']}")

    # Auto-add to incoming
    if args.auto_add:
        print("\n💾 Speichere als Eingangsrechnung...")
        import subprocess
        subprocess.run([
            sys.executable, "/opt/data/invoice-tool/scripts/incoming.py",
            "add-from-spec", str(out_path), "--pdf", args.file,
        ], check=True)
        print("✅ Als Eingangsrechnung gespeichert!")

    # Also store the file
    print("\n📁 Speichere Datei...")
    import subprocess
    subprocess.run([
        sys.executable, "/opt/data/invoice-tool/scripts/file_manager.py",
        "store", args.file,
        "--invoice-number", result.get("invoice_number", ""),
    ], check=True)


if __name__ == "__main__":
    main()
