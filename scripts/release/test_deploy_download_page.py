# Copyright (c) 2026 Qianyuan Wuji Group (WUJILabs)
"""Offline tests for deploy_download_page.py (no network, no server)."""
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location('deploy', Path(__file__).with_name('deploy_download_page.py'))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


def test_local_page_exists_and_has_download_rows():
    html = deploy.LOCAL.read_text(encoding='utf-8')
    for key in ('desktop-windows', 'desktop-macos', 'desktop-linux', 'android', 'ios'):
        assert f'data-p="{key}"' in html


def test_backup_path_is_next_to_live_file():
    assert deploy.backup_path('20261021120000') == deploy.REMOTE + '.bak-20261021120000'


def test_expected_magic_by_extension():
    assert deploy.expected_magic('kaiwu-desktop-v1-windows-x64.zip') == b'PK\x03\x04'
    assert deploy.expected_magic('kaiwu-desktop-v1-linux-x64.AppImage') == b'\x7fELF'
    assert deploy.expected_magic('kaiwu-desktop-v1-macos-intel.dmg') is None


def test_dry_run_touches_nothing(capsys):
    assert deploy.main(['--dry-run']) == 0
    assert 'dry-run' in capsys.readouterr().out
