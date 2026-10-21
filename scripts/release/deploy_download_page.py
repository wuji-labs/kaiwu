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


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--shots-dir', default='D:/tmp/download-shots')
    ap.add_argument('--no-shots', action='store_true')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args(argv)

    stamp = datetime.datetime.now().strftime('%Y%m%d%H%M%S')
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
