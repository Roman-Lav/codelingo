#!/usr/bin/env python3
"""Style lint for CodeLingo: objective checks that keep the visual system consistent.

Checks codelingo/style.css and the HTML templates in codelingo/app.js:
  color      hex/rgb colors outside :root/theme token blocks (use var(--token))
  font-size  sizes outside the type scale (TYPE_SCALE) — max(16px, var(--code-size)) etc. are fine
  spacing    padding/margin/gap values not on the 4px grid
  radius     border-radius other than 0 (the 8-bit style uses square corners)
  important  !important
  inline     style="..." in templates other than dynamic widths (progress bars, fill input)
  percent    "%" shown as text in templates (product decision: no percentages in the UI)
Usage: python3 tools/style-lint.py   (exit 1 if anything is found)
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSS = ROOT / "codelingo/style.css"
APP = ROOT / "codelingo/app.js"
TYPE_SCALE = {11, 12, 13, 14, 15, 16, 18, 20, 24, 28, 32}  # px
SPACING_PROPS = re.compile(r"^(padding|margin|gap|row-gap|column-gap)(-[a-z]+)?$")


def css_rules(text):
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    depth, sel_stack, buf = 0, [], ""
    for ch in text:
        if ch == "{":
            sel_stack.append(buf.strip()); buf = ""; depth += 1
        elif ch == "}":
            if buf.strip():
                yield " ".join(sel_stack), buf
            buf = ""; sel_stack.pop() if sel_stack else None; depth -= 1
        else:
            buf += ch


def main():
    problems = []
    for sel, body in css_rules(CSS.read_text(encoding="utf-8")):
        token_block = ":root" in sel  # theme token definitions live here
        for decl in body.split(";"):
            if ":" not in decl:
                continue
            prop, val = (x.strip() for x in decl.split(":", 1))
            where = f"{sel.split()[-1] if sel else '?'} {{ {prop}: {val} }}"
            if "!important" in val and "motion" not in sel:  # reduce-motion overrides are legit
                problems.append(("important", where))
            if not token_block and not prop.startswith("--") and re.search(r"#[0-9a-fA-F]{3,8}\b|rgba?\(", val):
                problems.append(("color", where))
            if prop == "font-size" or prop == "font":
                for px in re.findall(r"(?<![\w(,-])(\d+(?:\.\d+)?)px", val.split("/")[0] if prop == "font" else val):
                    if float(px) not in TYPE_SCALE and "max(" not in val:
                        problems.append(("font-size", where))
            if SPACING_PROPS.match(prop):
                for px in re.findall(r"(?<![\w.-])(\d+(?:\.\d+)?)px", val):
                    if float(px) % 4 and float(px) not in (1, 2, 6, 10):
                        problems.append(("spacing", where))
            if prop == "border-radius" and val not in ("0", "0px", "50%"):
                problems.append(("radius", where))

    app = APP.read_text(encoding="utf-8")
    for m in re.finditer(r'style="([^"]*)"', app):
        if not re.fullmatch(r"\s*width:\s*\$\{[^}]+\}(%|ch)?;?\s*", m.group(1)):
            problems.append(("inline", f'app.js:{app[:m.start()].count(chr(10)) + 1} style="{m.group(1)}"'))
    for m in re.finditer(r"`[^`]*`", app, flags=re.S):
        tpl = m.group(0)
        for pm in re.finditer(r"\}%(?![\w;])|\d%<", tpl):
            line = app[: m.start() + pm.start()].count("\n") + 1
            problems.append(("percent", f"app.js:{line} shows a percentage in the UI"))

    for kind, where in problems:
        print(f"{kind:10} {where}")
    print(("PASS" if not problems else "FAIL") + f": {len(problems)} style problems")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
