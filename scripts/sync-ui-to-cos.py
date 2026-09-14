#!/usr/bin/env python3
"""Sync UI assets to COS with gzip pre-compression and verification."""

import os
import sys
import gzip
import hashlib
import argparse
import mimetypes
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from qcloud_cos import CosConfig, CosS3Client


def load_credentials(env_file: str = None) -> tuple:
    """Load COS credentials from environment or .env file."""
    if env_file and Path(env_file).exists():
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    key, val = line.split('=', 1)
                    os.environ[key.strip()] = val.strip()

    secret_id = os.environ.get('COS_SECRET_ID')
    secret_key = os.environ.get('COS_SECRET_KEY')
    region = os.environ.get('COS_REGION', 'ap-shanghai')
    bucket = os.environ.get('COS_BUCKET', 'kaiwu-static-1444025891')

    if not secret_id or not secret_key:
        raise SystemExit("COS_SECRET_ID/COS_SECRET_KEY not set")

    return secret_id, secret_key, region, bucket


def get_content_type(filepath: str) -> str:
    """Map file extension to Content-Type."""
    ext = Path(filepath).suffix.lower()

    content_type_map = {
        '.js': 'application/javascript; charset=utf-8',
        '.mjs': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json',
        '.wasm': 'application/wasm',
        '.svg': 'image/svg+xml',
        '.ttf': 'font/ttf',
        '.otf': 'font/otf',
        '.webmanifest': 'application/json',
        '.map': 'application/json',
        '.txt': 'text/plain',
        '.html': 'text/html; charset=utf-8',
        '.ps1': 'text/plain; charset=utf-8',
    }

    if ext in content_type_map:
        return content_type_map[ext]

    guessed, _ = mimetypes.guess_type(filepath)
    return guessed or 'application/octet-stream'


def should_compress(filepath: str) -> bool:
    """Check if file should be gzip compressed."""
    compressible = {'.js', '.mjs', '.css', '.json', '.wasm', '.svg', '.ttf', '.otf', '.map', '.txt', '.webmanifest', '.html'}
    return Path(filepath).suffix.lower() in compressible


def get_cache_control(filepath: str) -> str:
    """Get Cache-Control header for file."""
    rel_path = Path(filepath).name
    if rel_path in (
        'index.html',
        'metadata.json',
        'install',
        'install.sh',
        'install.ps1',
        'install-preview',
        'install-preview.sh',
        'install-preview.ps1',
        'install-dev',
        'install-dev.sh',
        'install-dev.ps1',
    ):
        return 'no-cache'
    return 'public, max-age=31536000, immutable'


def calculate_sha256(data: bytes) -> str:
    """Calculate SHA256 hash of data."""
    return hashlib.sha256(data).hexdigest()


def upload_file(client, bucket: str, local_path: Path, cos_key: str, prefix: str, dry_run: bool = False):
    """Upload a single file to COS."""
    with open(local_path, 'rb') as f:
        original_data = f.read()

    original_sha256 = calculate_sha256(original_data)
    original_size = len(original_data)

    content_type = get_content_type(str(local_path))
    cache_control = get_cache_control(str(local_path))

    # Prepare upload data and metadata
    metadata = {
        'x-cos-meta-orig-size': str(original_size),
        'x-cos-meta-sha256': original_sha256,
    }

    if should_compress(str(local_path)):
        compressed_data = gzip.compress(original_data, compresslevel=9)
        upload_data = compressed_data
        content_encoding = 'gzip'
        compressed_size = len(compressed_data)
    else:
        upload_data = original_data
        content_encoding = None
        compressed_size = original_size

    if dry_run:
        print(f"[DRY-RUN] {cos_key}: {original_size} -> {compressed_size} bytes")
        return {
            'key': cos_key,
            'original_size': original_size,
            'compressed_size': compressed_size,
            'sha256': original_sha256,
            'content_type': content_type,
        }

    # Upload to COS
    kwargs = {
        'Bucket': bucket,
        'Body': upload_data,
        'Key': cos_key,
        'ContentType': content_type,
        'CacheControl': cache_control,
        'Metadata': metadata,
    }

    if content_encoding:
        kwargs['ContentEncoding'] = content_encoding

    client.put_object(**kwargs)

    return {
        'key': cos_key,
        'original_size': original_size,
        'compressed_size': compressed_size,
        'sha256': original_sha256,
        'content_type': content_type,
    }


def verify_cos_files(client, bucket: str, src_dir: Path, prefix: str):
    """Verify uploaded files on COS with strict verification.

    Every file must have x-cos-meta-sha256 matching local sha256.
    Compressible files must additionally have Content-Encoding: gzip.
    """
    src_dir = Path(src_dir)
    if not src_dir.exists():
        print(f"Source directory not found: {src_dir}")
        return False

    failed = []
    total = 0
    verified = 0
    compressible_count = 0

    for local_path in sorted(src_dir.rglob('*')):
        if not local_path.is_file():
            continue

        total += 1
        rel_path = local_path.relative_to(src_dir).as_posix()
        cos_key = f"{prefix}{rel_path}"

        with open(local_path, 'rb') as f:
            original_data = f.read()
        original_sha256 = calculate_sha256(original_data)

        try:
            response = client.head_object(Bucket=bucket, Key=cos_key)
        except Exception as e:
            failed.append(f"{cos_key}: NOT FOUND")
            continue

        # Build case-insensitive header lookup from response dict (headers are at top level)
        response_lower = {k.lower(): v for k, v in response.items()}

        # STRICT: Every file must have x-cos-meta-sha256 header
        stored_sha256 = response_lower.get('x-cos-meta-sha256')
        if not stored_sha256:
            failed.append(f"{cos_key}: MISSING x-cos-meta-sha256 header")
            continue

        if stored_sha256 != original_sha256:
            failed.append(f"{cos_key}: SHA256 mismatch (stored={stored_sha256}, expected={original_sha256})")
            continue

        # For compressible files, additionally verify Content-Encoding is gzip
        if should_compress(str(local_path)):
            compressible_count += 1
            content_encoding = response_lower.get('content-encoding', '')
            if content_encoding != 'gzip':
                failed.append(f"{cos_key}: Content-Encoding not gzip (got={content_encoding})")
                continue

        verified += 1

    if failed:
        print(f"Verification failed: {len(failed)}/{total} files")
        for error in failed:
            print(f"  {error}")
        return False

    print(f"Verification passed: {verified}/{total} files (including {compressible_count} compressible)")
    return True


def main():
    parser = argparse.ArgumentParser(description='Sync UI assets to COS with gzip compression')
    parser.add_argument('--src', default='D:/Projects/wuji-labs-app/apps/ui/dist',
                        help='Source directory (default: D:/Projects/wuji-labs-app/apps/ui/dist)')
    parser.add_argument('--prefix', default='web/', help='COS key prefix (default: web/)')
    parser.add_argument('--verify-only', action='store_true', help='Only verify, do not upload')
    parser.add_argument('--dry-run', action='store_true', help='Dry run without uploading')
    parser.add_argument('--env', default='D:\\Projects\\qianyuan-wuji\\secrets\\kaiwu-server\\cos.env',
                        help='Path to .env file with credentials')

    args = parser.parse_args()

    # Load credentials
    secret_id, secret_key, region, bucket = load_credentials(args.env)

    config = CosConfig(Region=region, SecretId=secret_id, SecretKey=secret_key)
    client = CosS3Client(config)

    src_dir = Path(args.src)
    if not src_dir.exists():
        print(f"Source directory not found: {src_dir}")
        return 1

    # Verification only mode
    if args.verify_only:
        print(f"Verifying files in {bucket}/{args.prefix}...")
        success = verify_cos_files(client, bucket, src_dir, args.prefix)
        return 0 if success else 1

    # Collect all files
    files = sorted([p for p in src_dir.rglob('*') if p.is_file()])
    print(f"Total files to sync: {len(files)}")

    # Upload with threading
    results = []
    total_original_bytes = 0
    total_compressed_bytes = 0

    with ThreadPoolExecutor(max_workers=16) as executor:
        futures = {}
        for local_path in files:
            rel_path = local_path.relative_to(src_dir).as_posix()
            cos_key = f"{args.prefix}{rel_path}"

            future = executor.submit(upload_file, client, bucket, local_path, cos_key, args.prefix, args.dry_run)
            futures[future] = local_path

        for i, future in enumerate(as_completed(futures), 1):
            try:
                result = future.result()
                results.append(result)
                total_original_bytes += result['original_size']
                total_compressed_bytes += result['compressed_size']

                if i % 50 == 0 or i == len(files):
                    print(f"Processed {i}/{len(files)}...")
            except Exception as e:
                print(f"Error uploading {futures[future]}: {e}")
                return 1

    print(f"\nUpload complete!")
    print(f"Files uploaded: {len(results)}")
    print(f"Original total: {total_original_bytes:,} bytes")
    print(f"Compressed total: {total_compressed_bytes:,} bytes")
    if total_original_bytes > 0:
        ratio = (1 - total_compressed_bytes / total_original_bytes) * 100
        print(f"Compression ratio: {ratio:.1f}%")

    # Verify after upload
    if not args.dry_run:
        print(f"\nVerifying uploaded files...")
        success = verify_cos_files(client, bucket, src_dir, args.prefix)
        return 0 if success else 1

    return 0


if __name__ == '__main__':
    sys.exit(main())
