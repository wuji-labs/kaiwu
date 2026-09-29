#!/usr/bin/env python3
"""Upload iOS unsigned IPA to Tencent Cloud COS and update latest.json."""

import hashlib
import json
import os
import sys
from pathlib import Path
from qcloud_cos import CosConfig, CosS3Client


def calculate_sha256(filepath: Path) -> str:
    sha = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(1024 * 1024):
            sha.update(chunk)
    return sha.hexdigest().lower()


def load_credentials(env_file: str) -> tuple:
    if Path(env_file).exists():
        with open(env_file, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ[k.strip()] = v.strip()

    secret_id = os.environ.get("COS_SECRET_ID")
    secret_key = os.environ.get("COS_SECRET_KEY")
    region = os.environ.get("COS_REGION", "ap-shanghai")
    bucket = os.environ.get("COS_BUCKET", "kaiwu-static-1444025891")

    if not secret_id or not secret_key:
        raise SystemExit("Error: COS_SECRET_ID or COS_SECRET_KEY missing in environment")

    return secret_id, secret_key, region, bucket


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


def main():
    env_file = r"D:\Projects\qianyuan-wuji\secrets\kaiwu-server\cos.env"

    custom_version = None
    ipa_file = None

    for arg in sys.argv[1:]:
        p = Path(arg)
        if p.exists():
            if p.suffix == ".ipa":
                ipa_file = p
            elif p.is_dir():
                candidates = list(p.rglob("*.ipa"))
                if candidates:
                    ipa_file = candidates[0]
        elif arg.replace(".", "").isdigit() and "." in arg:
            custom_version = arg

    version = resolve_version(custom_version)
    print(f"Target version: {version}")

    if not ipa_file:
        default_dir = Path(r"D:\Projects\kaiwu\dist\ios")
        candidates = list(default_dir.rglob("*.ipa"))
        if candidates:
            ipa_file = sorted(candidates, key=lambda p: p.stat().st_mtime, reverse=True)[0]

    if not ipa_file or not ipa_file.exists():
        print("Error: No IPA file found")
        sys.exit(1)

    file_size = ipa_file.stat().st_size
    file_size_mb = file_size / 1024 / 1024
    file_sha256 = calculate_sha256(ipa_file)
    print(f"Found IPA: {ipa_file} ({file_size_mb:.2f} MB, sha256={file_sha256})")

    secret_id, secret_key, region, bucket = load_credentials(env_file)
    config = CosConfig(Region=region, SecretId=secret_id, SecretKey=secret_key, Token=None, Scheme="https")
    client = CosS3Client(config)

    targets = [
        f"releases/ios/{version}/kaiwu-{version}-unsigned.ipa",
        "releases/ios/latest/kaiwu-unsigned.ipa",
    ]

    for key in targets:
        print(f"Uploading to cos://{bucket}/{key}...")
        with open(ipa_file, "rb") as fp:
            client.put_object(
                Bucket=bucket,
                Body=fp,
                Key=key,
                ContentType="application/octet-stream",
                EnableMD5=False,
            )
        print(f"Successfully uploaded {key}")

    latest_payload = {
        "version": version,
        "ipa": f"https://{bucket}.cos.{region}.myqcloud.com/releases/ios/{version}/kaiwu-{version}-unsigned.ipa",
        "sha256": file_sha256,
        "signed": False,
    }
    latest_json_str = json.dumps(latest_payload, ensure_ascii=False)
    print(f"Uploading releases/ios/latest.json: {latest_json_str}")
    client.put_object(
        Bucket=bucket,
        Body=latest_json_str.encode("utf-8"),
        Key="releases/ios/latest.json",
        ContentType="application/json",
        EnableMD5=False,
    )
    print("releases/ios/latest.json uploaded successfully!")
    print("All iOS IPA targets uploaded to Tencent Cloud COS successfully!")


if __name__ == "__main__":
    main()
