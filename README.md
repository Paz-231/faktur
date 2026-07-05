# Faktox — DACH Rechnungs-SaaS mit KI

Standalone Rechnungs-SaaS mit KI für Solo-Selbständige in DACH.
AT-Honorarnoten + DE-Rechnungen, Foto-Scan, Buchhaltungs-Report.

**Domain:** faktox.online

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Backend**: Convex (reactive DB + file storage + functions)
- **Auth**: Magic-Link (eigene Implementation)
- **Payment**: Stripe Subscriptions
- **AI**: OpenRouter Vision API (Foto/PDF → Rechnungsdaten)

## Setup

```bash
# 1. Dependencies
npm install

# 2. Convex initialisieren (braucht convex.dev Account)
npx convex dev

# 3. Dev server
npm run dev
```

## Pricing

- Free: 0€/Monat — 3 Rechnungen, 3 Aufträge, Kundenstamm
- Starter: 14,90€/Monat — Unlimited, AI Foto-Scan, Mahnwesen, Eingang, monatlicher Report
- Pro: 29,90€/Monat — + Email-Abholung, EÜR, UStVA, DATEV-Export, Jahresbericht

## 10k-Mathe

10.000€ ÷ 14,90€ = 671 zahlende User. DACH hat ~4M Solo-Selbständige.
