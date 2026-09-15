#!/usr/bin/env python3
"""Upload Kaiwu release artifacts to Tencent Cloud COS."""

import os
import sys
import hashlib
from pathlib import Path
from qcloud_cos import CosConfig, CosS3Client


def calculate_sha256(filepath: Path) -> str:
    sha = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(1024 * 1024):
            sha.update(chunk)
    return sha.hexdigest().lower()


def load_cos_client(env_file: str) -> tuple[CosS3Client, str]:
    if not Path(env_file).exists():
        raise FileNotFoundError(f"Missing cos.env file: {env_file}")

    with open(env_file, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#'):
                k, v = line.split('=', 1)
                os.environ[k.strip()] = v.strip()

    secret_id = os.environ.get('COS_SECRET_ID')
    secret_key = os.environ.get('COS_SECRET_KEY')
    region = os.environ.get('COS_REGION', 'ap-shanghai')
    bucket = os.environ.get('COS_BUCKET', 'kaiwu-static-1444025891')

    if not secret_id or not secret_key:
        raise ValueError("Missing COS_SECRET_ID or COS_SECRET_KEY")

    config = CosConfig(Region=region, SecretId=secret_id, SecretKey=secret_key)
    client = CosS3Client(config)
    return client, bucket


def main():
    repo_root = Path(r"D:\Projects\kaiwu")
    env_file = Path(r"D:\Projects\qianyuan-wuji\secrets\kaiwu-server\cos.env")

    client, bucket = load_cos_client(str(env_file))
    print(f"Connected to COS bucket: {bucket}")

    version = "0.2.16"
    cli_assets_dir = repo_root / "dist" / "release-assets" / "cli"
    website_public_dir = repo_root / "apps" / "website" / "public"

    uploads = [
        # (local_path, cos_key, content_type, cache_control)
        (
            cli_assets_dir / f"kaiwu-cli-{version}.tgz",
            f"releases/cli/{version}/kaiwu-cli-{version}.tgz",
            "application/gzip",
            "public, max-age=31536000, immutable"
        ),
        (
            cli_assets_dir / f"kaiwu-v{version}-windows-x64.tar.gz",
            f"releases/cli/{version}/kaiwu-v{version}-windows-x64.tar.gz",
            "application/gzip",
            "public, max-age=31536000, immutable"
        ),
        (
            cli_assets_dir / f"checksums-kaiwu-v{version}.txt",
            f"releases/cli/{version}/checksums-kaiwu-v{version}.txt",
            "text/plain; charset=utf-8",
            "public, max-age=31536000, immutable"
        ),
        (
            cli_assets_dir / "latest.json",
            "releases/cli/latest.json",
            "application/json",
            "no-cache"
        ),
        (
            website_public_dir / "install.ps1",
            "releases/cli/install.ps1",
            "text/plain; charset=utf-8",
            "no-cache"
        ),
        (
            website_public_dir / "install.ps1",
            "install.ps1",
            "text/plain; charset=utf-8",
            "no-cache"
        ),
        (
            website_public_dir / "install.ps1",
            "install/install.ps1",
            "text/plain; charset=utf-8",
            "no-cache"
        ),
        (
            website_public_dir / "install.sh",
            "install/install.sh",
            "text/plain; charset=utf-8",
            "no-cache"
        ),
        (
            website_public_dir / "install.sh",
            "install.sh",
            "text/plain; charset=utf-8",
            "no-cache"
        ),
    ]

    print("\n--- Starting Uploads ---")
    results = []

    for local_file, cos_key, content_type, cache_control in uploads:
        if not local_file.exists():
            print(f"[ERROR] Local file not found: {local_file}")
            sys.exit(1)

        size = local_file.stat().st_size
        sha256 = calculate_sha256(local_file)
        print(f"Uploading {local_file.name} ({size} bytes, sha256={sha256[:8]}...) -> {cos_key}")

        metadata = {
            'x-cos-meta-orig-size': str(size),
            'x-cos-meta-sha256': sha256,
        }

        # Use upload_file for high throughput with automatic multipart support
        client.upload_file(
            Bucket=bucket,
            Key=cos_key,
            LocalFilePath=str(local_file),
            ContentType=content_type,
            CacheControl=cache_control,
            Metadata=metadata,
            MAXThread=10,
        )

        # Verification via head_object
        head = client.head_object(Bucket=bucket, Key=cos_key)
        resp_lower = {k.lower(): v for k, v in head.items()}
        remote_size = int(resp_lower.get('content-length', 0))
        remote_sha = resp_lower.get('x-cos-meta-sha256', '')

        if remote_size != size:
            raise RuntimeError(f"Size mismatch for {cos_key}: local={size}, remote={remote_size}")
        if remote_sha and remote_sha.lower() != sha256.lower():
            raise RuntimeError(f"SHA256 mismatch for {cos_key}: local={sha256}, remote={remote_sha}")

        print(f"  [OK] Verified {cos_key} (size={remote_size})")
        results.append({
            'key': cos_key,
            'size': size,
            'sha256': sha256,
            'url': f"https://{bucket}.cos.ap-shanghai.myqcloud.com/{cos_key}"
        })

    print("\n--- All Uploads Succeeded & Verified ---")
    for r in results:
        print(f"- {r['key']}: {r['size']} bytes | sha256: {r['sha256']}")
        print(f"  URL: {r['url']}")


if __name__ == '__main__':
    main()
