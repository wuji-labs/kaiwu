#!/usr/bin/env python3
"""Live acceptance verification for Kaiwu Mobile 0.2.24 (iOS + Android)."""

import hashlib
import os
import plistlib
import re
import subprocess
import sys
import zipfile

print("=====================================================")
print("=== KAIWU MOBILE 0.2.24 LIVE ACCEPTANCE TEST SUITE ===")
print("=====================================================")

needle = "无极开物由 WUJI Labs 出品，通信默认端到端加密，账号可在你的其他设备上恢复。"

# 1. Download and verify iOS IPA
ios_url = "https://kaiwu.chengqiyun.com/download/ios"
ios_dest = "/tmp/live-downloaded.ipa"
print(f"\n[1/2] Downloading and Verifying iOS IPA: {ios_url}")
subprocess.run(
    [
        "curl",
        "-f",
        "-s",
        "-S",
        "-L",
        "--resolve",
        "kaiwu.chengqiyun.com:443:127.0.0.1",
        ios_url,
        "-o",
        ios_dest,
    ],
    check=True,
)

ios_bytes = open(ios_dest, "rb").read()
ios_sha = hashlib.sha256(ios_bytes).hexdigest().lower()
print(f"  Downloaded Size: {len(ios_bytes)} bytes")
print(f"  SHA256: {ios_sha}")

with zipfile.ZipFile(ios_dest, "r") as zf:
    plist_data = zf.read("Payload/app.app/Info.plist")
    plist = plistlib.loads(plist_data)
    ios_short_version = plist.get("CFBundleShortVersionString")
    ios_build_number = plist.get("CFBundleVersion")
    ios_bundle_id = plist.get("CFBundleIdentifier")
    ios_display_name = plist.get("CFBundleDisplayName")
    print("  Info.plist:")
    print(f"    CFBundleDisplayName: {ios_display_name}")
    print(f"    CFBundleIdentifier: {ios_bundle_id}")
    print(f"    CFBundleShortVersionString: {ios_short_version}")
    print(f"    CFBundleVersion: {ios_build_number}")

    ios_bundle = zf.read("Payload/app.app/main.jsbundle")
    ios_has_text = (
        needle.encode("utf-8") in ios_bundle
        or needle.encode("utf-16le") in ios_bundle
        or needle.encode("utf-16be") in ios_bundle
    )
    print(f"  Footer Copy Present in main.jsbundle: {ios_has_text}")

# 2. Download and verify Android APK
android_url = "https://kaiwu.chengqiyun.com/download/android"
android_dest = "/tmp/live-downloaded.apk"
print(f"\n[2/2] Downloading and Verifying Android APK: {android_url}")
subprocess.run(
    [
        "curl",
        "-f",
        "-s",
        "-S",
        "-L",
        "--resolve",
        "kaiwu.chengqiyun.com:443:127.0.0.1",
        android_url,
        "-o",
        android_dest,
    ],
    check=True,
)

android_sha = hashlib.sha256()
with open(android_dest, "rb") as f:
    while chunk := f.read(1024 * 1024):
        android_sha.update(chunk)
android_sha_str = android_sha.hexdigest().lower()
print(f"  Downloaded Size: {os.path.getsize(android_dest)} bytes")
print(f"  SHA256: {android_sha_str}")

# aapt dump badging
aapt_out = subprocess.check_output(["aapt", "dump", "badging", android_dest], text=True)
package_lines = [l for l in aapt_out.splitlines() if l.startswith("package:")]
package_line = package_lines[0]
print(f"  aapt badging: {package_line}")
m_vn = re.search(r"versionName='([^']+)'", package_line)
m_vc = re.search(r"versionCode='([^']+)'", package_line)
android_version_name = m_vn.group(1) if m_vn else None
android_version_code = m_vc.group(1) if m_vc else None
print(f"    versionName: {android_version_name}")
print(f"    versionCode: {android_version_code}")

# apksigner verify
apksigner_out = subprocess.check_output(
    ["apksigner", "verify", "--verbose", "--print-certs", android_dest], text=True
)
cert_sha1_matches = re.findall(
    r"Signer #1 certificate SHA-1 digest:\s*([0-9a-fA-F:]+)", apksigner_out
)
android_cert_sha1 = cert_sha1_matches[0].lower() if cert_sha1_matches else None
print(f"  apksigner cert SHA-1: {android_cert_sha1}")

expected_cert_sha1 = "05:04:37:03:33:ae:86:1f:e1:9e:1e:ec:c0:15:04:f3:ba:99:8b:41"
norm_expected = expected_cert_sha1.replace(":", "").lower()
norm_actual = (android_cert_sha1 or "").replace(":", "").lower()
cert_matches = (norm_actual == norm_expected)
print(f"  Signing Certificate Match Expected: {cert_matches} (actual={android_cert_sha1})")

with zipfile.ZipFile(android_dest, "r") as zf:
    android_bundle = zf.read("assets/index.android.bundle")
    android_has_text = (
        needle.encode("utf-8") in android_bundle
        or needle.encode("utf-16le") in android_bundle
        or needle.encode("utf-16be") in android_bundle
    )
    print(f"  Footer Copy Present in index.android.bundle: {android_has_text}")

print("\n=====================================================")
print("=== FINAL VERIFICATION SUMMARY ===")
print("=====================================================")
print(f'iOS CFBundleShortVersionString == 0.2.24: {ios_short_version == "0.2.24"}')
print(
    f"iOS CFBundleVersion >= 24: {int(ios_build_number) >= 24} (value={ios_build_number})"
)
print(f"iOS Footer Copy: {ios_has_text}")
print(f"iOS SHA256: {ios_sha}")
print(f'Android versionName == 0.2.24: {android_version_name == "0.2.24"}')
print(
    f"Android versionCode >= 24: {int(android_version_code) >= 24} (value={android_version_code})"
)
print(f"Android Cert SHA1 Matches Expected: {cert_matches}")
print(f"Android Footer Copy: {android_has_text}")
print(f"Android SHA256: {android_sha_str}")

all_pass = (
    ios_short_version == "0.2.24"
    and int(ios_build_number) >= 24
    and ios_has_text
    and android_version_name == "0.2.24"
    and int(android_version_code) >= 24
    and cert_matches
    and android_has_text
)
print(f"\nALL CHECKS PASSED: {all_pass}")
if not all_pass:
    sys.exit(1)
