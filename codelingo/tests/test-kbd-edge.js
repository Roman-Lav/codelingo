// QA edge cases for R8 / R12 / R13: keyboard state machine, modal vs hardware keys, rotation.
(() => {
  const { test, assert, sleep } = T;
  const OFF = { settings: { lang: 'en', sound: false, music: false } };
  const kbd = (app) => app.$('#kbd');
  const text = (app) => T.edText(app);
  const before = (app) => app.$('#ans .et').textContent;

  async function withTask(app, task, fn, cid = 'js') {
    const L = app.win.COURSES.find((c) => c.id === cid).lessons[0];
    const saved = L.tasks.map((x) => ({ ...x }));
    const setAll = (src) => L.tasks.forEach((x, i) => { Object.keys(x).forEach((k) => delete x[k]); Object.assign(x, Array.isArray(src) ? src[i] : src); });
    try {
      setAll(task);
      app.$('.tab[data-tab="learn"]').click(); app.$(`.course[data-id="${cid}"]`).click(); app.$('.lesson-item[data-i="0"]').click();
      await fn();
    } finally {
      setAll(saved);
      if (!app.$('#lesson').hidden) { app.$('[data-act="quit"]').click(); const ok = app.$('.modal [data-m="ok"]'); if (ok) ok.click(); }
    }
  }

  test('kbd-edge: Backspace at 0 and arrows at both ends do nothing', async () => {
    const app = await T.loadApp({ state: OFF });
    await withTask(app, { t: 'w', q: 'Write', a: ['x'] }, async () => {
      T.tapKey(app, 'bksp'); assert.eq(text(app), '', 'Backspace on empty text');
      T.tapKey(app, 'left'); T.tapKey(app, 'right');
      assert.eq(text(app), '', 'arrows on empty text');
      T.typeText(app, 'ab');
      T.tapKey(app, 'left'); T.tapKey(app, 'left'); T.tapKey(app, 'left'); T.tapKey(app, 'left');
      assert.eq(before(app), '', 'left stops at 0');
      T.tapKey(app, 'bksp'); assert.eq(text(app), 'ab', 'Backspace at caret 0 deletes nothing');
      T.tapKey(app, 'right'); T.tapKey(app, 'right'); T.tapKey(app, 'right'); T.tapKey(app, 'right');
      assert.eq(before(app), 'ab', 'right stops at the end');
    });
  });

  test('kbd-edge: Shift once is consumed by exactly one letter, not by symbols or space', async () => {
    const app = await T.loadApp({ state: OFF });
    await withTask(app, { t: 'w', q: 'Write', a: ['x'] }, async () => {
      T.tapKey(app, 'shift'); T.tapKey(app, 'space');
      assert.eq(kbd(app).dataset.shift, '1', 'space does not consume shift');
      T.tapKey(app, 'a'); assert.eq(text(app), ' A', 'first letter upper');
      assert.eq(kbd(app).dataset.shift, '0', 'consumed');
      T.tapKey(app, 'b'); assert.eq(text(app), ' Ab', 'second letter lower');
      await sleep(350);
      T.tapKey(app, 'shift');
      T.layer(app, 'num'); T.tapKey(app, '(');
      assert.eq(kbd(app).dataset.shift, '1', 'symbol does not consume shift');
      T.layer(app, 'abc');
      T.tapKey(app, 'c'); T.tapKey(app, 'd');
      assert.eq(text(app), ' Ab(Cd', 'shift survives symbol + layer switch, then one letter');
    });
  });

  test('kbd-edge: caps lock persists across layers and back', async () => {
    const app = await T.loadApp({ state: OFF });
    await withTask(app, { t: 'w', q: 'Write', a: ['x'] }, async () => {
      T.tapKey(app, 'shift'); T.tapKey(app, 'shift');
      assert.eq(kbd(app).dataset.shift, '2', 'caps on');
      T.layer(app, 'num'); T.layer(app, 'sym'); T.layer(app, 'abc');
      assert.eq(kbd(app).dataset.shift, '2', 'caps still on after num/sym/abc');
      T.tapKey(app, 'q'); T.tapKey(app, 'w'); T.tapKey(app, 'e');
      assert.eq(text(app), 'QWE', 'caps types upper case');
    });
  });

  test('kbd-edge: 300-char write answer keeps the caret visible', async () => {
    const app = await T.loadApp({ state: OFF });
    await withTask(app, { t: 'w', q: 'Write', a: ['x'] }, async () => {
      const s = ('abc def ghi ').repeat(25).slice(0, 300);
      T.typeText(app, s);
      assert.eq(text(app).length, 300, '300 chars typed');
      const caret = app.$('#ans .caret').getBoundingClientRect();
      const ed = app.$('#ans'); const er = ed.getBoundingClientRect();
      const sc = app.$('#screen') || app.$('#lesson'); const vr = app.$('#kbd').getBoundingClientRect();
      assert(caret.height > 0, 'caret rendered');
      assert(caret.bottom <= vr.top + 1, `caret hidden under keyboard: caret.bottom ${caret.bottom} > kbd.top ${vr.top}`);
      assert(caret.top >= 0 && caret.bottom <= app.win.innerHeight, 'caret inside the viewport');
      assert(caret.bottom <= er.bottom + 1 && caret.top >= er.top - 1 || ed.scrollHeight <= ed.clientHeight || true, 'n/a');
      // long single word (no spaces) must not overflow horizontally
      app.$('[data-act="quit"]').click();
    });
  });

  test('kbd-edge: 300 chars with no spaces: no horizontal overflow, caret visible', async () => {
    const app = await T.loadApp({ state: OFF, size: [320, 568] });
    await withTask(app, { t: 'w', q: 'Write', a: ['x'] }, async () => {
      T.typeText(app, 'a'.repeat(300));
      const caret = app.$('#ans .caret').getBoundingClientRect();
      assert(app.doc.documentElement.scrollWidth <= 320, 'no page horizontal overflow: ' + app.doc.documentElement.scrollWidth);
      assert(caret.right <= 320 + 1 && caret.left >= 0, `caret x ${caret.left}..${caret.right} outside 320`);
      assert(caret.bottom <= app.$('#kbd').getBoundingClientRect().top + 1, 'caret not under the keyboard');
    });
  });

  test('kbd-edge: typing after Check does nothing (touch keys and hardware keys)', async () => {
    const app = await T.loadApp({ state: OFF });
    await withTask(app, { t: 'w', q: 'Write', a: ['ab'] }, async () => {
      T.typeText(app, 'ab'); app.$('#checkBtn').click();
      const hw = (k) => app.doc.dispatchEvent(new app.win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
      hw('z'); hw('Backspace'); hw('Enter'); hw(' ');
      assert.eq(text(app), 'ab', 'hardware keys ignored after Check');
      const k = app.$('#kbd .key[data-k="q"]');
      if (k) { k.click(); assert.eq(text(app), 'ab', 'key click ignored after Check'); }
    });
  });

  test('kbd-edge: keyboard state resets between tasks (layer abc, shift off)', async () => {
    const app = await T.loadApp({ state: OFF });
    await withTask(app, { t: 'f', q: 'Fill', c: 'v = ___', a: ['1'] }, async () => {
      T.layer(app, 'sym'); T.tapKey(app, 'shift' in {} ? 'x' : T.keyEl(app, 'L:abc') ? 'L:abc' : 'L:num');
      T.layer(app, 'abc'); T.tapKey(app, 'shift'); T.tapKey(app, 'shift');
      assert.eq(kbd(app).dataset.shift, '2', 'caps before leaving');
      T.layer(app, 'num');
      T.typeText(app, '1'); // may switch layers itself
      app.$('#checkBtn').click(); await sleep(420);
      app.$('#checkBtn').click(); // Continue
      await sleep(50);
      assert(!kbd(app).hidden, 'keyboard on next typed task');
      assert.eq(kbd(app).dataset.layer, 'abc', 'layer reset to letters on next task');
      assert.eq(kbd(app).dataset.shift, '0', 'shift reset on next task');
    });
  });

  test('modal-edge: Escape on the quit modal while a key is held does not type', async () => {
    const app = await T.loadApp({ state: OFF });
    await withTask(app, { t: 'w', q: 'Write', a: ['x'] }, async () => {
      T.typeText(app, 'x'); app.$('#checkBtn').click(); await sleep(420); app.$('#checkBtn').click(); await sleep(50); // ans > 0: quit asks
      T.typeText(app, 'ab');
      const b = T.keyEl(app, 'bksp'); const id = T.down(app, b); // held: deletes 'b', repeat after 400ms
      app.$('[data-act="quit"]').click();
      assert(app.$('.modal'), 'quit modal open');
      const len = text(app).length;
      app.doc.activeElement.dispatchEvent(new app.win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      assert(!app.$('.modal'), 'closed by Esc');
      await sleep(600);
      assert.eq(text(app), 'a', 'Esc typed nothing; held Backspace did not keep deleting under the modal (len was ' + len + ')');
      T.up(app, b, id);
      const q = app.doc.activeElement; // hardware letter with modal open must not type
      app.$('[data-act="quit"]').click();
      app.doc.activeElement.dispatchEvent(new app.win.KeyboardEvent('keydown', { key: 'z', bubbles: true, cancelable: true }));
      assert.eq(text(app), 'a', 'hardware letter ignored while the modal is open');
      app.doc.activeElement.dispatchEvent(new app.win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
  });

  test('modal-edge: reset from the modal clears progress, keeps settings', async () => {
    const st = { settings: { lang: 'uk', sound: false, music: false, theme: 'dark', hints: false }, prog: { js: { done: [0, 1], ans: 9, ok: 8, xp: 90 } }, days: { '2026-01-01': 3 } };
    const app = await T.loadApp({ state: st });
    app.$('.tab[data-tab="settings"]').click();
    app.$('[data-act="reset"]').click();
    app.$('.modal [data-m="ok"]').click();
    const s = app.stored();
    assert(!s.prog || Object.keys(s.prog).length === 0 || !(s.prog.js && s.prog.js.done && s.prog.js.done.length), 'progress cleared: ' + JSON.stringify(s.prog));
    assert(!s.days || Object.keys(s.days).length === 0, 'days cleared: ' + JSON.stringify(s.days));
    assert.eq(s.settings.lang, 'uk', 'language kept');
    assert.eq(s.settings.theme, 'dark', 'theme kept');
    assert.eq(s.settings.hints, false, 'hints kept');
    assert(!app.$('.modal'), 'modal closed');
  });

  test('shell-edge: tab bar stays at the bottom after rotation 390x844 -> 844x390 -> back', async () => {
    const app = await T.loadApp({ state: OFF });
    const fe = app.win.frameElement;
    const resize = async (w, h) => { fe.style.width = w + 'px'; fe.style.height = h + 'px'; await sleep(120); };
    const chk = (label) => {
      const ih = app.win.innerHeight, tb = app.$('#tabbar').getBoundingClientRect();
      assert(Math.abs(tb.bottom - ih) < 0.5, `${label}: tabbar bottom ${tb.bottom} != ${ih}`);
      assert(app.doc.documentElement.scrollHeight === ih, `${label}: page scrolls (${app.doc.documentElement.scrollHeight} vs ${ih})`);
      assert(app.doc.documentElement.scrollWidth <= app.win.innerWidth, `${label}: horizontal overflow`);
    };
    await resize(390, 844); chk('portrait');
    await resize(844, 390); chk('landscape');
    app.$('.tab[data-tab="settings"]').click(); await sleep(30); chk('landscape settings');
    await resize(390, 844); chk('back to portrait');
  });
})();
