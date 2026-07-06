# Faktox Invoice Agent — AI Rechnungs-Assistent Skill

> Komplettes Rechnungs-System als Skill für Claude Code, Cursor, und andere AI-Coding-Assistenten. DACH-konform (AT + DE), mit AI Foto-Scan, Mahnwesen, Buchhaltungs-Report und lückenlosem Nummernkreis.

## Was ist dieser Skill?

Faktox Invoice Agent ist ein **procedural Skill** der deinem AI-Assistenten (Claude Code, Cursor, etc.) das Wissen eines Steuerberaters + Buchhalters gibt. Der Skill enthält 13 Python-Scripts die zusammen ein komplettes Rechnungsmanagement-System bilden.

## Vorteile

| Vorteil | Beschreibung |
|---|---|
| **DACH-konform** | AT-Honorarnoten (§6 Abs1 Z27 UStG) + DE-Rechnungen (§19 UStG). Kleinunternehmer-Logik automatisch. |
| **AI Foto-Scan** | Rechnungsfoto hochladen → Vision API extrahiert alle Daten automatisch. |
| **Lückenloser Nummernkreis** | Atomare Vergabe, nie Lücken, nie doppelt. Storno-Rechnungen bekommen eigene Nummer. |
| **Steuerstatus-Wechsel** | Vom Kleinunternehmer zur USt-Pflicht — System erkennt das Datum und wendet den korrekten Steuersatz an. |
| **UID-Pflicht-Prüfung** | USt-pflichtig ohne UID? Rechnung wird blockiert. Kein Steuerausweis ohne UID. |
| **Mahnwesen** | 3-stufig: Zahlungserinnerung, 1. Mahnung, 2. Mahnung. Automatisch generiert. |
| **Buchhaltungs-Report** | EÜR nach §4 Abs3 EStG, USt-Voranmeldung, DATEV-Export. Monatlich + jährlich. |
| **Eingangsrechnungen** | Lieferanten-Rechnungen verwalten, als bezahlt markieren, Buchhaltungs-Export. |
| **Audit-Trail** | Jede Aktion wird geloggt. Vollständiger Audit-Trail für das Finanzamt. |

## Installation

### 1. Skill installieren

```bash
# Für Claude Code:
cp -r faktox-invoice-agent/ ~/.claude/skills/

# Für Cursor:
cp -r faktox-invoice-agent/ ~/.cursor/skills/

# Für Hermes Agent:
cp -r faktox-invoice-agent/ ~/skills/finance/
```

### 2. Python Environment

```bash
python3 -m venv invoice-venv
source invoice-venv/bin/activate
pip install reportlab google-api-python-client google-auth google-auth-httplib2
```

### 3. Environment Variables (optional)

```bash
export BUILT_IN_FORGE_API_KEY="sk-or-..."  # OpenRouter für Vision-Scan
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"  # Google Drive
```

## Verwendung

### Rechnung erstellen

```
User: "Rechnung an Herbert Thaler für 5 Stunden Beratung à 120 Euro"

AI: 
1. Parse den Text → Invoice-JSON
2. Prüfe Pflichtfelder → frage nach falls fehlend
3. Hole Rechnungsnummer: RE-2026-000001
4. Lade Steuerstatus aus Profil: Kleinunternehmer (0% USt)
5. Generiere PDF: Rechnung_RE-2026-000001.pdf
6. Registriere im Mahnwesen
7. Zeige Zusammenfassung
```

### Foto hochladen

```
User: [lädt Foto einer Eingangsrechnung hoch]

AI:
1. Speichere Datei: incoming_files/2026/07/20260705_rechnung.pdf
2. Sende an Vision API → extrahiere: Rechnungsnummer, Datum, Lieferant, Beträge
3. Lege Eingangsrechnung an
4. Zeige Zusammenfassung zur Bestätigung
```

### Buchhaltungs-Report

```
User: "Generiere den monatlichen Report für Juli 2026"

AI:
1. Sammle alle Ausgangs- + Eingangsrechnungen
2. Berechne EÜR (Einnahmen - Ausgaben)
3. Berechne USt-Saldo (USt erhalten - Vorsteuer)
4. Generiere PDF: Report_2026-07.pdf
5. Generiere CSV: Report_2026-07.csv (DATEV-kompatibel)
```

## Scripts

| Script | Funktion |
|---|---|
| `generate_invoice.py` | PDF-Generierung (AT + DE, mit Steuerlogik) |
| `business_profile.py` | Unternehmensprofil + Steuerstatus-Verlauf |
| `number_manager.py` | Lückenloser Nummernkreis + Storno |
| `incoming.py` | Eingangsrechnungen verwalten |
| `file_manager.py` | Datei-Speicher für PDFs/Fotos |
| `scan_invoice.py` | Vision-Scanner (Foto/PDF → Daten) |
| `email_checker.py` | Email-Abholung per IMAP |
| `customers.py` | Kundenstamm |
| `parse_input.py` | Voice/Text → JSON via LLM |
| `upload_to_drive.py` | Google Drive Upload |
| `mahnwesen.py` | Mahnwesen (3 Stufen) |
| `export_csv.py` | DATEV/CSV Export |
| `report_generator.py` | Buchhaltungs-Report (EÜR, UStVA) |

## Output

- **PDF-Rechnungen**: Professionell formatiert, DACH-konform, mit allen Pflichtangaben
- **PDF-Reports**: EÜR, USt-Zusammenfassung, Offene Posten, Jahresbericht
- **CSV-Exporte**: DATEV-kompatibel, semicolon-delimited, UTF-8-BOM
- **JSON-Datenbanken**: customers.json, invoices.json, incoming_invoices.json
- **Audit-Log**: Jede Aktion geloggt mit Timestamp

## System Requirements

- Python 3.10+
- AI-Assistent (Claude Code, Cursor, Hermes Agent, oder ähnlich)
- Optional: OpenRouter API Key (für Vision-Scan)
- Optional: Google Service Account (für Drive Upload)

## Lizenz

Einzelplatz-Lizenz. Der Skill darf auf einem Rechner verwendet werden.
Nicht weiterverkaufen oder weitergeben.

© 2026 maighty Labs — faktox.online
