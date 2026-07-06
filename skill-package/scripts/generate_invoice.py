#!/usr/bin/env python3
"""
maightyOS Rechnungs-Agent — PDF Generator
Generates AT-Honorarnote or DE-Rechnung from a JSON spec.

Usage:
    python3 generate_invoice.py <invoice.json> [--out <output.pdf>]

The JSON spec is validated for required fields before rendering.
Supports: AT (Honorarnote/Rechnung) and DE (Rechnung).
"""
import json
import sys
import argparse
from pathlib import Path
from datetime import datetime
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.pdfbase.pdfmetrics import stringWidth


# ─── Validation ──────────────────────────────────────────────────────────────

REQUIRED_FIELDS = [
    "type", "invoice_number", "invoice_date",
    "issuer.name", "issuer.street", "issuer.postal_city_country",
    "recipient.name", "recipient.street", "recipient.postal_city_country",
    "items", "payment_terms",
]

OPTIONAL_FIELDS = [
    "issuer.uid", "issuer.phone", "issuer.email",
    "issuer.bank_owner", "issuer.iban", "issuer.bic",
    "recipient.uid",
    "tax_note", "footer",
    "delivery_date", "period_start", "period_end",
]

VALID_TYPES = ["Honorarnote", "Rechnung"]
VALID_TAX_MODES = ["kleinunternehmer", "ust_standard", "ust_ermaessigt", "reverse_charge", "befreit"]

TAX_RATES = {
    "kleinunternehmer": 0.0,
    "ust_standard": 20.0,    # AT: 20%, DE: 19%
    "ust_ermaessigt": 10.0,  # AT: 10%/13%, DE: 7%
    "reverse_charge": 0.0,
    "befreit": 0.0,
}

# Override per country
TAX_RATES_DE = {
    "ust_standard": 19.0,
    "ust_ermaezigt": 7.0,
}

TAX_NOTES = {
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


def get_nested(d, path, default=None):
    keys = path.split(".")
    for k in keys:
        if isinstance(d, dict):
            d = d.get(k, default)
        else:
            return default
    return d


def validate_invoice(data):
    # Try to load issuer from business_profile before validation
    if not data.get("issuer") or not data["issuer"].get("name"):
        profile_issuer = _load_issuer_from_profile(data)
        if profile_issuer:
            data["issuer"] = profile_issuer

    errors = []
    warnings = []

    for field in REQUIRED_FIELDS:
        if get_nested(data, field) is None:
            errors.append(f"Missing required field: {field}")
    if data.get("type") and data["type"] not in VALID_TYPES:
        errors.append(f"Invalid type '{data['type']}'. Must be one of: {VALID_TYPES}")
    if not data.get("items"):
        errors.append("At least one item required")
    for i, item in enumerate(data.get("items", [])):
        if not item.get("description"):
            errors.append(f"Item {i+1}: missing description")
        if not item.get("qty") or item["qty"] <= 0:
            errors.append(f"Item {i+1}: qty must be positive")
        if not item.get("unit_price") or item["unit_price"] <= 0:
            errors.append(f"Item {i+1}: unit_price must be positive")

    # ── Steuerrechtliche Pflichtprüfung ──
    # GRUNDREGEL: Steuern werden NUR ausgewiesen wenn der Rechnungssteller eine UID hat.
    # Keine UID → keine Steuer auf der Rechnung,egal welcher Steuerstatus im Profil steht.

    # Load tax status from profile
    tax_status_info = _get_tax_status_for_date(data)
    tax_status = tax_status_info.get("status") if tax_status_info else data.get("tax_mode", "kleinunternehmer")
    is_kleinunternehmer = tax_status == "kleinunternehmer"

    # UID aus Spec oder Profil holen
    issuer_uid = get_nested(data, "issuer.uid")

    # 1. Kleinunternehmer: KEIN Steuerausweis (auch nicht mit UID)
    if is_kleinunternehmer:
        explicit_mode = data.get("tax_mode")
        if explicit_mode and explicit_mode not in ("kleinunternehmer", "befreit"):
            errors.append(
                f"STEUERRECHTLICHER KONFLIKT: Unternehmen ist Kleinunternehmer ({tax_status}), "
                f"aber tax_mode='{explicit_mode}' wurde in der Spec gesetzt. "
                f"Kleinunternehmer dürfen keine Umsatzsteuer ausweisen. "
                f"Entferne tax_mode aus der Spec oder ändere den Steuerstatus im Profil."
            )

    # 2. USt-pflichtig MIT UID → Steuerausweis erlaubt (wird in render_pdf automatisch gemacht)
    # 3. USt-pflichtig OHNE UID → KEIN Steuerausweis, Rechnung wird blockiert
    if not is_kleinunternehmer and not issuer_uid:
        errors.append(
            f"UID-PFLICHT: Unternehmen ist '{tax_status}' (nicht Kleinunternehmer). "
            f"Steuern dürfen nur ausgewiesen werden wenn eine UID-Nummer vorhanden ist. "
            f"Bitte UID im Unternehmensprofil setzen: "
            f"python3 scripts/business_profile.py uid \"ATU...\""
        )

    return errors


def resolve_country(data):
    """Detect country from issuer address or explicit field."""
    explicit = get_nested(data, "issuer.country") or get_nested(data, "country")
    if explicit:
        return explicit.upper()
    addr = get_nested(data, "issuer.postal_city_country", "")
    if "Österreich" in addr or "Austria" in addr:
        return "AT"
    if "Deutschland" in addr or "Germany" in addr:
        return "DE"
    return "AT"  # default


def resolve_tax_note(data, country):
    tax_mode = data.get("tax_mode", "kleinunternehmer")
    if tax_note := data.get("tax_note"):
        return tax_note
    if tax_mode in TAX_NOTES and country in TAX_NOTES[tax_mode]:
        return TAX_NOTES[tax_mode][country]
    if tax_mode == "ust_standard" and tax_mode not in TAX_NOTES:
        return ""
    return ""


def resolve_tax_rate(data, country):
    # If explicit tax_mode in spec, use it (backward compat)
    tax_mode = data.get("tax_mode")
    if tax_mode and tax_mode in TAX_RATES:
        if country == "DE" and tax_mode in TAX_RATES_DE:
            return TAX_RATES_DE[tax_mode]
        return TAX_RATES.get(tax_mode, 0.0)
    # Otherwise: try to load from business_profile for this date
    return _load_rate_from_profile(data, country)


def _load_rate_from_profile(data, country):
    """Load tax rate from business_profile.json based on invoice date."""
    status_info = _get_tax_status_for_date(data)
    if status_info:
        return status_info.get("rate", 0.0)
    return 0.0


def _get_tax_status_for_date(data):
    """Get the full tax status entry valid for the invoice date from business_profile."""
    profile_path = Path("/opt/data/invoice-tool/business_profile.json")
    if not profile_path.exists():
        return None
    try:
        profile = json.loads(profile_path.read_text(encoding="utf-8"))
        inv_date_str = data.get("invoice_date", "")
        if not inv_date_str:
            return None
        inv_date = _parse_invoice_date(inv_date_str)
        if not inv_date:
            return None
        history = sorted(profile.get("tax_status_history", []), key=lambda x: x["valid_from"])
        active = None
        for entry in history:
            entry_from = _parse_invoice_date(entry["valid_from"])
            if entry_from and entry_from <= inv_date:
                active = entry
            elif entry_from and entry_from > inv_date:
                break
        return active
    except Exception:
        return None


def _parse_invoice_date(date_str):
    """Parse a date string in various formats. Returns date object or None."""
    if not date_str:
        return None
    from datetime import datetime as dt
    for fmt in ["%d.%m.%Y", "%Y-%m-%d", "%d.%m.%y"]:
        try:
            return dt.strptime(date_str, fmt).date()
        except ValueError:
            continue
    return None


def _load_tax_note_from_profile(data, country):
    """Load tax note from business_profile based on invoice date."""
    profile_path = Path("/opt/data/invoice-tool/business_profile.json")
    if not profile_path.exists():
        return None
    try:
        profile = json.loads(profile_path.read_text(encoding="utf-8"))
        inv_date_str = data.get("invoice_date", "")
        if not inv_date_str:
            return None
        inv_date = None
        for fmt in ["%d.%m.%Y", "%Y-%m-%d", "%d.%m.%y"]:
            try:
                inv_date = datetime.strptime(inv_date_str, fmt).date()
                break
            except ValueError:
                continue
        if not inv_date:
            return None
        history = sorted(profile.get("tax_status_history", []), key=lambda x: x["valid_from"])
        active = None
        for entry in history:
            entry_from = None
            for fmt in ["%Y-%m-%d", "%d.%m.%Y"]:
                try:
                    entry_from = datetime.strptime(entry["valid_from"], fmt).date()
                    break
                except (ValueError, KeyError):
                    continue
            if entry_from and entry_from <= inv_date:
                active = entry
            elif entry_from and entry_from > inv_date:
                break
        if active:
            status = active.get("status", "")
            return get_tax_note_from_status(status, country)
        return None
    except Exception:
        return None


def get_tax_note_from_status(status, country):
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
    return notes.get(status, {}).get(country, "")


def _load_issuer_from_profile(data):
    """Load issuer data from business_profile if not explicitly set in spec."""
    profile_path = Path("/opt/data/invoice-tool/business_profile.json")
    if not profile_path.exists():
        return None
    try:
        profile = json.loads(profile_path.read_text(encoding="utf-8"))
        base = profile.get("base", {})
        if not base.get("name"):
            return None
        # Load UID for invoice date
        inv_date_str = data.get("invoice_date", "")
        uid = None
        if inv_date_str:
            inv_date = None
            for fmt in ["%d.%m.%Y", "%Y-%m-%d", "%d.%m.%y"]:
                try:
                    inv_date = datetime.strptime(inv_date_str, fmt).date()
                    break
                except ValueError:
                    continue
            if inv_date:
                uid_history = sorted(profile.get("uid_history", []), key=lambda x: x["valid_from"])
                for entry in uid_history:
                    entry_from = None
                    for fmt in ["%Y-%m-%d", "%d.%m.%Y"]:
                        try:
                            entry_from = datetime.strptime(entry["valid_from"], fmt).date()
                            break
                        except (ValueError, KeyError):
                            continue
                    if entry_from and entry_from <= inv_date:
                        uid = entry.get("uid")
                    elif entry_from and entry_from > inv_date:
                        break
        issuer = {
            "name": base.get("name"),
            "street": base.get("street"),
            "postal_city_country": base.get("postal_city_country"),
            "email": base.get("email"),
            "phone": base.get("phone"),
            "bank_owner": base.get("bank_owner"),
            "iban": base.get("iban"),
            "bic": base.get("bic"),
        }
        if uid:
            issuer["uid"] = uid
        return issuer
    except Exception:
        return None


# ─── PDF Rendering ────────────────────────────────────────────────────────────

def money(value):
    return f"€ {value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def draw_text(c, text, x, y, font="Helvetica", size=9.5, color=colors.black):
    c.setFillColor(color)
    c.setFont(font, size)
    c.drawString(x, y, text)


def draw_text_right(c, text, x, y, font="Helvetica", size=9.5, color=colors.black):
    c.setFillColor(color)
    c.setFont(font, size)
    c.drawRightString(x, y, text)


def section_title(c, title, x, y):
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(x, y, title)


def wrap_text(text, max_width, font="Helvetica", size=8.9):
    words = text.split()
    lines = []
    current = ""
    for word in words:
        candidate = word if not current else current + " " + word
        if stringWidth(candidate, font, size) <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines or [text]


def render_pdf(invoice, output_path):
    W, H = A4
    left = 55
    right = 55
    usable_w = W - left - right
    right_x = W - right
    right_label_x = 455
    right_value_x = right_x

    country = resolve_country(invoice)
    tax_rate = resolve_tax_rate(invoice, country)

    # Load issuer from business_profile if not explicitly set in spec
    if not invoice.get("issuer") or not invoice["issuer"].get("name"):
        profile_issuer = _load_issuer_from_profile(invoice)
        if profile_issuer:
            invoice["issuer"] = profile_issuer

    # GRUNDREGEL: Keine UID → keine Steuer. Egal was das Profil sagt.
    issuer_uid = get_nested(invoice, "issuer.uid")
    if not issuer_uid and tax_rate > 0:
        # Override: tax_rate auf 0 setzen, kein Steuerausweis ohne UID
        tax_rate = 0.0

    # Load tax note from profile if not explicitly set
    tax_note = invoice.get("tax_note")
    if not tax_note:
        tax_note = _load_tax_note_from_profile(invoice, country)
        if not tax_note:
            tax_note = resolve_tax_note(invoice, country)

    # Calculate totals
    items = invoice["items"]
    for i, item in enumerate(items):
        item.setdefault("pos", i + 1)
        item["total"] = round(item["qty"] * item["unit_price"], 2)

    net_total = round(sum(i["total"] for i in items), 2)
    vat_amount = round(net_total * tax_rate / 100, 2) if tax_rate > 0 else 0.0
    gross_total = round(net_total + vat_amount, 2)

    doc_type = invoice["type"]  # "Honorarnote" or "Rechnung"

    c = canvas.Canvas(str(output_path), pagesize=A4)
    c.setTitle(f"{doc_type} {invoice['invoice_number']}")
    c.setAuthor(invoice["issuer"]["name"])

    # ── Header ──
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(left, H - 70, doc_type.upper())
    c.setStrokeColor(colors.black)
    c.setLineWidth(0.8)
    c.line(left, H - 78, right_x, H - 78)

    # ── Issuer ──
    section_title(c, "Aussteller / Leistungsersteller", left, H - 125)
    issuer_lines = [
        invoice["issuer"]["name"],
        invoice["issuer"]["street"],
        invoice["issuer"]["postal_city_country"],
    ]
    if phone := get_nested(invoice, "issuer.phone"):
        issuer_lines.append(f"Tel. {phone}")
    if email := get_nested(invoice, "issuer.email"):
        issuer_lines.append(f"Email: {email}")
    if uid := get_nested(invoice, "issuer.uid"):
        issuer_lines.append(f"UID: {uid}")
    for i, line in enumerate(issuer_lines):
        draw_text(c, line, left, H - 143 - i * 14.5, "Helvetica", 9.2)

    # ── Invoice meta (right column) ──
    draw_text_right(c, "Rechnungsnummer:", right_label_x, H - 143, "Helvetica-Bold", 9.2)
    draw_text_right(c, invoice["invoice_number"], right_value_x, H - 143, "Helvetica", 9.2)
    draw_text_right(c, "Rechnungsdatum:", right_label_x, H - 158, "Helvetica-Bold", 9.2)
    draw_text_right(c, invoice["invoice_date"], right_value_x, H - 158, "Helvetica", 9.2)

    y_offset = H - 173
    if delivery_date := invoice.get("delivery_date"):
        draw_text_right(c, "Leistungsdatum:", right_label_x, y_offset, "Helvetica-Bold", 9.2)
        draw_text_right(c, delivery_date, right_value_x, y_offset, "Helvetica", 9.2)
        y_offset -= 15

    if period := invoice.get("period_start"):
        period_end = invoice.get("period_end", "")
        period_str = f"{period} – {period_end}" if period_end else period
        draw_text_right(c, "Leistungszeitraum:", right_label_x, y_offset, "Helvetica-Bold", 9.2)
        draw_text_right(c, period_str, right_value_x, y_offset, "Helvetica", 9.2)
        y_offset -= 15

    # ── Recipient ──
    recip_y = y_offset - 40
    section_title(c, "Leistungsempfänger", left, recip_y)
    recipient_lines = [
        invoice["recipient"]["name"],
        invoice["recipient"]["street"],
        invoice["recipient"]["postal_city_country"],
    ]
    if uid := get_nested(invoice, "recipient.uid"):
        recipient_lines.append(f"UID-Nummer: {uid}")
    for i, line in enumerate(recipient_lines):
        draw_text(c, line, left, recip_y - 13 - i * 15, "Helvetica", 9.2)

    # ── Positions table ──
    table_y = recip_y - 100
    table_x = left
    table_w = usable_w
    pos_w = 35
    desc_w = 185
    qty_w = 52
    unit_w = 80
    price_w = 70
    total_w = table_w - pos_w - desc_w - qty_w - unit_w - price_w
    row_h = 34
    header_h = 24
    n_rows = len(items)
    table_font = "Helvetica"
    table_size = 8.9
    desc_max_width = desc_w - 16

    # Header background
    c.setFillColor(colors.HexColor("#333333"))
    c.rect(table_x, table_y, table_w, header_h, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 8.0)
    headers = [
        ("Pos.", table_x + pos_w / 2),
        ("Bezeichnung", table_x + pos_w + desc_w / 2),
        ("Menge", table_x + pos_w + desc_w + qty_w / 2),
        ("Einheit", table_x + pos_w + desc_w + qty_w + unit_w / 2),
        ("Preis/Einh.", table_x + pos_w + desc_w + qty_w + unit_w + price_w / 2),
        ("Gesamt", table_x + pos_w + desc_w + qty_w + unit_w + price_w + total_w / 2),
    ]
    header_baseline = table_y + header_h / 2 + 8.0 * 0.35
    for label, x in headers:
        c.drawCentredString(x, header_baseline, label)

    # Grid
    c.setStrokeColor(colors.HexColor("#999999"))
    c.setLineWidth(0.35)
    grid_y = table_y - header_h - row_h * n_rows
    c.rect(table_x, grid_y, table_w, header_h + row_h * n_rows, fill=0, stroke=1)
    for i in range(1, n_rows):
        y = table_y - header_h - i * row_h
        c.line(table_x, y, table_x + table_w, y)
    for x in [
        table_x + pos_w,
        table_x + pos_w + desc_w,
        table_x + pos_w + desc_w + qty_w,
        table_x + pos_w + desc_w + qty_w + unit_w,
        table_x + pos_w + desc_w + qty_w + unit_w + price_w,
    ]:
        c.line(x, grid_y, x, table_y)

    # Rows
    for i, item in enumerate(items):
        y = table_y - header_h - (i + 1) * row_h
        c.setFillColor(colors.black)
        c.setFont(table_font, table_size)
        row_mid = y + row_h / 2

        c.drawCentredString(table_x + pos_w / 2, row_mid, str(item["pos"]))

        desc_lines = wrap_text(item["description"], desc_max_width, table_font, table_size)
        line_gap = 12
        first_desc_baseline = row_mid + (len(desc_lines) - 1) * line_gap / 2
        for j, line in enumerate(desc_lines):
            c.drawString(table_x + pos_w + 8, first_desc_baseline - j * line_gap, line)

        qty_x = table_x + pos_w + desc_w + 8
        unit_x = table_x + pos_w + desc_w + qty_w + 8
        price_x = table_x + pos_w + desc_w + qty_w + unit_w + price_w - 8
        total_x = table_x + table_w - 8

        c.drawString(qty_x, row_mid, str(int(item["qty"])))
        c.drawString(unit_x, row_mid, item.get("unit", ""))
        c.drawRightString(price_x, row_mid, money(item["unit_price"]))
        c.drawRightString(total_x, row_mid, money(item["total"]))

    # ── Totals ──
    total_top = grid_y - 28
    total_label_x = right_x - 150
    total_value_x = right_x
    totals = [
        ("Gesamt netto", money(net_total), False),
    ]
    if tax_rate > 0:
        totals.append((f"Umsatzsteuer ({tax_rate:.0f}%)", money(vat_amount), False))
    totals.append(("Gesamtbetrag", money(gross_total), True))

    for i, (label, value, bold) in enumerate(totals):
        y = total_top - i * 18
        font = "Helvetica-Bold" if bold else "Helvetica"
        size = 11 if bold else 9.2
        c.setFillColor(colors.black)
        c.setFont(font, size)
        c.drawRightString(total_label_x, y, label)
        c.drawRightString(total_value_x, y, value)

    # ── Tax note ──
    note_y = total_top - len(totals) * 18 - 35
    if tax_note:
        draw_text(c, tax_note, left, note_y, "Helvetica", 8.9, colors.black)

    # ── Payment terms ──
    pay_y = note_y - 25 if tax_note else note_y - 5
    section_title(c, "Zahlungsbedingungen", left, pay_y)
    draw_text(c, invoice["payment_terms"], left, pay_y - 18, "Helvetica", 9.2)

    # ── Bank details ──
    bank_y = pay_y - 50
    if get_nested(invoice, "issuer.iban"):
        section_title(c, "Bankverbindung", left, bank_y)
        bank_lines = []
        if owner := get_nested(invoice, "issuer.bank_owner"):
            bank_lines.append(("Inhaber:", owner))
        bank_lines.append(("IBAN:", invoice["issuer"]["iban"]))
        if bic := get_nested(invoice, "issuer.bic"):
            bank_lines.append(("BIC:", bic))
        for i, (label, value) in enumerate(bank_lines):
            y = bank_y - 18 - i * 15
            draw_text(c, label, left, y, "Helvetica-Bold", 9.2)
            draw_text(c, value, 150, y, "Helvetica", 9.2)
        footer_y = bank_y - len(bank_lines) * 15 - 25
    else:
        footer_y = bank_y - 25

    # ── Footer note ──
    footer = invoice.get("footer", "Diese Rechnung wurde elektronisch erstellt und ist ohne Unterschrift gültig.")
    section_title(c, "Hinweis", left, footer_y)
    draw_text(c, footer, left, footer_y - 18, "Helvetica", 8.9)

    c.showPage()
    c.save()

    return gross_total, net_total, vat_amount


# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Generate AT/DE invoice PDF from JSON spec")
    parser.add_argument("spec", help="Path to invoice JSON file")
    parser.add_argument("--out", help="Output PDF path (default: same dir as spec)")
    args = parser.parse_args()

    spec_path = Path(args.spec)
    if not spec_path.exists():
        print(f"❌ Spec file not found: {spec_path}", file=sys.stderr)
        sys.exit(1)

    with open(spec_path, "r", encoding="utf-8") as f:
        invoice = json.load(f)

    errors = validate_invoice(invoice)
    if errors:
        print("❌ Validation errors:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        sys.exit(1)

    output_path = Path(args.out) if args.out else spec_path.with_suffix(".pdf")

    gross, net, vat = render_pdf(invoice, output_path)

    # Also save a enriched JSON with computed values
    enriched = {**invoice}
    enriched["net_total"] = net
    enriched["vat_amount"] = vat
    enriched["gross_total"] = gross
    enriched_path = output_path.with_suffix(".json")
    enriched_path.write_text(json.dumps(enriched, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"✅ PDF: {output_path}")
    print(f"✅ JSON: {enriched_path}")
    print(f"   Gesamt netto: {money(net)}")
    if vat > 0:
        print(f"   USt: {money(vat)}")
    print(f"   Gesamtbetrag: {money(gross)}")


if __name__ == "__main__":
    main()
