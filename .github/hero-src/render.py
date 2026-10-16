"""Render the README hero: python .github/hero-src/render.py  ->  .github/hero.png

s2/s3/s4.png are real-device captures; s3.png carries an old domain, so run patch_s3.py first
(writes s3-fixed.png, which hero.html uses) whenever s3.png or the domain changes.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1700, 'height': 1132})
    pg.goto(HERE.joinpath('hero.html').as_uri()); pg.wait_for_timeout(800)
    pg.locator('#c').screenshot(path=str(HERE.parent / 'hero.png'), omit_background=True); b.close()
