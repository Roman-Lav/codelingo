#!/usr/bin/env python3
"""Build CodeLingo for distribution. No dependencies (stdlib only).

Outputs:
  dist/web/            — deployable PWA (everything except tests). Host it on any HTTPS
                         static host (GitHub Pages, Netlify, Cloudflare Pages) to get
                         offline mode + "Add to Home Screen"/"Install app".
  dist/codelingo.html  — one self-contained file: CSS, JS and icons inlined. Opens from
                         disk with a double click, can be sent to a phone and opened there.
                         Progress is kept in localStorage of whatever opened it.

Usage: python3 tools/build.py
"""
import base64
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "codelingo"
DIST = ROOT / "dist"
WEB = DIST / "web"
SINGLE = DIST / "codelingo.html"


def build_web():
    if WEB.exists():
        shutil.rmtree(WEB)
    shutil.copytree(SRC, WEB, ignore=shutil.ignore_patterns("tests", ".*", "__pycache__"))
    # Static hosts like GitHub Pages run Jekyll by default; it is not needed here.
    (WEB / ".nojekyll").write_text("")


def data_uri(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode()


def inline_js(src: str) -> str:
    # "</script" inside a JS string would close the inline <script> tag early.
    # "<\/script" means the same thing to JS (in strings, templates and regexes).
    return src.replace("</script", "<\\/script")


def build_single():
    html = (SRC / "index.html").read_text(encoding="utf-8")

    def css(m):
        return "<style>\n" + (SRC / m.group(1)).read_text(encoding="utf-8") + "\n</style>"

    def js(m):
        return "<script>\n" + inline_js((SRC / m.group(1)).read_text(encoding="utf-8")) + "\n</script>"

    def icon(m):
        return m.group(1) + data_uri(SRC / m.group(2)) + '"'

    html, n_css = re.subn(r'<link rel="stylesheet" href="([^"]+)">', css, html)
    html, n_js = re.subn(r'<script src="([^"]+)"></script>', js, html)
    html, n_ic = re.subn(r'(<link rel="(?:apple-touch-icon|icon)"[^>]*href=")([^"]+\.png)"', icon, html)
    # A manifest cannot be loaded from a local file; the single file is not an installable PWA.
    html = re.sub(r'\s*<link rel="manifest"[^>]*>', "", html)

    if n_css != 1 or n_js < 2 or n_ic < 1:
        sys.exit(f"build: unexpected index.html structure (css={n_css}, js={n_js}, icons={n_ic})")
    # Check only real markup: course code samples inside the inlined scripts contain src/href too.
    markup = re.sub(r"<(script|style)>.*?</\1>", "", html, flags=re.S)
    left = re.findall(r'(?:src|href)="(?!data:|#)([^"]+)"', markup)
    if left:
        sys.exit(f"build: external references left in single file: {left}")
    SINGLE.write_text(html, encoding="utf-8")


def main():
    DIST.mkdir(exist_ok=True)
    build_web()
    build_single()
    size = SINGLE.stat().st_size // 1024
    print(f"OK  dist/web/  (PWA for HTTPS hosting)")
    print(f"OK  dist/codelingo.html  ({size} KB, works offline from a file)")


if __name__ == "__main__":
    main()
