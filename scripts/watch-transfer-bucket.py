#!/usr/bin/env python3
"""Poll the transfer relay bucket and print a line whenever the set of in-flight objects changes.

Used to confirm on a live upload that attachment bytes actually traverse the object-store relay.

Usage:
  python scripts/watch-transfer-bucket.py --env-file <cos.env> [--bucket kaiwu-transfer-1444025891] [--seconds 600]
"""

import argparse
import os
import sys
import time
from pathlib import Path

from qcloud_cos import CosConfig, CosS3Client


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--env-file', default='')
    parser.add_argument('--bucket', default='kaiwu-transfer-1444025891')
    parser.add_argument('--seconds', type=int, default=600)
    args = parser.parse_args()

    if args.env_file and Path(args.env_file).exists():
        for line in Path(args.env_file).read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, val = line.split('=', 1)
                os.environ.setdefault(key.strip(), val.strip())

    client = CosS3Client(CosConfig(
        Region=os.environ.get('COS_REGION', 'ap-shanghai'),
        SecretId=os.environ['COS_SECRET_ID'],
        SecretKey=os.environ['COS_SECRET_KEY'],
        Scheme='https',
    ))
    seen_uploads: set[str] = set()
    last = None
    deadline = time.time() + args.seconds
    while time.time() < deadline:
        try:
            listing = client.list_objects(Bucket=args.bucket, Prefix='transfers/', MaxKeys=1000)
            contents = listing.get('Contents', []) or []
        except Exception as error:  # noqa: BLE001 - keep polling through transient errors
            print(f'list error: {error}', flush=True)
            time.sleep(2)
            continue
        uploads = {item['Key'].split('/')[1] for item in contents}
        total = sum(int(item['Size']) for item in contents)
        state = (len(contents), total)
        for upload in uploads - seen_uploads:
            print(f'{time.strftime("%H:%M:%S")} relay upload started: {upload}', flush=True)
        seen_uploads |= uploads
        if state != last:
            print(f'{time.strftime("%H:%M:%S")} in-flight objects={len(contents)} bytes={total}', flush=True)
            last = state
        time.sleep(1)
    return 0


if __name__ == '__main__':
    sys.exit(main())
