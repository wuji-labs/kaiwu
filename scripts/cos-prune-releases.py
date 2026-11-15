#!/usr/bin/env python3
"""Prune old Kaiwu release artifacts from Tencent Cloud COS.

Retention policy (WUJI): keep only the newest N versions (default 2: current + one rollback)
under each versioned prefix. The version that releases/cli/latest.json points at is never deleted.

Usage:
  python scripts/cos-prune-releases.py                  # dry run: list what would be deleted
  python scripts/cos-prune-releases.py --apply          # actually delete
  python scripts/cos-prune-releases.py --keep 3 --apply
  python scripts/cos-prune-releases.py --preflight-only # preflight canary probe & receipt only
"""

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
import time

# Structured exit codes contract (P1c9946cc-c3)
EXIT_SUCCESS = 0
EXIT_ERR_GENERIC = 1
EXIT_ERR_PATH_NOT_FOUND = 10
EXIT_ERR_DEPENDENCY_MISSING = 11
EXIT_ERR_CREDENTIAL_INVALID = 12
EXIT_ERR_NETWORK_UNREACHABLE = 13

ENV_FILE = r"D:\Projects\qianyuan-wuji\secrets\kaiwu-server\cos.env"
# Prefixes whose direct children are version directories, e.g. releases/cli/0.2.19/...
VERSIONED_PREFIXES = ["releases/cli/", "releases/ios/", "releases/android/"]
LATEST_KEY = "releases/cli/latest.json"
IOS_LATEST_KEY = "releases/ios/latest.json"
ANDROID_LATEST_KEY = "releases/android/latest.json"
INSTALLER_KEYS = ["install.ps1", "install.sh"]
VERSION_RE = re.compile(r"^\d+\.\d+\.\d+$")


def get_receipt_path() -> Path:
    env_receipt = os.environ.get("KAIWU_RECEIPT_PATH")
    if env_receipt:
        return Path(env_receipt)
    return Path.home() / ".kaiwu-ops" / "cos-prune-receipt.json"


def write_receipt(receipt_data: dict):
    receipt_file = get_receipt_path()
    try:
        receipt_file.parent.mkdir(parents=True, exist_ok=True)
        tmp_file = receipt_file.with_suffix(".json.tmp")
        with open(tmp_file, "w", encoding="utf-8") as f:
            json.dump(receipt_data, f, ensure_ascii=False, indent=2)
        tmp_file.replace(receipt_file)
    except Exception as e:
        print(f"[WARN] Failed to write receipt to {receipt_file}: {e}", file=sys.stderr)


def classify_exception(err: Exception) -> tuple[int, str]:
    """Classify exception into structured exit code and outcome category."""
    err_str = str(err)
    err_cls = err.__class__.__name__

    # 1. Path not found
    if isinstance(err, FileNotFoundError) or "Missing cos.env file" in err_str:
        return EXIT_ERR_PATH_NOT_FOUND, "path_not_found"

    # 2. Dependency missing
    if isinstance(err, (ModuleNotFoundError, ImportError)):
        return EXIT_ERR_DEPENDENCY_MISSING, "dependency_missing"

    # 3. Credential invalid (CosServiceError 403 / InvalidAccessKeyId / etc.)
    if hasattr(err, "get_error_code") and err.get_error_code():
        code = str(err.get_error_code())
        if code in ("InvalidAccessKeyId", "AccessDenied", "SignatureDoesNotMatch", "InvalidSecret", "NoSuchBucket"):
            return EXIT_ERR_CREDENTIAL_INVALID, "credential_invalid"
    if hasattr(err, "get_status_code") and err.get_status_code() == 403:
        return EXIT_ERR_CREDENTIAL_INVALID, "credential_invalid"
    if any(k in err_str for k in ("InvalidAccessKeyId", "AccessDenied", "SignatureDoesNotMatch", "Missing COS_SECRET_ID", "Missing COS_SECRET_KEY")):
        return EXIT_ERR_CREDENTIAL_INVALID, "credential_invalid"

    # 4. Network unreachable / timeout
    if any(k in err_cls for k in ("Timeout", "ConnectionError", "ConnectTimeout", "ReadTimeout", "SSLError", "CosClientError")):
        return EXIT_ERR_NETWORK_UNREACHABLE, "network_unreachable"
    if any(k in err_str for k in ("timed out", "Connection refused", "NameResolutionError", "Failed to establish a new connection", "getaddrinfo failed")):
        return EXIT_ERR_NETWORK_UNREACHABLE, "network_unreachable"

    # 5. Generic execution error
    return EXIT_ERR_GENERIC, "business_execution_error"


def load_cos_client():
    if not Path(ENV_FILE).exists():
        raise FileNotFoundError(f"Missing cos.env file: {ENV_FILE}")

    spec = importlib.util.spec_from_file_location(
        "upload_release_to_cos", Path(__file__).with_name("upload-release-to-cos.py")
    )
    if not spec or not spec.loader:
        raise ImportError(f"Cannot load upload-release-to-cos.py from {Path(__file__).parent}")
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
    parser = argparse.ArgumentParser(description="Prune old Kaiwu release artifacts from Tencent Cloud COS")
    parser.add_argument("--keep", type=int, default=2)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--preflight-only", action="store_true", help="Perform preflight canary probe and exit")
    args = parser.parse_args()

    t_start = time.time()
    mode_str = "PREFLIGHT" if args.preflight_only else ("APPLY" if args.apply else "DRY-RUN")

    if args.keep < 1:
        receipt = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "task": "WUJI-Kaiwu-COS-Prune",
            "mode": mode_str,
            "exit_code": EXIT_ERR_GENERIC,
            "status": "failure",
            "error_category": "invalid_argument",
            "error_message": "--keep must be >= 1",
        }
        write_receipt(receipt)
        sys.exit(EXIT_ERR_GENERIC)

    try:
        # 1. Preflight Canary Check
        client, bucket = load_cos_client()
        t_preflight_start = time.time()
        latest_resp = client.get_object(Bucket=bucket, Key=LATEST_KEY)
        latest_bytes = latest_resp["Body"].get_raw_stream().read()
        latest = json.loads(latest_bytes.decode("utf-8"))
        preflight_ms = int((time.time() - t_preflight_start) * 1000)

        pinned = str(latest.get("version", "")).strip()
        if not VERSION_RE.match(pinned):
            raise ValueError(f"refusing to prune: latest.json version is not a plain semver ({pinned!r})")

        if args.preflight_only:
            duration_ms = int((time.time() - t_start) * 1000)
            receipt = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "task": "WUJI-Kaiwu-COS-Prune",
                "mode": mode_str,
                "exit_code": EXIT_SUCCESS,
                "status": "success",
                "error_category": None,
                "error_message": None,
                "preflight": {
                    "ok": True,
                    "env_file": ENV_FILE,
                    "bucket": bucket,
                    "canary_key": LATEST_KEY,
                    "pinned_cli": pinned,
                    "duration_ms": preflight_ms,
                },
                "metrics": {
                    "duration_ms": duration_ms,
                },
            }
            write_receipt(receipt)
            print(f"[PREFLIGHT-OK] bucket={bucket} pinned(cli)={pinned} canary_duration={preflight_ms}ms")
            sys.exit(EXIT_SUCCESS)

        # 2. Parallel fetch for installer keys and platform latest keys
        fallback_versions = set()

        def fetch_installer(key):
            try:
                resp = client.get_object(Bucket=bucket, Key=key)
                text = resp["Body"].get_raw_stream().read().decode("utf-8", "replace")
                return text
            except Exception:
                return ""

        def fetch_json_version(key):
            try:
                resp = client.get_object(Bucket=bucket, Key=key)
                data = json.loads(resp["Body"].get_raw_stream().read().decode("utf-8"))
                return str(data.get("version", "")).strip()
            except Exception:
                return ""

        with ThreadPoolExecutor(max_workers=5) as pool:
            inst_futures = {pool.submit(fetch_installer, k): k for k in INSTALLER_KEYS}
            ios_future = pool.submit(fetch_json_version, IOS_LATEST_KEY)
            android_future = pool.submit(fetch_json_version, ANDROID_LATEST_KEY)

            for fut in inst_futures:
                text = fut.result()
                if text:
                    fallback_versions.update(re.findall(r"releases/cli/(\d+\.\d+\.\d+)/", text))
                    fallback_versions.update(re.findall(r'DEFAULT_VERSION\s*=\s*"(\d+\.\d+\.\d+)"', text))

            ios_pinned = ios_future.result()
            android_pinned = android_future.result()

        print(
            f"bucket={bucket} keep={args.keep} pinned(cli)={pinned} "
            f"pinned(ios)={ios_pinned} pinned(android)={android_pinned} "
            f"installer-fallbacks={sorted(fallback_versions)} mode={mode_str}"
        )

        # 3. Parallel fetch keys for versioned prefixes
        with ThreadPoolExecutor(max_workers=len(VERSIONED_PREFIXES)) as pool:
            prefix_keys_map = dict(
                zip(VERSIONED_PREFIXES, pool.map(lambda p: list_keys(client, bucket, p), VERSIONED_PREFIXES))
            )

        total_bytes = 0
        total_freed_count = 0
        versions_summary = {}

        for prefix in VERSIONED_PREFIXES:
            by_version = {}
            for key, size in prefix_keys_map.get(prefix, []):
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

            sorted_keep = sorted(keep, key=version_tuple, reverse=True)
            versions_summary[prefix] = {
                "all_versions": versions,
                "kept_versions": sorted_keep,
            }
            print(f"\n{prefix} versions={versions} keep={sorted_keep}")

            for version in versions:
                if version in keep:
                    continue
                for key, size in by_version[version]:
                    total_bytes += size
                    total_freed_count += 1
                    print(f"  {'DELETE' if args.apply else 'would delete'} {key} ({size} bytes)")
                    if args.apply:
                        client.delete_object(Bucket=bucket, Key=key)

        freed_mb = total_bytes / 1024 / 1024
        print(f"\n{'deleted' if args.apply else 'would free'} {freed_mb:.1f} MB")

        duration_ms = int((time.time() - t_start) * 1000)
        receipt = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "task": "WUJI-Kaiwu-COS-Prune",
            "mode": mode_str,
            "exit_code": EXIT_SUCCESS,
            "status": "success",
            "error_category": None,
            "error_message": None,
            "preflight": {
                "ok": True,
                "env_file": ENV_FILE,
                "bucket": bucket,
                "canary_key": LATEST_KEY,
                "duration_ms": preflight_ms,
            },
            "metrics": {
                "keep": args.keep,
                "pinned_cli": pinned,
                "pinned_ios": ios_pinned,
                "pinned_android": android_pinned,
                "freed_items_count": total_freed_count,
                "freed_bytes": total_bytes,
                "freed_mb": round(freed_mb, 2),
                "versions_summary": versions_summary,
                "duration_ms": duration_ms,
            },
        }
        write_receipt(receipt)
        sys.exit(EXIT_SUCCESS)

    except Exception as exc:
        exit_code, error_category = classify_exception(exc)
        duration_ms = int((time.time() - t_start) * 1000)
        receipt = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "task": "WUJI-Kaiwu-COS-Prune",
            "mode": mode_str,
            "exit_code": exit_code,
            "status": "failure",
            "error_category": error_category,
            "error_message": str(exc),
            "preflight": {
                "ok": False,
                "env_file": ENV_FILE,
            },
            "metrics": {
                "duration_ms": duration_ms,
            },
        }
        write_receipt(receipt)
        print(
            f"[ERROR] Prune failed (exit_code={exit_code}, category={error_category}): {exc}",
            file=sys.stderr,
        )
        sys.exit(exit_code)


if __name__ == "__main__":
    main()
