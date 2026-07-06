#!/usr/bin/env python3
"""Parse unstructured text into invoice JSON via LLM.

Usage: python3 parse_input.py "Rechnung an Herbert für 5 Stunden à 120€" [--out spec.json]
Env:   BUILT_IN_FORGE_API_URL, BUILT_IN_FORGE_API_KEY, LLM_MODEL (default: anthropic/claude-3.5-sonnet)
"""
import json, sys, os, argparse, requests

SYSTEM_PROMPT = """You are an invoice data extractor for AT/DE invoices. Extract structured data from unstructured text. Return JSON with: type, invoice_number, invoice_date, country (AT/DE), tax_mode, issuer{name,street,postal_city_country,uid,phone,email,bank_owner,iban,bic}, recipient{name,street,postal_city_country,uid}, items[{description,qty,unit,unit_price}], delivery_date, period_start, period_end, payment_terms, footer. Only fill fields >95% confident. Never guess UID/IBAN/BIC. Return ONLY JSON."""

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("text"); parser.add_argument("--out")
    args = parser.parse_args()
    key = os.environ.get("BUILT_IN_FORGE_API_KEY", "")
    if not key: print("❌ Set BUILT_IN_FORGE_API_KEY", file=sys.stderr); sys.exit(1)
    url = os.environ.get("BUILT_IN_FORGE_API_URL", "https://openrouter.ai/api")
    r = requests.post(f"{url}/v1/chat/completions", headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"}, json={"model": os.environ.get("LLM_MODEL", "anthropic/claude-3.5-sonnet"), "messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": args.text}], "temperature": 0.1, "response_format": {"type": "json_object"}}, timeout=30)
    r.raise_for_status()
    result = json.loads(r.json()["choices"][0]["message"]["content"])
    if args.out:
        from pathlib import Path; Path(args.out).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"✅ Spec saved: {args.out}")
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
