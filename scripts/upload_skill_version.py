#!/usr/bin/env python3
"""
Skill Version Upload — lädt eine neue Skill-Version in Convex Storage hoch.

Usage:
    export CONVEX_URL=https://quick-ox-60.eu-west-1.convex.cloud
    export ADMIN_KEY=your-admin-key
    python3 upload_skill_version.py faktox-invoice-agent-1.1.0.zip 1.1.0 "Bug fixes + new features"

Flow:
1. Generate upload URL (needs ADMIN_KEY)
2. POST file to Convex Storage
3. Register version in skillVersions table
4. Previous versions automatically marked as not-latest
"""
import os
import sys
import hashlib
import requests

def main():
    if len(sys.argv) < 4:
        print("Usage: python3 upload_skill_version.py <zip-file> <version> <description> [release-notes]")
        print("Example: python3 upload_skill_version.py faktox-invoice-agent-1.1.0.zip 1.1.0 'Bug fixes' 'Fixed Storno logic'")
        sys.exit(1)

    zip_path = sys.argv[1]
    version = sys.argv[2]
    description = sys.argv[3]
    release_notes = sys.argv[4] if len(sys.argv) > 4 else None

    convex_url = os.environ.get("CONVEX_URL", "https://quick-ox-60.eu-west-1.convex.cloud")
    admin_key = os.environ.get("ADMIN_KEY", "")

    if not admin_key:
        print("❌ ADMIN_KEY not set")
        sys.exit(1)

    if not os.path.exists(zip_path):
        print(f"❌ File not found: {zip_path}")
        sys.exit(1)

    file_size = os.path.getsize(zip_path)
    file_name = os.path.basename(zip_path)

    # Calculate SHA-256 checksum
    with open(zip_path, "rb") as f:
        checksum = hashlib.sha256(f.read()).hexdigest()

    print(f"📦 Uploading {file_name} ({file_size} bytes, SHA-256: {checksum[:16]}...)")

    # Step 1: Generate upload URL
    print("1. Getting upload URL...")
    resp = requests.post(
        f"{convex_url}/api/mutation",
        headers={"Content-Type": "application/json"},
        json={
            "path": "skillVersions:generateUploadUrl",
            "args": {"adminKey": admin_key},
        },
    )
    data = resp.json()
    if "error" in data:
        print(f"❌ {data['error']}")
        sys.exit(1)

    upload_url = data.get("value")
    if not upload_url:
        print(f"❌ No upload URL received: {data}")
        sys.exit(1)

    # Step 2: Upload file to Convex Storage
    print("2. Uploading file to Convex Storage...")
    with open(zip_path, "rb") as f:
        resp = requests.post(upload_url, data=f, headers={"Content-Type": "application/zip"})
    # The storageId is in the response header or body
    storage_id = resp.json().get("storageId") if resp.headers.get("content-type", "").startswith("application/json") else None

    if not storage_id:
        # Try getting it from the upload response differently
        # Convex returns the storageId in the response
        storage_id = resp.text.strip('"').strip("'")

    if not storage_id:
        print(f"❌ No storageId received. Response: {resp.status_code} {resp.text[:200]}")
        sys.exit(1)

    print(f"   Storage ID: {storage_id}")

    # Step 3: Register version
    print("3. Registering version...")
    resp = requests.post(
        f"{convex_url}/api/mutation",
        headers={"Content-Type": "application/json"},
        json={
            "path": "skillVersions:publishVersion",
            "args": {
                "adminKey": admin_key,
                "version": version,
                "description": description,
                "storageId": storage_id,
                "fileName": file_name,
                "sizeBytes": file_size,
                "checksum": checksum,
                "releaseNotes": release_notes,
            },
        },
    )
    data = resp.json()
    if "error" in data:
        print(f"❌ {data['error']}")
        sys.exit(1)

    print(f"✅ Version {version} published!")
    print(f"   File: {file_name}")
    print(f"   Size: {file_size} bytes")
    print(f"   SHA-256: {checksum}")
    print(f"   Previous versions marked as not-latest")
    print(f"   Customers can now download v{version} from faktox.online")

if __name__ == "__main__":
    main()
