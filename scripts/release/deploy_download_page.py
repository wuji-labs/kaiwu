#!/usr/bin/env python3
# Copyright (c) 2026 Qianyuan Wuji Group (WUJILabs)
"""Deploy apps/website/public/download/index.html to the live download page, verify it, screenshot it.

Usage:
  python scripts/release/deploy_download_page.py [--shots-dir D:/tmp/download-shots] [--no-shots] [--dry-run]

Steps: back up the live index.html on the server -> scp the repo copy -> fetch the live page and require
its SHA-256 to equal the local file -> (optional) Playwright screenshots at 1440px light and 390px dark,
with the live manifest, so layout can be reviewed. The manifest and binaries are untouched (see
publish-downloads.mjs). Rollback: the printed `cp <backup> index.html` command.
"""
from __future__ import annotations

import argparse
import datetime
import hashlib
import subprocess
import sys
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
LOCAL = REPO / 'apps' / 'website' / 'public' / 'download' / 'index.html'
REMOTE_HOST = 'ubuntu@150.158.55.6'
REMOTE = '/opt/wuji-kaiwu/docs/html/download/index.html'
LIVE = 'https://kaiwu.wujilabs.cn/download/'
VIEWPORTS = ((1440, 1000, 'light', 'desktop'), (390, 844, 'dark', 'mobile'))


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def backup_path(stamp: str) -> str:
    return f'{REMOTE}.bak-{stamp}'


def fetch_live(stamp: str) -> bytes:
    with urllib.request.urlopen(f'{LIVE}?t={stamp}', timeout=30) as r:
        return r.read()


def screenshots(out_dir: Path, stamp: str) -> list[Path]:
    from playwright.sync_api import sync_playwright
    out_dir.mkdir(parents=True, exist_ok=True)
    shots = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for width, height, scheme, name in VIEWPORTS:
            page = browser.new_page(viewport={'width': width, 'height': height}, color_scheme=scheme,
                                    device_scale_factor=2 if width < 500 else 1)
            page.goto(f'{LIVE}?t={stamp}', wait_until='networkidle')
            page.wait_for_timeout(1200)
            path = out_dir / f'download-{name}.png'
            page.screenshot(path=str(path), full_page=True)
            shots.append(path)
        browser.close()
    return shots


MAGIC = {'.zip': b'PK\x03\x04', '.apk': b'PK\x03\x04', '.ipa': b'PK\x03\x04', '.tgz': b'\x1f\x8b',
         '.gz': b'\x1f\x8b', '.appimage': b'\x7fELF'}


def expected_magic(filename: str) -> bytes | None:
    return MAGIC.get(Path(filename.lower()).suffix)


def check_live(stamp: str) -> int:
    """Read-only health check: every manifest download resolves with the right file type, the install
    script is reachable, and the Windows hero button points at the desktop build."""
    import json
    failures = 0
    with urllib.request.urlopen(f'{LIVE}manifest.json?t={stamp}', timeout=30) as r:
        platforms = json.loads(r.read())['platforms']
    for key, entry in sorted(platforms.items()):
        if not entry.get('version'):
            continue
        req = urllib.request.Request(entry['url'], headers={'Range': 'bytes=0-7'})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                head = r.read(8)
            magic = expected_magic(entry['filename'])
            ok = magic is None or head.startswith(magic)
        except Exception as exc:  # noqa: BLE001 - report and continue
            ok, head = False, str(exc).encode()
        failures += not ok
        print(f"[check] {'OK  ' if ok else 'FAIL'} {key} v{entry['version']} {entry['filename']}")
    with urllib.request.urlopen('https://kaiwu.wujilabs.cn/install.ps1', timeout=30) as r:
        ok = r.status == 200 and b'& {' in r.read(64)
    failures += not ok
    print(f"[check] {'OK  ' if ok else 'FAIL'} install.ps1")
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                                           '(KHTML, like Gecko) Chrome/140.0 Safari/537.36')
        page.goto(f'{LIVE}?t={stamp}', wait_until='networkidle')
        page.wait_for_timeout(1200)
        href = page.locator('#primary').get_attribute('href') or ''
        browser.close()
    ok = href.endswith('/download/desktop-windows')
    failures += not ok
    print(f"[check] {'OK  ' if ok else 'FAIL'} Windows hero -> {href}")
    return 1 if failures else 0


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--shots-dir', default='D:/tmp/download-shots')
    ap.add_argument('--no-shots', action='store_true')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--check', action='store_true', help='read-only live health check, no deploy')
    args = ap.parse_args(argv)

    stamp = datetime.datetime.now().strftime('%Y%m%d%H%M%S')
    if args.check:
        return check_live(stamp)
    local = LOCAL.read_bytes()
    print(f'[page] local {LOCAL.name} sha256 {sha256(local)[:16]}')
    if args.dry_run:
        print(f'[page] dry-run: would back up to {backup_path(stamp)} and upload')
        return 0
    subprocess.run(['ssh', REMOTE_HOST, f'cp {REMOTE} {backup_path(stamp)}'], check=True)
    subprocess.run(['scp', '-q', str(LOCAL), f'{REMOTE_HOST}:{REMOTE}'], check=True)
    live = fetch_live(stamp)
    if sha256(live) != sha256(local):
        print(f'[page] live page differs from local file; rollback: ssh {REMOTE_HOST} "cp {backup_path(stamp)} {REMOTE}"',
              file=sys.stderr)
        return 1
    print(f'[page] live OK; rollback: ssh {REMOTE_HOST} "cp {backup_path(stamp)} {REMOTE}"')
    if not args.no_shots:
        for path in screenshots(Path(args.shots_dir), stamp):
            print(f'[page] screenshot {path}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
