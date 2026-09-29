#!/usr/bin/env python3
"""Extract downloaded Android APK zip and upload to Tencent Cloud COS."""

import hashlib
import json
import os
import sys
import zipfile
from pathlib import Path
from qcloud_cos import CosConfig, CosS3Client


def calculate_sha256(filepath: Path) -> str:
    sha = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(1024 * 1024):
            sha.update(chunk)
    return sha.hexdigest().lower()


def resolve_version(arg_version: str = None) -> str:
    if arg_version:
        return arg_version.strip()
    pkg_path = Path(__file__).resolve().parent.parent / "apps" / "ui" / "package.json"
    if pkg_path.exists():
        try:
            with open(pkg_path, encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data.get("version"), str):
                    return data["version"].strip()
        except Exception:
            pass
    return "0.2.24"


def load_credentials(env_file: str) -> tuple:
    if Path(env_file).exists():
        with open(env_file, encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    os.environ[k.strip()] = v.strip()

    secret_id = os.environ.get('COS_SECRET_ID')
    secret_key = os.environ.get('COS_SECRET_KEY')
    region = os.environ.get('COS_REGION', 'ap-shanghai')
    bucket = os.environ.get('COS_BUCKET', 'kaiwu-static-1444025891')

    if not secret_id or not secret_key:
        raise SystemExit("Error: COS_SECRET_ID or COS_SECRET_KEY missing in environment")

    return secret_id, secret_key, region, bucket


def main():
    env_file = r"D:\Projects\qianyuan-wuji\secrets\kaiwu-server\cos.env"

    custom_version = None
    apk_file = None
    zip_path = None

    for arg in sys.argv[1:]:
        p = Path(arg)
        if p.exists():
            if p.suffix == '.apk':
                apk_file = p
            elif p.suffix == '.zip':
                zip_path = p
            elif p.is_dir():
                candidates = list(p.rglob("*.apk"))
                if candidates:
                    apk_file = candidates[0]
        elif arg.replace(".", "").isdigit() and "." in arg:
            custom_version = arg

    version = resolve_version(custom_version)
    print(f"Target version: {version}")

    if not apk_file and zip_path and zip_path.exists():
        extract_dir = zip_path.parent / "extracted"
        extract_dir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(zip_path, 'r') as zf:
            zf.extractall(extract_dir)
        apk_files = list(extract_dir.rglob("*.apk"))
        if apk_files:
            apk_file = apk_files[0]

    if not apk_file:
        for search_dir in [
            Path(r"D:\Projects\kaiwu\dist\android"),
            Path(r"D:\Projects\wuji-labs-app\dist\apk"),
        ]:
            if search_dir.exists():
                candidates = list(search_dir.rglob("*.apk"))
                if candidates:
                    apk_file = sorted(candidates, key=lambda p: p.stat().st_mtime, reverse=True)[0]
                    break

    if not apk_file or not apk_file.exists():
        print("Error: No APK found")
        sys.exit(1)

    file_size_mb = apk_file.stat().st_size / 1024 / 1024
    file_sha256 = calculate_sha256(apk_file)
    print(f"Found APK: {apk_file} ({file_size_mb:.2f} MB, sha256={file_sha256})")

    secret_id, secret_key, region, bucket = load_credentials(env_file)
    config = CosConfig(Region=region, SecretId=secret_id, SecretKey=secret_key, Token=None, Scheme='https')
    client = CosS3Client(config)

    targets = [
        "releases/mobile/kaiwu.apk",
        "releases/mobile/Kaiwu-android.apk",
        "releases/mobile/latest.apk",
        f"releases/android/{version}/kaiwu-{version}.apk",
        "releases/android/latest/kaiwu.apk",
        "releases/android/latest/kaiwu-latest.apk",
    ]

    for key in targets:
        print(f"Uploading to cos://{bucket}/{key}...")
        with open(apk_file, 'rb') as fp:
            client.put_object(
                Bucket=bucket,
                Body=fp,
                Key=key,
                ContentType='application/vnd.android.package-archive',
                EnableMD5=False
            )
        print(f"Successfully uploaded {key}")

    latest_payload = {
        "version": version,
        "apk": f"https://{bucket}.cos.{region}.myqcloud.com/releases/android/{version}/kaiwu-{version}.apk",
        "sha256": file_sha256,
    }
    latest_json_str = json.dumps(latest_payload, ensure_ascii=False)
    print(f"Uploading releases/android/latest.json: {latest_json_str}")
    client.put_object(
        Bucket=bucket,
        Body=latest_json_str.encode("utf-8"),
        Key="releases/android/latest.json",
        ContentType="application/json",
        EnableMD5=False,
    )
    print("releases/android/latest.json uploaded successfully!")
    print("All APK targets uploaded to Tencent Cloud COS successfully!")


if __name__ == '__main__':
    main()
