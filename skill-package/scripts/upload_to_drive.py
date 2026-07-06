#!/usr/bin/env python3
"""Google Drive Upload — lädt PDF und JSON in einen Drive-Ordner hoch.

Usage: python3 upload_to_drive.py <file.pdf> <file.json> [--folder FOLDER_ID]
Env:   GOOGLE_APPLICATION_CREDENTIALS, DRIVE_FOLDER_ID
"""
import json, sys, argparse, os
from pathlib import Path

def main():
    parser = argparse.ArgumentParser(description="Upload invoice to Google Drive")
    parser.add_argument("files", nargs="+")
    parser.add_argument("--folder", default=os.environ.get("DRIVE_FOLDER_ID", ""))
    parser.add_argument("--credentials", default=os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", ""))
    args = parser.parse_args()
    if not args.folder:
        print("❌ Set DRIVE_FOLDER_ID or use --folder", file=sys.stderr); sys.exit(1)
    if not args.credentials or not Path(args.credentials).exists():
        print("❌ Set GOOGLE_APPLICATION_CREDENTIALS", file=sys.stderr); sys.exit(1)
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaFileUpload
    except ImportError:
        print("❌ Install: uv pip install google-api-python-client google-auth", file=sys.stderr); sys.exit(1)
    creds = service_account.Credentials.from_service_account_file(args.credentials, scopes=["https://www.googleapis.com/auth/drive.file"])
    service = build("drive", "v3", credentials=creds)
    for fp in args.files:
        p = Path(fp)
        if not p.exists(): print(f"❌ {fp}", file=sys.stderr); continue
        mime = "application/pdf" if p.suffix == ".pdf" else "application/json" if p.suffix == ".json" else "application/octet-stream"
        media = MediaFileUpload(str(p), mimetype=mime, resumable=True)
        result = service.files().create(body={"name": p.name, "parents": [args.folder]}, media_body=media, fields="id,webViewLink").execute()
        print(f"✅ {p.name} → {result.get('webViewLink', '')}")

if __name__ == "__main__":
    main()
