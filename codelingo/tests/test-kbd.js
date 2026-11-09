// R13: custom editor + in-app keyboard. No native input ever gets focus in a lesson.
(() => {
  const { test, assert, collector, sleep } = T;
  const OFF = { settings: { lang: 'en', sound: false, music: false } };
  const kbd = (app) => app.$('#kbd');
  const text = (app) => T.edText(app);
  // Text before the caret = the first .et span.
  const beforeCaret = (app) => app.$('#ans .et').textContent;
  const bg = (app, el) => app.win.getComputedStyle(el).backgroundColor;

  // Run `fn` with every task of lesson 1 of `cid` replaced by `task` (restored afterwards).
  async function withTask(app, task, fn, cid = 'js') {
    const L = app.win.COURSES.find((c) => c.id === cid).lessons[0];
    const saved = L.tasks.map((x) => ({ ...x }));
    try {
      L.tasks.forEach((x) => { Object.keys(x).forEach((k) => delete x[k]); Object.assign(x, task); });
      app.$('.tab[data-tab="learn"]').click(); app.$(`.course[data-id="${cid}"]`).click(); app.$('.lesson-item[data-i="0"]').click();
      await fn();
    } finally {
      L.tasks.forEach((x, i) => { Object.keys(x).forEach((k) => delete x[k]); Object.assign(x, saved[i]); });
      if (!app.$('#lesson').hidden) { app.$('[data-act="quit"]').click(); const ok = app.$('.modal [data-m="ok"]'); if (ok) ok.click(); }
    }
  }
  function fakeAudio(win) {
    const log = { osc: 0 };
    const node = () => ({ connect() {}, disconnect() {} });
    const param = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {}, value: 0 });
    win.AudioContext = class { constructor() { this.state = 'running'; this.currentTime = 0; this.destination = node(); } resume() { return Promise.resolve(); } suspend() { return Promise.resolve(); } createGain() { const g = node(); g.gain = param(); return g; } createOscillator() { const o = node(); o.frequency = param(); o.start = () => {}; o.stop = () => {}; log.osc++; return o; } };
    win.webkitAudioContext = undefined;
    return log;
  }
  const noNativeInput = (app, where, c) => {
    c.check(!app.$('#lesson input, #lesson textarea, #lesson select, [contenteditable]:not([contenteditable="false"])'), `${where}: native input or contenteditable in the lesson`);
    const a = app.doc.activeElement;
    c.check(!a || !(a.matches('input, textarea, select') || a.isContentEditable), `${where}: activeElement is ${a && a.tagName}`);
  };

  test('kbd: data — every fill/write answer can be typed on the keyboard (no newline in fill answers)', async () => {
    const app = await T.loadApp();
    const KBD = app.win.__codelingo.KBD;
    const keys = new Set([].concat(...Object.values(KBD).map((l) => [].concat(...l))).filter((k) => k.length === 1));
    const c = collector();
    for (const course of window.COURSES) course.lessons.forEach((l, li) => l.tasks.forEach((t, ti) => {
      if (t.t !== 'f' && t.t !== 'w') return;
      const a = String(t.a[0]);
      if (t.t === 'f') c.check(!a.includes('\n'), `${course.id} L${li + 1} t${ti + 1}: newline in a fill answer (Enter = Check)`);
      for (const ch of a) if (ch !== ' ' && ch !== '\n' && !keys.has(ch.toLowerCase())) c.check(false, `${course.id} L${li + 1} t${ti + 1}: ${JSON.stringify(ch)} not on the keyboard`);
    }));
    c.done();
  });

  test('kbd: type a full write answer — caret moves, shift once, caps lock, layers, Tab, backspace, Enter', async () => {
    const app = await T.loadApp({ state: OFF });
    await withTask(app, { t: 'w', q: 'Write', a: ['if (OK) {\n  Ab = 1\n}'] }, async () => {
      assert(!kbd(app).hidden && kbd(app).dataset.layer === 'abc', 'letters layer on open');
      assert(app.$('#checkBtn').disabled, 'Check disabled while empty');
      T.tapKey(app, 'f'); T.tapKey(app, 'left'); T.tapKey(app, 'i');
      assert.eq(text(app), 'if', 'left arrow + insert before the caret');
      T.tapKey(app, 'right'); T.tapKey(app, 'right'); // already at the end: stays there
      assert.eq(beforeCaret(app), 'if', 'right arrow stops at the end');
      T.tapKey(app, 'space');
      T.layer(app, 'num'); T.tapKey(app, '(');
      T.layer(app, 'abc');
      // caps lock: double tap within 300 ms
      T.tapKey(app, 'shift'); T.tapKey(app, 'shift');
      assert.eq(kbd(app).dataset.shift, '2', 'double tap = caps lock');
      assert.eq(T.keyEl(app, 'shift').getAttribute('aria-pressed'), 'true', 'caps: aria-pressed');
      T.tapKey(app, 'o'); T.tapKey(app, 'k');
      assert.eq(text(app), 'if (OK', 'caps lock stays on for several letters');
      T.tapKey(app, 'shift'); assert.eq(kbd(app).dataset.shift, '0', 'tap turns caps lock off');
      T.layer(app, 'num'); T.tapKey(app, ')'); T.tapKey(app, 'space'); T.tapKey(app, '{');
      T.tapKey(app, 'enter');
      T.tapKey(app, 'tab');
      assert.eq(text(app), 'if (OK) {\n  ', 'Enter = new line, Tab = 2 spaces in JS');
      T.layer(app, 'abc');
      T.tapKey(app, 'shift'); assert.eq(kbd(app).dataset.shift, '1', 'one tap = next letter');
      await sleep(320); // not a double tap
      T.tapKey(app, 'a'); T.tapKey(app, 'b');
      assert(text(app).endsWith('Ab'), 'shift once: only the next letter is upper case: ' + JSON.stringify(text(app)));
      assert.eq(kbd(app).dataset.shift, '0', 'shift released after one letter');
      T.tapKey(app, 'x'); T.tapKey(app, 'bksp');
      assert(text(app).endsWith('Ab'), 'backspace deletes before the caret');
      T.typeText(app, ' = 1\n}');
      assert.eq(text(app), 'if (OK) {\n  Ab = 1\n}', 'full text');
      assert(!app.$('#checkBtn').disabled, 'Check enabled');
      app.$('#checkBtn').click();
      assert(app.$('#sheet').classList.contains('ok'), 'typed answer accepted');
      assert(kbd(app).hidden, 'keyboard hidden after Check');
      assert(!app.$('#ans .caret'), 'no caret after Check');
      assert.eq(app.$('#ans').getAttribute('aria-readonly'), 'true', 'read-only after Check');
    });
  });

  test('kbd: Tab is 4 spaces in Python; Enter in a fill task checks', async () => {
    const app = await T.loadApp({ state: OFF });
    await withTask(app, { t: 'w', q: 'Write', a: ['x'] }, async () => { T.tapKey(app, 'tab'); assert.eq(text(app), '    ', 'py: 4 spaces'); }, 'py');
    await withTask(app, { t: 'w', q: 'Write', a: ['x'] }, async () => { T.tapKey(app, 'tab'); assert.eq(text(app), '  ', 'js: 2 spaces'); });
    await withTask(app, { t: 'f', q: 'Fill', c: 'let v = ___;', a: ['42'] }, async () => {
      assert(app.$('pre.code.has-fill #ans.fill'), 'fill editor inline in the code block');
      assert.eq(T.keyEl(app, 'enter').getAttribute('aria-label'), 'Check', 'Enter announces Check in a fill task');
      T.typeText(app, '42');
      T.tapKey(app, 'enter');
      assert(!app.$('#sheet').hidden && app.$('#sheet').classList.contains('ok'), 'Enter = Check, answer accepted');
      assert.eq(text(app), '42', 'no newline inserted');
    });
  });

  test('kbd: holding Backspace repeats after 400 ms every 60 ms; release stops it; multi-touch is independent', async () => {
    const app = await T.loadApp({ state: OFF });
    await withTask(app, { t: 'w', q: 'Write', a: ['x'] }, async () => {
      T.typeText(app, 'abcdefghijklmnopqrstuvwxyz');
      const b = T.keyEl(app, 'bksp');
      const id = T.down(app, b);
      assert.eq(text(app).length, 25, 'one delete on press');
      assert(b.classList.contains('down'), 'pressed state while held');
      await sleep(300); assert.eq(text(app).length, 25, 'no repeat before 400 ms');
      // a second finger types while Backspace is held
      const a = T.keyEl(app, 'a'); const id2 = T.down(app, a); T.up(app, a, id2);
      await sleep(330); // ~400 + 4 x 60
      const n = text(app).length;
      assert(n <= 23 && n >= 18, `repeated deletes while held: length ${n}`);
      assert(b.classList.contains('down'), 'other finger did not release Backspace');
      T.up(app, b, id);
      assert(!b.classList.contains('down'), 'released');
      await sleep(200);
      assert.eq(text(app).length, n, 'no repeat after release');
      // pointercancel also stops the repeat
      const id3 = T.down(app, b); await sleep(450);
      b.dispatchEvent(new app.win.PointerEvent('pointercancel', { bubbles: true, pointerId: id3 }));
      const m = text(app).length; await sleep(200);
      assert.eq(text(app).length, m, 'no repeat after pointercancel');
    });
  });

  test('kbd: pointerdown is preventDefault-ed; a key click after the press does not type twice', async () => {
    const app = await T.loadApp({ state: OFF });
    await withTask(app, { t: 'w', q: 'Write', a: ['x'] }, async () => {
      const k = T.keyEl(app, 'q');
      const ev = new app.win.PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 77, pointerType: 'touch' });
      k.dispatchEvent(ev);
      assert(ev.defaultPrevented, 'pointerdown default prevented (no focus, no zoom)');
      T.up(app, k, 77);
      k.click(); // the compatibility click that follows a tap
      assert.eq(text(app), 'q', 'one character per tap');
      assert(app.doc.activeElement === app.doc.body, 'the key did not take focus');
      await sleep(850);
      k.click(); // keyboard / switch-control activation without a pointer
      assert.eq(text(app), 'qq', 'click without a pointer press types');
    });
  });

  test('kbd: tap in the text puts the caret at the nearest character; past the end = end', async () => {
    const app = await T.loadApp({ state: OFF });
    await withTask(app, { t: 'w', q: 'Write', a: ['x'] }, async () => {
      T.typeText(app, 'abcdef');
      const ed = app.$('#ans');
      const tn = ed.querySelector('.et').firstChild;
      const r = app.doc.createRange(); r.setStart(tn, 2); r.setEnd(tn, 3); // the "c"
      const cr = r.getBoundingClientRect(); const y = cr.top + cr.height / 2;
      const tap = (x, yy) => ed.dispatchEvent(new app.win.MouseEvent('click', { bubbles: true, clientX: x, clientY: yy }));
      tap(cr.left + 1, y); assert.eq(beforeCaret(app), 'ab', 'left half of "c" -> before it');
      tap(cr.right - 1, y); assert.eq(beforeCaret(app), 'abc', 'right half of "c" -> after it');
      T.tapKey(app, 'x'); assert.eq(text(app), 'abcxdef', 'typing goes to the tapped place');
      tap(ed.getBoundingClientRect().right - 20, y); assert.eq(beforeCaret(app), 'abcxdef', 'right of the line end -> end');
      tap(cr.left + 1, y); tap(cr.left + 1, ed.getBoundingClientRect().bottom - 10); assert.eq(beforeCaret(app), 'abcxdef', 'below the text -> end');
      T.tapKey(app, 'enter'); T.typeText(app, 'zz');
      const t2 = ed.querySelectorAll('.et')[0].firstChild; const r2 = app.doc.createRange(); r2.setStart(t2, 0); r2.setEnd(t2, 1);
      const c2 = r2.getBoundingClientRect();
      tap(c2.left + 1, c2.top + c2.height / 2); assert.eq(beforeCaret(app), '', 'first character of the first line -> start');
    });
  });

  test('kbd: no focusable native input/textarea/contenteditable in lessons; activeElement never becomes one', async () => {
    const app = await T.loadApp({ state: OFF });
    const c = collector();
    const seen = [];
    app.doc.addEventListener('focusin', (e) => seen.push(e.target.tagName + (e.target.isContentEditable ? '[ce]' : '')), true);
    for (const task of [{ t: 'f', q: 'Fill', c: 'v = ___', a: ['ab'] }, { t: 'w', q: 'Write', a: ['ab'] }]) {
      await withTask(app, task, async () => {
        noNativeInput(app, task.t + ' open', c);
        const ed = app.$('#ans');
        c.check(ed.getAttribute('role') === 'textbox' && ed.getAttribute('aria-label') === 'Your answer' && ed.getAttribute('aria-live') === 'off', `${task.t}: role/label/aria-live`);
        c.check((ed.getAttribute('aria-multiline') === 'true') === (task.t === 'w'), `${task.t}: aria-multiline`);
        c.check(ed.tabIndex < 0 && !ed.hasAttribute('tabindex'), `${task.t}: editor not focusable`);
        ed.click(); T.typeText(app, 'ab'); app.$('pre.code') && app.$('pre.code').click();
        noNativeInput(app, task.t + ' typing', c);
        app.$('#checkBtn').click();
        noNativeInput(app, task.t + ' checked', c);
      });
    }
    c.check(!seen.some((x) => /INPUT|TEXTAREA|\[ce\]/.test(x)), 'focus went to: ' + seen.join(','));
    c.done();
  });

  test('kbd: key clicks follow the Sounds setting', async () => {
    const off = await T.loadApp({ state: OFF });
    const l0 = fakeAudio(off.win);
    await withTask(off, { t: 'w', q: 'Write', a: ['x'] }, async () => { T.typeText(off, 'abc'); T.tapKey(off, 'bksp'); });
    assert.eq(l0.osc, 0, 'no key sound with Sounds off');
    const on = await T.loadApp({ state: { settings: { lang: 'en', sound: true, music: false } } });
    const l1 = fakeAudio(on.win);
    await withTask(on, { t: 'w', q: 'Write', a: ['x'] }, async () => { T.typeText(on, 'abc'); T.tapKey(on, 'bksp'); });
    assert.eq(l1.osc, 4, 'one short click per key with Sounds on');
  });

  test('kbd: hidden on MCQ and order tasks, after Check and on the finish screen', async () => {
    const app = await T.loadApp({ state: OFF });
    await withTask(app, { t: 'm', q: 'Pick', o: ['a', 'b', 'c'], a: 0 }, async () => { assert(kbd(app).hidden, 'MCQ: hidden'); });
    await withTask(app, { t: 'o', q: 'Order', a: ['a', 'b'], d: [] }, async () => { assert(kbd(app).hidden, 'order: hidden'); });
    await withTask(app, { t: 'f', q: 'Fill', c: 'v = ___', a: ['1'] }, async () => {
      assert(!kbd(app).hidden && app.$('#lesson').classList.contains('kbd-on'), 'fill: shown on open');
      T.typeText(app, '1'); app.$('#checkBtn').click();
      assert(kbd(app).hidden, 'hidden after Check');
      // every task of the lesson is this fill task: finish it
      for (let i = 0; i < 30 && !app.$('.finish'); i++) {
        await sleep(420); app.$('#checkBtn').click();
        if (app.$('.finish')) break;
        assert(!kbd(app).hidden, 'shown again on the next typed task');
        T.typeText(app, '1'); app.$('#checkBtn').click();
      }
      assert(app.$('.finish') && kbd(app).hidden, 'hidden on the finish screen');
    });
  });

  test('kbd: layout — keys fill the row, >= 42px tall, layers and shift states look different', async () => {
    const app = await T.loadApp({ state: OFF, size: [320, 568] });
    const c = collector();
    await withTask(app, { t: 'w', q: 'Write', a: ['x'] }, async () => {
      for (const layer of ['abc', 'num', 'sym']) {
        T.layer(app, layer);
        const kr = kbd(app).getBoundingClientRect();
        app.$$('#kbd .kr').forEach((row, i) => {
          const keys = [...row.children]; const first = keys[0].getBoundingClientRect(), last = keys[keys.length - 1].getBoundingClientRect();
          c.check(first.left - kr.left <= 6 && kr.right - last.right <= 6, `${layer} row ${i + 1}: keys do not fill the row (${first.left}..${last.right} in ${kr.left}..${kr.right})`);
          keys.forEach((k) => { const r = k.getBoundingClientRect(); c.check(r.height >= 42, `${layer}: key ${k.dataset.k} ${r.height}px tall`); c.check(k.scrollWidth <= k.clientWidth + 1, `${layer}: label of ${k.dataset.k} clipped`); });
        });
        const last = app.$$('#kbd .kr').pop();
        ['left', 'space', 'right', 'tab', 'enter'].forEach((k) => c.check(last.querySelector(`[data-k="${k}"]`), `${layer}: bottom row has ${k}`));
        c.check(app.$('#kbd [data-k="bksp"]'), `${layer}: has Backspace`);
        c.check(app.doc.documentElement.scrollWidth <= 320, `${layer}: no horizontal overflow`);
      }
      T.layer(app, 'abc');
      const sh = T.keyEl(app, 'shift'); const s0 = bg(app, sh);
      T.tapKey(app, 'shift'); const s1 = bg(app, sh);
      T.tapKey(app, 'shift'); const s2 = bg(app, sh);
      c.check(s0 !== s1 && s1 !== s2 && s0 !== s2, `shift off/once/caps look different: ${s0} ${s1} ${s2}`);
      c.check(T.keyEl(app, 'a').textContent === 'A', 'letters shown upper case with caps');
      const font = app.win.getComputedStyle(T.keyEl(app, 'a'));
      c.check(font.fontSize === '17px' && !/mono|Menlo/i.test(font.fontFamily), 'letter keys: R9 body font');
      c.check(app.win.getComputedStyle(T.keyEl(app, 'tab')).fontSize === '13px', 'function keys: caption size');
    });
    c.done();
  });

  test('kbd: dark theme uses dark tokens; pressed state', async () => {
    const app = await T.loadApp({ state: { settings: { lang: 'en', sound: false, music: false, theme: 'dark' } } });
    await withTask(app, { t: 'w', q: 'Write', a: ['x'] }, async () => {
      const k = T.keyEl(app, 'q'); const cs = app.win.getComputedStyle(k);
      assert.eq(cs.backgroundColor, 'rgb(36, 23, 11)', 'key = dark --surface');
      assert.eq(cs.color, 'rgb(247, 244, 239)', 'key text = dark --ink');
      assert.eq(cs.borderTopColor, 'rgb(247, 244, 239)', 'key border = dark --line');
      assert.eq(bg(app, kbd(app)), 'rgb(46, 32, 21)', 'keyboard = dark --code-bg');
      const ed = app.$('#ans');
      assert.eq(bg(app, ed), 'rgb(36, 23, 11)', 'editor = dark --surface');
      const id = T.down(app, k);
      assert.eq(bg(app, k), 'rgb(240, 151, 73)', 'pressed key = accent');
      T.up(app, k, id);
    });
  });
  test('kbd: at 320px every non-bottom key is >= 24px wide on all layers; Backspace in the bottom row of symbol layers', async () => {
    const app = await T.loadApp({ state: OFF, size: [320, 568] });
    const c = collector();
    await withTask(app, { t: 'w', q: 'Write', a: ['x'] }, async () => {
      const h0 = kbd(app).getBoundingClientRect().height;
      for (const layer of ['abc', 'num', 'sym']) {
        T.layer(app, layer);
        const rows = app.$$('#kbd .kr');
        c.check(rows.length === 4, `${layer}: 4 rows`);
        c.check(Math.abs(kbd(app).getBoundingClientRect().height - h0) < 1, `${layer}: keyboard height changed`);
        rows.slice(0, -1).forEach((row, i) => {
          c.check(row.children.length <= 11, `${layer} row ${i + 1}: ${row.children.length} keys`);
          [...row.children].forEach((k) => { const w = k.getBoundingClientRect().width; c.check(w >= 24, `${layer}: key ${k.dataset.k} is ${w.toFixed(1)}px wide`); });
        });
        const bottom = rows[rows.length - 1];
        if (layer !== 'abc') {
          c.check(bottom.lastElementChild.dataset.k === 'bksp' && bottom.children.length === 8, `${layer}: bottom row ends with Backspace (8 keys)`);
          c.check(!rows.slice(0, -1).some((r) => r.querySelector('[data-k="bksp"]')), `${layer}: no Backspace in symbol rows`);
        }
        [...bottom.children].forEach((k) => c.check(k.scrollWidth <= k.clientWidth + 1 && k.getBoundingClientRect().width >= 24, `${layer}: bottom key ${k.dataset.k} clipped or narrow`));
      }
    });
    c.done();
  });

  test('kbd: hardware keys — Enter/Space on a focused key activate it; after Continue focus leaves Check so typing works', async () => {
    const app = await T.loadApp({ state: OFF });
    await withTask(app, { t: 'w', q: 'Write', a: ['ab'] }, async () => {
      const k = T.keyEl(app, 'q'); k.focus();
      for (const key of ['Enter', ' ']) {
        const ev = new app.win.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        k.dispatchEvent(ev);
        assert(!ev.defaultPrevented, `${JSON.stringify(key)} on a focused key is left to the button`);
      }
      assert.eq(text(app), '', 'the global handler typed nothing');
      await sleep(850); k.click(); // the activation the browser does for Enter/Space
      assert.eq(text(app), 'q', 'activation types the key');
      T.tapKey(app, 'bksp'); T.typeText(app, 'ab');
      const btn = app.$('#checkBtn'); btn.focus(); btn.click();
      assert(app.$('#sheet').classList.contains('ok'), 'checked');
      await sleep(420); btn.focus(); btn.click(); // Continue -> next task (the same write task)
      assert(app.doc.activeElement === app.doc.body, 'focus left Check on the new task: ' + app.doc.activeElement.tagName);
      app.doc.body.dispatchEvent(new app.win.KeyboardEvent('keydown', { key: 'z', bubbles: true, cancelable: true }));
      assert.eq(text(app), 'z', 'hardware typing works on the next task');
    });
  });

  test('kbd: holding Backspace clicks once, not on every repeat', async () => {
    const app = await T.loadApp({ state: { settings: { lang: 'en', sound: true, music: false } } });
    const log = fakeAudio(app.win);
    await withTask(app, { t: 'w', q: 'Write', a: ['x'] }, async () => {
      T.typeText(app, 'abcdefghij');
      const n0 = log.osc;
      const b = T.keyEl(app, 'bksp'); const id = T.down(app, b); await sleep(700); T.up(app, b, id);
      assert(text(app).length <= 4, 'repeat deleted several characters: ' + text(app));
      assert.eq(log.osc - n0, 1, 'one click for the whole hold');
    });
  });

  test('kbd: the answer is announced politely ~300 ms after typing stops, not per key', async () => {
    const app = await T.loadApp({ state: OFF });
    await withTask(app, { t: 'w', q: 'Write', a: ['x'] }, async () => {
      const live = app.$('#edlive');
      assert(live && live.classList.contains('sr-only') && live.getAttribute('aria-live') === 'polite', 'polite sr-only region');
      T.tapKey(app, 'a'); await sleep(150); T.tapKey(app, 'b'); await sleep(150);
      assert.eq(live.textContent, '', 'nothing announced while typing');
      await sleep(250);
      assert.eq(live.textContent, 'ab', 'announced after the pause');
      T.tapKey(app, 'left'); await sleep(350);
      assert.eq(live.textContent, 'ab', 'caret moves do not re-announce');
    });
  });
})();
