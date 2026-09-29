#!/usr/bin/env python3
"""Prune old Kaiwu release artifacts from Tencent Cloud COS.

Retention policy (WUJI): keep only the newest N versions (default 2: current + one rollback)
under each versioned prefix. The version that releases/cli/latest.json points at is never deleted.

Usage:
  python scripts/cos-prune-releases.py            # dry run: list what would be deleted
  python scripts/cos-prune-releases.py --apply    # actually delete
  python scripts/cos-prune-releases.py --keep 3 --apply
"""

import argparse
import importlib.util
import json
import re
import sys
from pathlib import Path

ENV_FILE = r"D:\Projects\qianyuan-wuji\secrets\kaiwu-server\cos.env"
# Prefixes whose direct children are version directories, e.g. releases/cli/0.2.19/...
VERSIONED_PREFIXES = ["releases/cli/", "releases/ios/", "releases/android/"]
LATEST_KEY = "releases/cli/latest.json"
IOS_LATEST_KEY = "releases/ios/latest.json"
ANDROID_LATEST_KEY = "releases/android/latest.json"
INSTALLER_KEYS = ["install.ps1", "install.sh"]
VERSION_RE = re.compile(r"^\d+\.\d+\.\d+$")


def load_cos_client():
    spec = importlib.util.spec_from_file_location(
        "upload_release_to_cos", Path(__file__).with_name("upload-release-to-cos.py")
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.load_cos_client(ENV_FILE)


def list_keys(client, bucket, prefix):
    keys, marker = [], ""
    while True:
        resp = client.list_objects(Bucket=bucket, Prefix=prefix, Marker=marker, MaxKeys=1000)
        for item in resp.get("Contents", []) or []:
            keys.append((item["Key"], int(item.get("Size", 0))))
        if resp.get("IsTruncated") == "true":
            marker = resp.get("NextMarker") or keys[-1][0]
        else:
            return keys


def version_tuple(v):
    return tuple(int(p) for p in v.split("."))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--keep", type=int, default=2)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if args.keep < 1:
        sys.exit("--keep must be >= 1")

    client, bucket = load_cos_client()
    latest = json.loads(client.get_object(Bucket=bucket, Key=LATEST_KEY)["Body"].get_raw_stream().read())
    pinned = str(latest.get("version", "")).strip()
    if not VERSION_RE.match(pinned):
        sys.exit(f"refusing to prune: latest.json version is not a plain semver ({pinned!r})")
    # Installers hard-code a fallback version used when latest.json is unreachable; never delete it.
    fallback_versions = set()
    for key in INSTALLER_KEYS:
        text = client.get_object(Bucket=bucket, Key=key)["Body"].get_raw_stream().read().decode("utf-8", "replace")
        fallback_versions.update(re.findall(r"releases/cli/(\d+\.\d+\.\d+)/", text))
        fallback_versions.update(re.findall(r'DEFAULT_VERSION\s*=\s*"(\d+\.\d+\.\d+)"', text))
    ios_pinned = ""
    try:
        ios_latest = json.loads(client.get_object(Bucket=bucket, Key=IOS_LATEST_KEY)["Body"].get_raw_stream().read())
        ios_pinned = str(ios_latest.get("version", "")).strip()
    except Exception:
        pass
    android_pinned = ""
    try:
        android_latest = json.loads(client.get_object(Bucket=bucket, Key=ANDROID_LATEST_KEY)["Body"].get_raw_stream().read())
        android_pinned = str(android_latest.get("version", "")).strip()
    except Exception:
        pass
    print(f"bucket={bucket} keep={args.keep} pinned(cli)={pinned} pinned(ios)={ios_pinned} pinned(android)={android_pinned} installer-fallbacks={sorted(fallback_versions)} mode={'APPLY' if args.apply else 'DRY-RUN'}")

    total_bytes = 0
    for prefix in VERSIONED_PREFIXES:
        by_version = {}
        for key, size in list_keys(client, bucket, prefix):
            head = key[len(prefix):].split("/", 1)[0]
            if VERSION_RE.match(head) and "/" in key[len(prefix):]:
                by_version.setdefault(head, []).append((key, size))
        versions = sorted(by_version, key=version_tuple, reverse=True)
        keep = set(versions[: args.keep])
        if prefix == "releases/cli/":
            keep.add(pinned)
            keep.update(fallback_versions)
        elif prefix == "releases/ios/" and ios_pinned:
            keep.add(ios_pinned)
        elif prefix == "releases/android/" and android_pinned:
            keep.add(android_pinned)
        print(f"\n{prefix} versions={versions} keep={sorted(keep, key=version_tuple, reverse=True)}")
        for version in versions:
            if version in keep:
                continue
            for key, size in by_version[version]:
                total_bytes += size
                print(f"  {'DELETE' if args.apply else 'would delete'} {key} ({size} bytes)")
                if args.apply:
                    client.delete_object(Bucket=bucket, Key=key)

    print(f"\n{'deleted' if args.apply else 'would free'} {total_bytes / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    main()
