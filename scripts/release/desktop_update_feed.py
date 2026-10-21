#!/usr/bin/env python3
# Copyright (c) 2026 Qianyuan Wuji Group (WUJILabs)
"""Publish desktop (Tauri) auto-update entries to https://kaiwu.wujilabs.cn/download/desktop/latest.json.

Usage:
  python scripts/release/desktop_update_feed.py --version 0.2.24 \
      --entry windows-x86_64=<setup.exe> --entry linux-x86_64=<app.AppImage> \
      [--entry darwin-aarch64=<app.tar.gz>] [--notes "..."] [--dry-run]

Each artifact needs its `<artifact>.sig` next to it (as produced by CI). For every entry the script
1. verifies the minisign signature against the updater pubkey in apps/ui/src-tauri/tauri.conf.json,
2. uploads the artifact to COS under docs/releases/desktop-updates/<version>/ (served by dl.wujilabs.cn),
3. merges the platform into the live latest.json (other platforms keep their current entries),
4. writes latest.json to the origin and reads it back over HTTPS.
Run with: uv run --no-project --with pynacl --with cos-python-sdk-v5 python -I scripts/release/desktop_update_feed.py ...
"""
from __future__ import annotations

import argparse
import base64
import datetime
import hashlib
import json
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
CONF = REPO / 'apps' / 'ui' / 'src-tauri' / 'tauri.conf.json'
FEED_URL = 'https://kaiwu.wujilabs.cn/download/desktop/latest.json'
REMOTE_HOST = 'ubuntu@150.158.55.6'
REMOTE_FEED = '/opt/wuji-kaiwu/docs/html/download/desktop/latest.json'
CDN = 'https://dl.wujilabs.cn'
PLATFORMS = {'windows-x86_64', 'linux-x86_64', 'darwin-aarch64', 'darwin-x86_64'}


def updater_pubkey(conf: Path = CONF) -> bytes:
    pub = json.loads(conf.read_text(encoding='utf-8'))['plugins']['updater']['pubkey']
    return base64.b64decode(base64.b64decode(pub).decode().splitlines()[1])


def verify_signature(artifact: Path, sig_text: str, pubkey: bytes) -> None:
    from nacl.signing import VerifyKey
    sig = base64.b64decode(base64.b64decode(sig_text).decode().splitlines()[1])
    alg, keyid, signature = sig[:2], sig[2:10], sig[10:]
    if keyid != pubkey[2:10]:
        raise SystemExit(f'{artifact.name}: signed by key {keyid[::-1].hex()}, expected {pubkey[2:10][::-1].hex()}')
    data = artifact.read_bytes()
    msg = hashlib.blake2b(data, digest_size=64).digest() if alg == b'ED' else data
    VerifyKey(pubkey[10:]).verify(msg, signature)


def merge_feed(current: dict | None, version: str, notes: str, entries: dict[str, dict], now: str) -> dict:
    platforms = dict((current or {}).get('platforms', {})) if current and current.get('version') == version else {}
    platforms.update(entries)
    return {'version': version, 'notes': notes, 'pub_date': now, 'platforms': platforms}


def fetch_current() -> dict | None:
    try:
        with urllib.request.urlopen(FEED_URL + '?t=' + str(datetime.datetime.now().timestamp()), timeout=30) as r:
            return json.loads(r.read())
    except Exception:
        return None


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--version', required=True)
    ap.add_argument('--entry', action='append', required=True, help='<platform>=<artifact path>')
    ap.add_argument('--notes', default='')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args(argv)

    pubkey = updater_pubkey()
    entries: dict[str, dict] = {}
    for spec in args.entry:
        platform, _, path = spec.partition('=')
        if platform not in PLATFORMS:
            raise SystemExit(f'unknown platform {platform}; expected one of {sorted(PLATFORMS)}')
        artifact = Path(path)
        sig_text = Path(str(artifact) + '.sig').read_text().strip()
        verify_signature(artifact, sig_text, pubkey)
        name = f'kaiwu-desktop-update-v{args.version}-{platform}' + ''.join(artifact.suffixes[-2:] if artifact.name.endswith('.tar.gz') else artifact.suffixes[-1:])
        key = f'docs/releases/desktop-updates/{args.version}/{name}'
        print(f'[feed] {platform}: signature OK -> {key}')
        if not args.dry_run:
            subprocess.run([sys.executable, '-I', str(REPO / 'scripts' / 'release' / 'cos_put.py'), str(artifact), key], check=True)
        entries[platform] = {'signature': sig_text, 'url': f'{CDN}/{key}'}

    now = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')
    feed = merge_feed(fetch_current(), args.version, args.notes, entries, now)
    body = json.dumps(feed, ensure_ascii=False, indent=2) + '\n'
    if args.dry_run:
        print(body)
        return 0
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8') as tmp:
        tmp.write(body)
    subprocess.run(['ssh', REMOTE_HOST, f'mkdir -p {Path(REMOTE_FEED).parent.as_posix()}'], check=True)
    subprocess.run(['scp', '-q', tmp.name, f'{REMOTE_HOST}:{REMOTE_FEED}'], check=True)
    live = fetch_current()
    if live != feed:
        raise SystemExit('[feed] live latest.json does not match what was written')
    print(f'[feed] live: {FEED_URL} ->', ', '.join(sorted(live['platforms'])))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
