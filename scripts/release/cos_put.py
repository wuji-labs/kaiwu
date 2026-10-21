#!/usr/bin/env python3
# Copyright (c) 2026 Qianyuan Wuji Group (WUJILabs)
"""Upload one local file to the Kaiwu COS bucket under one or more keys, then verify by HEAD.

Usage: python scripts/release/cos_put.py <local_file> <cos_key> [<cos_key> ...]

Keys mirror the origin layout (`docs/releases/<platform>/<version>/<file>`), because Caddy redirects
binary downloads under /docs/releases/ to dl.wujilabs.cn (the CDN in front of this bucket).
Credentials: COS_SECRET_ID / COS_SECRET_KEY (optional COS_REGION / COS_BUCKET) from the environment,
or from the env file at $KAIWU_COS_ENV_FILE (default: the group secrets cos.env).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

DEFAULT_ENV_FILE = r'D:\Projects\qianyuan-wuji\secrets\kaiwu-server\cos.env'
CONTENT_TYPES = {
    '.zip': 'application/zip',
    '.dmg': 'application/x-apple-diskimage',
    '.appimage': 'application/octet-stream',
    '.apk': 'application/vnd.android.package-archive',
    '.ipa': 'application/octet-stream',
    '.tgz': 'application/gzip',
    '.gz': 'application/gzip',
    '.json': 'application/json',
    '.sig': 'text/plain; charset=utf-8',
}


def read_env_file(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            out[k.strip()] = v.strip()
    return out


def content_type_for(key: str) -> str:
    return CONTENT_TYPES.get(Path(key).suffix.lower(), 'application/octet-stream')


def cache_control_for(key: str) -> str:
    # Versioned paths never change; `latest` aliases and feeds must revalidate.
    return 'no-cache' if '/latest/' in key or key.endswith('latest.json') else 'public, max-age=31536000, immutable'


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2
    local = Path(argv[0])
    keys = argv[1:]
    env = dict(os.environ)
    env_file = Path(env.get('KAIWU_COS_ENV_FILE', DEFAULT_ENV_FILE))
    if not env.get('COS_SECRET_ID') and env_file.exists():
        env.update(read_env_file(env_file))
    if not env.get('COS_SECRET_ID') or not env.get('COS_SECRET_KEY'):
        print('[cos_put] missing COS_SECRET_ID / COS_SECRET_KEY', file=sys.stderr)
        return 1

    from qcloud_cos import CosConfig, CosS3Client

    client = CosS3Client(CosConfig(Region=env.get('COS_REGION', 'ap-shanghai'),
                                   SecretId=env['COS_SECRET_ID'], SecretKey=env['COS_SECRET_KEY']))
    bucket = env.get('COS_BUCKET', 'kaiwu-static-1444025891')
    size = local.stat().st_size
    for key in keys:
        client.upload_file(Bucket=bucket, Key=key, LocalFilePath=str(local), PartSize=8, MAXThread=8,
                           ContentType=content_type_for(key), CacheControl=cache_control_for(key))
        head = client.head_object(Bucket=bucket, Key=key)
        remote = int(head.get('Content-Length', -1))
        if remote != size:
            print(f'[cos_put] size mismatch for {key}: local {size} remote {remote}', file=sys.stderr)
            return 1
        print(f'[cos_put] OK {key} ({size} bytes)')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
