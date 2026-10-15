#!/usr/bin/env python3
"""Provision the private COS bucket used as the large-attachment transfer relay.

Idempotent: creates the bucket if missing (private ACL), then (re)applies CORS for the
web UI origins and a lifecycle rule that expires leftover transfer objects after 1 day.

Usage:
  python scripts/setup-transfer-bucket.py --env-file <cos.env> [--bucket kaiwu-transfer-1444025891]
"""

import argparse
import os
import sys
from pathlib import Path

from qcloud_cos import CosConfig, CosS3Client
from qcloud_cos.cos_exception import CosServiceError

DEFAULT_BUCKET = 'kaiwu-transfer-1444025891'
DEFAULT_ORIGINS = ['https://kaiwu.wujilabs.cn', 'http://localhost:8081', 'http://localhost:19006']
TRANSFER_PREFIX = 'transfers/'


def load_env(env_file: str) -> None:
    if not env_file or not Path(env_file).exists():
        return
    for line in Path(env_file).read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            key, val = line.split('=', 1)
            os.environ.setdefault(key.strip(), val.strip())


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--env-file', default='')
    parser.add_argument('--bucket', default=DEFAULT_BUCKET)
    parser.add_argument('--origin', action='append', default=None)
    args = parser.parse_args()

    load_env(args.env_file)
    secret_id = os.environ.get('COS_SECRET_ID')
    secret_key = os.environ.get('COS_SECRET_KEY')
    region = os.environ.get('COS_REGION', 'ap-shanghai')
    if not secret_id or not secret_key:
        print('COS_SECRET_ID/COS_SECRET_KEY not set', file=sys.stderr)
        return 2

    client = CosS3Client(CosConfig(Region=region, SecretId=secret_id, SecretKey=secret_key, Scheme='https'))
    bucket = args.bucket

    try:
        client.head_bucket(Bucket=bucket)
        print(f'bucket exists: {bucket}')
    except CosServiceError as error:
        if error.get_status_code() != 404:
            raise
        client.create_bucket(Bucket=bucket, ACL='private')
        print(f'bucket created: {bucket}')

    client.put_bucket_acl(Bucket=bucket, ACL='private')

    origins = args.origin or DEFAULT_ORIGINS
    client.put_bucket_cors(
        Bucket=bucket,
        CORSConfiguration={
            'CORSRule': [{
                'ID': 'kaiwu-transfer-web',
                'AllowedOrigin': origins,
                'AllowedMethod': ['PUT'],
                'AllowedHeader': ['*'],
                'ExposeHeader': ['ETag'],
                'MaxAgeSeconds': 600,
            }],
        },
    )
    print(f'cors applied: {origins}')

    client.put_bucket_lifecycle(
        Bucket=bucket,
        LifecycleConfiguration={
            'Rule': [{
                'ID': 'expire-transfer-leftovers',
                'Filter': {'Prefix': TRANSFER_PREFIX},
                'Status': 'Enabled',
                'Expiration': {'Days': 1},
                'AbortIncompleteMultipartUpload': {'DaysAfterInitiation': 1},
            }],
        },
    )
    print(f'lifecycle applied: {TRANSFER_PREFIX} expires after 1 day')
    return 0


if __name__ == '__main__':
    sys.exit(main())
