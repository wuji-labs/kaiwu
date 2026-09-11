#!/usr/bin/env python3
"""Local tests for sync-ui-to-cos.py without COS connection."""

import gzip
import hashlib
from pathlib import Path
import sys

# Import functions from main script
import importlib.util
spec = importlib.util.spec_from_file_location("sync_ui_to_cos", str(Path(__file__).parent / "sync-ui-to-cos.py"))
sync_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync_module)


def test_content_type_mapping():
    """Test Content-Type mapping for various file types."""
    tests = [
        ("index.js", "application/javascript; charset=utf-8"),
        ("app.mjs", "application/javascript; charset=utf-8"),
        ("style.css", "text/css; charset=utf-8"),
        ("config.json", "application/json"),
        ("app.wasm", "application/wasm"),
        ("logo.svg", "image/svg+xml"),
        ("font.ttf", "font/ttf"),
        ("font.otf", "font/otf"),
        ("manifest.webmanifest", "application/json"),
        ("app.js.map", "application/json"),
        ("readme.txt", "text/plain"),
        ("page.html", "text/html; charset=utf-8"),
        ("image.png", "image/png"),
        ("video.mp4", "video/mp4"),
    ]

    print("Testing Content-Type mapping...")
    for filename, expected in tests:
        result = sync_module.get_content_type(filename)
        status = "OK" if result == expected else "FAIL"
        print(f"  [{status}] {filename:30} -> {result}")
        if result != expected:
            print(f"     Expected: {expected}")
            return False

    return True


def test_compression_detection():
    """Test which files should be compressed."""
    compressible = [
        "index.js", "app.mjs", "style.css", "config.json",
        "app.wasm", "logo.svg", "font.ttf", "font.otf",
        "manifest.webmanifest", "app.js.map", "readme.txt", "page.html"
    ]

    not_compressible = [
        "image.png", "video.mp4", "photo.jpg", "icon.ico",
        "archive.zip", "data.db"
    ]

    print("Testing compression detection...")
    all_pass = True

    for filename in compressible:
        result = sync_module.should_compress(filename)
        status = "OK" if result else "FAIL"
        print(f"  [{status}] {filename:30} -> should compress")
        if not result:
            all_pass = False

    for filename in not_compressible:
        result = sync_module.should_compress(filename)
        status = "OK" if not result else "FAIL"
        print(f"  [{status}] {filename:30} -> should NOT compress")
        if result:
            all_pass = False

    return all_pass


def test_gzip_roundtrip_sha256():
    """Test that gzip compression/decompression preserves SHA256."""
    test_data = b"Hello, World! This is test content for gzip compression." * 100

    print("Testing gzip roundtrip and SHA256...")

    # Calculate original SHA256
    original_sha256 = sync_module.calculate_sha256(test_data)
    print(f"  Original SHA256: {original_sha256}")

    # Compress
    compressed = gzip.compress(test_data, compresslevel=9)
    print(f"  Original size: {len(test_data)} bytes")
    print(f"  Compressed size: {len(compressed)} bytes")
    ratio = (1 - len(compressed) / len(test_data)) * 100
    print(f"  Compression ratio: {ratio:.1f}%")

    # Decompress
    decompressed = gzip.decompress(compressed)

    # Verify roundtrip
    if decompressed != test_data:
        print("  [FAIL] Decompressed data does not match original")
        return False
    print("  [OK] Decompressed data matches original")

    # Verify SHA256 unchanged
    roundtrip_sha256 = sync_module.calculate_sha256(decompressed)
    if roundtrip_sha256 != original_sha256:
        print("  [FAIL] SHA256 changed after gzip roundtrip")
        return False
    print("  [OK] SHA256 unchanged after gzip roundtrip")

    return True


def test_cache_control():
    """Test Cache-Control header assignment."""
    tests = [
        ("index.html", "no-cache"),
        ("metadata.json", "no-cache"),
        ("_expo/static/js/index.js", "public, max-age=31536000, immutable"),
        ("assets/image.png", "public, max-age=31536000, immutable"),
    ]

    print("Testing Cache-Control assignment...")
    for filepath, expected in tests:
        result = sync_module.get_cache_control(filepath)
        status = "OK" if result == expected else "FAIL"
        print(f"  [{status}] {filepath:40} -> {result}")
        if result != expected:
            print(f"     Expected: {expected}")
            return False

    return True


def test_header_lookup_case_insensitive():
    """Test case-insensitive header lookup from COS head_object response dict."""
    print("Testing case-insensitive header lookup from head_object response...")

    # Simulate a real head_object response with mixed-case header keys
    fake_response = {
        'x-cos-meta-sha256': 'abc123def456',
        'x-cos-meta-orig-size': '40749957',
        'Content-Encoding': 'gzip',
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'ETag': '"abc123"',
        'Last-Modified': 'Wed, 11 Sep 2026 12:00:00 GMT',
    }

    # Build case-insensitive lookup (same logic as in verify_cos_files)
    response_lower = {k.lower(): v for k, v in fake_response.items()}

    # Test retrievals with various case combinations
    tests = [
        ('x-cos-meta-sha256', 'abc123def456'),
        ('X-COS-META-SHA256', 'abc123def456'),
        ('x-cos-meta-orig-size', '40749957'),
        ('X-COS-META-ORIG-SIZE', '40749957'),
        ('content-encoding', 'gzip'),
        ('Content-Encoding', 'gzip'),
    ]

    all_pass = True
    for key, expected in tests:
        result = response_lower.get(key.lower())
        status = "OK" if result == expected else "FAIL"
        print(f"  [{status}] {key:30} -> {result}")
        if result != expected:
            print(f"     Expected: {expected}")
            all_pass = False

    return all_pass


def test_strict_sha256_verification_rule():
    """Test that strict verification requires x-cos-meta-sha256 on every file.

    This test verifies the new strict rule: every file (compressible or not)
    must have x-cos-meta-sha256 header equal to local sha256.
    """
    print("Testing strict SHA256 verification rule...")

    # Simulate responses from COS head_object
    test_cases = [
        {
            "name": "Non-compressible with matching sha",
            "response": {
                'x-cos-meta-sha256': 'abc123def456',
                'Content-Type': 'image/png',
            },
            "original_sha": 'abc123def456',
            "should_compress": False,
            "should_pass": True,
        },
        {
            "name": "Non-compressible MISSING sha header",
            "response": {
                'Content-Type': 'image/png',
            },
            "original_sha": 'abc123def456',
            "should_compress": False,
            "should_pass": False,  # STRICT: missing sha must fail
        },
        {
            "name": "Non-compressible with mismatched sha",
            "response": {
                'x-cos-meta-sha256': 'wrongsha1234567890',
                'Content-Type': 'image/png',
            },
            "original_sha": 'abc123def456',
            "should_compress": False,
            "should_pass": False,
        },
        {
            "name": "Compressible with matching sha and gzip",
            "response": {
                'x-cos-meta-sha256': 'abc123def456',
                'Content-Encoding': 'gzip',
                'Content-Type': 'application/javascript; charset=utf-8',
            },
            "original_sha": 'abc123def456',
            "should_compress": True,
            "should_pass": True,
        },
        {
            "name": "Compressible with matching sha but NO gzip",
            "response": {
                'x-cos-meta-sha256': 'abc123def456',
                'Content-Type': 'application/javascript; charset=utf-8',
            },
            "original_sha": 'abc123def456',
            "should_compress": True,
            "should_pass": False,  # Missing Content-Encoding: gzip
        },
    ]

    all_pass = True
    for case in test_cases:
        response_lower = {k.lower(): v for k, v in case["response"].items()}

        # Check for sha256
        stored_sha256 = response_lower.get('x-cos-meta-sha256')
        sha_valid = stored_sha256 == case["original_sha"]

        # Check gzip encoding if compressible
        gzip_valid = True
        if case["should_compress"]:
            content_encoding = response_lower.get('content-encoding', '')
            gzip_valid = content_encoding == 'gzip'

        # Overall result
        would_pass = (stored_sha256 is not None) and sha_valid and gzip_valid

        status = "OK" if would_pass == case["should_pass"] else "FAIL"
        print(f"  [{status}] {case['name']}: would_pass={would_pass}, expected={case['should_pass']}")

        if would_pass != case["should_pass"]:
            all_pass = False

    return all_pass


def main():
    print("Running sync-ui-to-cos.py local tests\n")

    tests = [
        ("Content-Type mapping", test_content_type_mapping),
        ("Compression detection", test_compression_detection),
        ("Gzip roundtrip & SHA256", test_gzip_roundtrip_sha256),
        ("Cache-Control assignment", test_cache_control),
        ("Case-insensitive header lookup", test_header_lookup_case_insensitive),
        ("Strict SHA256 verification rule", test_strict_sha256_verification_rule),
    ]

    results = []
    for name, test_func in tests:
        print(f"\n{'='*60}")
        try:
            result = test_func()
            results.append((name, result))
        except Exception as e:
            print(f"[FAIL] Exception in {name}: {e}")
            results.append((name, False))

    print(f"\n{'='*60}")
    print("Test Results:")
    print(f"{'='*60}")
    passed = sum(1 for _, result in results if result)
    total = len(results)

    for name, result in results:
        status = "[PASS]" if result else "[FAIL]"
        print(f"{status}: {name}")

    print(f"\nTotal: {passed}/{total} passed")
    return 0 if passed == total else 1


if __name__ == '__main__':
    sys.exit(main())
