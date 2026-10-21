# Copyright (c) 2026 Qianyuan Wuji Group (WUJILabs)
"""Offline tests for desktop_update_feed.py: minisign verification and feed merging."""
import base64
import hashlib
import importlib.util
from pathlib import Path

import pytest
from nacl.signing import SigningKey

spec = importlib.util.spec_from_file_location('feed', Path(__file__).with_name('desktop_update_feed.py'))
feed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(feed)

KEY_ID = bytes.fromhex('0102030405060708')


def make_keypair():
    sk = SigningKey.generate()
    return sk, b'Ed' + KEY_ID + bytes(sk.verify_key)


def sign(sk, data: bytes, key_id: bytes = KEY_ID) -> str:
    sig = sk.sign(hashlib.blake2b(data, digest_size=64).digest()).signature
    inner = 'untrusted comment: test\n' + base64.b64encode(b'ED' + key_id + sig).decode() + '\n'
    return base64.b64encode(inner.encode()).decode()


def test_verify_accepts_valid_signature(tmp_path):
    sk, pub = make_keypair()
    art = tmp_path / 'a.exe'
    art.write_bytes(b'installer')
    feed.verify_signature(art, sign(sk, b'installer'), pub)


def test_verify_rejects_tampered_artifact(tmp_path):
    sk, pub = make_keypair()
    art = tmp_path / 'a.exe'
    art.write_bytes(b'tampered')
    with pytest.raises(Exception):
        feed.verify_signature(art, sign(sk, b'installer'), pub)


def test_verify_rejects_foreign_key(tmp_path):
    sk, pub = make_keypair()
    art = tmp_path / 'a.exe'
    art.write_bytes(b'installer')
    with pytest.raises(SystemExit):
        feed.verify_signature(art, sign(sk, b'installer', key_id=b'\x09' * 8), pub)


def test_merge_keeps_same_version_platforms_and_drops_old_version():
    cur = {'version': '1.0.0', 'platforms': {'windows-x86_64': {'url': 'w'}}}
    merged = feed.merge_feed(cur, '1.0.0', '', {'linux-x86_64': {'url': 'l'}}, 'now')
    assert set(merged['platforms']) == {'windows-x86_64', 'linux-x86_64'}
    bumped = feed.merge_feed(cur, '1.1.0', '', {'linux-x86_64': {'url': 'l'}}, 'now')
    assert set(bumped['platforms']) == {'linux-x86_64'}
