#!/usr/bin/env python3
"""Layout check for CodeLingo: every screen on a matrix of real device sizes.

For each device it emulates the viewport, device pixel ratio, touch and the safe-area
insets (notch / home indicator), walks through the app's screens and measures:
  overflow   page wider than the screen
  offscreen  element sticking out left/right
  safe-area  header/top bar under the notch, buttons under the home indicator
  covered    content hidden behind the fixed tab bar or lesson footer
  clipped    text cut off inside its box
  overlap    sibling elements drawn on top of each other
  tap        tap target smaller than 44x44
Screenshots (viewport-sized, like a phone shows it) go to dist/layout/<device>/<screen>.png.

Uses the Chrome DevTools client from .claude/skills/responsive-check/scripts/shoot.py.
Needs only python3 and Google Chrome.
Usage: python3 tools/layout-check.py [--devices se1,iphone15] [--lang ru] [--dark] [--code l]
Exit code 1 if any problem is found.
"""
import argparse
import base64
import functools
import http.server
import json
import os
import socketserver
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / ".claude/skills/responsive-check/scripts"))
import shoot  # noqa: E402  (vendored, stdlib-only CDP client)

# name: (css width, css height, dpr, safe top, safe bottom, safe left, safe right, mobile)
DEVICES = {
    "se1":        (320, 568, 2, 20, 0, 0, 0, True),      # iPhone SE 1st gen — narrowest
    "se3":        (375, 667, 2, 20, 0, 0, 0, True),      # iPhone SE 2/3, 8
    "mini":       (375, 812, 3, 50, 34, 0, 0, True),     # iPhone 12/13 mini
    "iphone15":   (393, 852, 3, 59, 34, 0, 0, True),     # iPhone 14 Pro/15/16
    "promax":     (430, 932, 3, 59, 34, 0, 0, True),     # iPhone 15/16 Pro Max
    "android":    (360, 800, 3, 24, 16, 0, 0, True),     # typical Android, gesture nav
    "landscape":  (852, 393, 3, 0, 21, 59, 59, True),    # iPhone 15 rotated (manifest says portrait; PWA in Safari can still rotate)
    "ipad-mini":  (744, 1133, 2, 24, 20, 0, 0, True),
    "ipad":       (820, 1180, 2, 24, 20, 0, 0, True),
    "desktop":    (1280, 800, 1, 0, 0, 0, 0, False),
}
SCREENS = ["learn", "course", "lesson", "lesson-checked", "lesson-hint", "lesson-typed", "profile", "settings"]

# Navigation: each screen is reached from a fresh home screen.
NAV_JS = r"""
(async (screen) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const click = (el) => { if (!el) throw new Error('missing element for ' + screen); el.click(); };
  const typedCourse = () => {
    const c = window.COURSES.find((x) => x.lessons[0].tasks.some((t) => t.t === 'f' || t.t === 'w'));
    return c ? c.id : window.COURSES[0].id;
  };
  const openLesson = async (id) => {
    click($(`[data-act="course"][data-id="${id}"]`)); await sleep(50);
    click($('[data-act="lesson"][data-i="0"]')); await sleep(150);
  };
  if (screen === 'learn') return 'ok';
  if (screen === 'course') { click($('[data-act="course"]')); return 'ok'; }
  if (screen === 'profile' || screen === 'settings') { click($(`[data-act="tab"][data-tab="${screen}"]`)); return 'ok'; }
  if (screen.startsWith('lesson')) {
    await openLesson(screen === 'lesson-typed' ? typedCourse() : window.COURSES[0].id);
    if (screen === 'lesson-hint') { click($('#lmascot')); await sleep(200); return 'ok'; }
    const answerAny = () => {
      const opt = document.querySelector('.opt:not([disabled])');
      const tok = document.querySelector('.bank .tok:not([disabled])');
      const ans = $('#ans');
      if (opt) opt.click(); else if (tok) tok.click();
      else if (ans) { ans.value = 'x'; ans.dispatchEvent(new Event('input', { bubbles: true })); }
    };
    if (screen === 'lesson-checked') { answerAny(); await sleep(50); click($('#checkBtn')); await sleep(500); return 'ok'; }
    if (screen === 'lesson-typed') {
      for (let i = 0; i < 30 && !$('#ans'); i++) { answerAny(); await sleep(30); click($('#checkBtn')); await sleep(450); click($('#checkBtn')); await sleep(80); }
      if (!$('#ans')) return 'no typed task reached';
      $('#ans').focus();
    }
    return 'ok';
  }
  return 'unknown screen';
})
"""

MEASURE_JS = r"""
((inset) => {
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  const out = [];
  const name = (el) => {
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    const act = el.dataset && el.dataset.act ? `[${el.dataset.act}]` : '';
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls + act;
  };
  const visible = (el) => {
    if (el.closest('[hidden]')) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0;
  };
  const inLesson = !document.querySelector('#lesson').hidden;
  const scope = inLesson ? document.querySelector('#lesson') : document.body;
  const els = [...scope.querySelectorAll('*')].filter(visible).filter((el) => !el.closest('svg') || el.tagName === 'svg');

  // overflow / offscreen
  const sw = document.documentElement.scrollWidth;
  if (sw > vw + 1) out.push(['overflow', `page is ${sw}px wide, screen ${vw}px`]);
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (el.closest('pre, .symbar, .bank, .slot')) continue; // horizontally scrollable on purpose
    if (r.right > vw + 1 || r.left < -1) out.push(['offscreen', `${name(el)} spans ${Math.round(r.left)}..${Math.round(r.right)}px`]);
  }

  // safe area: interactive content must stay out of the notch and home-indicator zones
  for (const el of els.filter((e) => e.matches('button, input, textarea, select, h1, .bar'))) {
    const r = el.getBoundingClientRect();
    if (el.closest('pre, .symbar, .bank, .slot')) continue; // horizontally scrollable on purpose
    if (el.closest('.screen') && !inLesson) continue; // scrolls under the status bar by design; checked at scroll 0 below
    if (r.top < inset.top - 0.5 && r.bottom > 0) out.push(['safe-area', `${name(el)} top ${Math.round(r.top)}px < inset ${inset.top}px`]);
    if (r.bottom > vh - inset.bottom + 0.5 && r.top < vh) out.push(['safe-area', `${name(el)} bottom ${Math.round(r.bottom)}px > ${vh - inset.bottom}px (home indicator)`]);
    if (r.left < inset.left - 0.5 || r.right > vw - inset.right + 0.5) out.push(['safe-area', `${name(el)} spans ${Math.round(r.left)}..${Math.round(r.right)}px, side insets ${inset.left}/${inset.right}`]);
  }
  if (!inLesson) {
    const first = document.querySelector('.screen > *');
    if (first && first.getBoundingClientRect().top < inset.top - 0.5) out.push(['safe-area', `${name(first)} starts under the status bar`]);
  }

  // covered: at the bottom of the page the last content must be above the fixed bar
  if (!inLesson) {
    window.scrollTo(0, document.documentElement.scrollHeight);
    const bar = document.querySelector('#tabbar').getBoundingClientRect();
    const last = [...document.querySelectorAll('.screen *')].filter(visible).reduce((m, el) => Math.max(m, el.getBoundingClientRect().bottom), 0);
    if (last > bar.top + 0.5) out.push(['covered', `content ends at ${Math.round(last)}px, tab bar starts at ${Math.round(bar.top)}px`]);
    window.scrollTo(0, 0);
  } else {
    const foot = document.querySelector('.lfoot').getBoundingClientRect();
    if (foot.bottom > vh + 0.5) out.push(['covered', `lesson footer bottom ${Math.round(foot.bottom)}px is below the screen (${vh}px)`]);
    const body = document.querySelector('#lessonBody');
    if (body.getBoundingClientRect().height < 120) out.push(['covered', `lesson body only ${Math.round(body.getBoundingClientRect().height)}px tall`]);
  }

  // clipped text
  for (const el of els) {
    if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const cs = getComputedStyle(el);
    if (/(auto|scroll)/.test(cs.overflowX) || el.closest('pre, .symbar, .bank, .slot')) continue;
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && cs.display !== 'inline') out.push(['clipped', `${name(el)} text ${el.scrollWidth}px in ${el.clientWidth}px: "${el.textContent.trim().slice(0, 30)}"`]);
  }

  // overlap between siblings of flex/grid containers
  for (const p of els.filter((e) => /flex|grid/.test(getComputedStyle(e).display))) {
    const kids = [...p.children].filter(visible).filter((k) => getComputedStyle(k).position !== 'absolute' && getComputedStyle(k).position !== 'fixed');
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
      const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
      const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ix > 2 && iy > 2) out.push(['overlap', `${name(kids[i])} and ${name(kids[j])} overlap ${Math.round(ix)}x${Math.round(iy)}px`]);
    }
  }

  // tap targets
  for (const el of els.filter((e) => e.matches('button:not([disabled]), select, input:not([type=hidden]), textarea, label.sw'))) {
    if (el.matches('input[type=checkbox]') && el.closest('label.sw')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 43.5 || r.height < 43.5) out.push(['tap', `${name(el)} is ${Math.round(r.width)}x${Math.round(r.height)}px`]);
  }
  return [...new Map(out.map((x) => [x.join('|'), x])).values()];
})
"""


def serve(directory):
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass
    handler = functools.partial(Quiet, directory=str(directory))
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def evaluate(ws, expr, await_promise=False):
    res = ws.call("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=await_promise)
    if "exceptionDetails" in res:
        raise RuntimeError(res["exceptionDetails"].get("exception", {}).get("description", "JS error"))
    return res["result"].get("value")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--devices", default=",".join(DEVICES))
    ap.add_argument("--screens", default=",".join(SCREENS))
    ap.add_argument("--lang", default="ru")
    ap.add_argument("--dark", action="store_true")
    ap.add_argument("--code", default="m", choices=["s", "m", "l"])
    ap.add_argument("--out", default=str(ROOT / "dist/layout"))
    ap.add_argument("--max-lines", type=int, default=4, help="problems printed per screen")
    a = ap.parse_args()

    browser = shoot.find_browser(os.environ.get("CHROME"))
    if not browser:
        sys.exit("Google Chrome not found (set CHROME=<path>).")
    httpd = serve(ROOT / "codelingo")
    base = f"http://127.0.0.1:{httpd.server_address[1]}/index.html"
    state = {"settings": {"lang": a.lang, "theme": "dark" if a.dark else "light", "code": a.code,
                          "sound": False, "motion": False, "hints": True, "goal": 30},
             "prog": {}, "days": {}}
    proc, profile, port = shoot.start_browser(browser)
    total, summary = 0, []
    try:
        ws = shoot.page_socket(port)
        ws.call("Page.enable")
        ws.call("Page.navigate", url=base)
        ws.wait_for("Page.loadEventFired", 30)
        evaluate(ws, f"localStorage.setItem('codelingo.v1', {json.dumps(json.dumps(state))})")
        for dev in a.devices.split(","):
            w, h, dpr, st, sb, sl, sr, mobile = DEVICES[dev]
            ws.call("Emulation.setDeviceMetricsOverride", width=w, height=h, deviceScaleFactor=dpr, mobile=mobile)
            ws.call("Emulation.setTouchEmulationEnabled", enabled=mobile, maxTouchPoints=5)
            try:
                ws.call("Emulation.setSafeAreaInsetsOverride", insets={"top": st, "bottom": sb, "left": sl, "right": sr})
                inset = {"top": st, "bottom": sb, "left": sl, "right": sr}
            except RuntimeError:
                inset = {"top": 0, "bottom": 0, "left": 0, "right": 0}
                print(f"{dev}: this Chrome cannot emulate safe areas; insets not checked")
            (Path(a.out) / dev).mkdir(parents=True, exist_ok=True)
            dev_problems = 0
            for scr in a.screens.split(","):
                ws.call("Page.navigate", url=base)
                ws.wait_for("Page.loadEventFired", 30)
                time.sleep(0.15)
                nav = evaluate(ws, f"({NAV_JS})({json.dumps(scr)})", await_promise=True)
                time.sleep(0.25)
                probs = evaluate(ws, f"({MEASURE_JS})({json.dumps(inset)})") if nav == "ok" else [["nav", nav]]
                shot = ws.call("Page.captureScreenshot", format="png")
                (Path(a.out) / dev / f"{scr}.png").write_bytes(base64.b64decode(shot["data"]))
                dev_problems += len(probs)
                if probs:
                    print(f"✗ {dev} {w}x{h} / {scr}: {len(probs)}")
                    for kind, msg in probs[: a.max_lines]:
                        print(f"    {kind:9} {msg}")
                    if len(probs) > a.max_lines:
                        print(f"    … +{len(probs) - a.max_lines} more")
            total += dev_problems
            summary.append(f"{dev}:{dev_problems}")
    finally:
        proc.terminate()
        httpd.shutdown()
    print(("PASS" if total == 0 else "FAIL") + f": {total} problems  [{' '.join(summary)}]  screenshots: {a.out}")
    sys.exit(1 if total else 0)


if __name__ == "__main__":
    main()
