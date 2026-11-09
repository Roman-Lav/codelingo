// R12 (in-app modal instead of window.confirm) and R8 (fixed inset shell, no vh/dvh).
(() => {
  const { test, assert, collector, sleep } = T;
  const SIZES = [[320, 568], [390, 844]];
  const key = (app, k, shift = false) => app.doc.activeElement.dispatchEvent(new app.win.KeyboardEvent('keydown', { key: k, shiftKey: shift, bubbles: true, cancelable: true }));
  const rgb = (app, el, prop) => app.win.getComputedStyle(el).getPropertyValue(prop).trim();

  // Any answer (right or wrong) through the UI, so the lesson has ans > 0.
  function answerAny(app) {
    if (app.$$('.opt').length) app.$('.opt').click();
    else if (app.$('.bank')) app.$('.bank .tok').click();
    else { const el = app.$('#ans'); el.value = 'x'; el.dispatchEvent(new app.win.Event('input', { bubbles: true })); }
    app.$('#checkBtn').click();
  }
  function openLesson(app, cid = 'js', li = 0) {
    app.$('.tab[data-tab="learn"]').click();
    app.$(`.course[data-id="${cid}"]`).click();
    app.$(`.lesson-item[data-i="${li}"]`).click();
    assert(!app.$('#lesson').hidden, 'lesson shown');
  }
  function openQuit(app) {
    openLesson(app); answerAny(app);
    app.$('[data-act="quit"]').click();
    assert(app.$('.modal'), 'quit modal shown after one answer');
  }
  function openReset(app) {
    app.$('.tab[data-tab="settings"]').click();
    app.$('[data-act="reset"]').click();
    assert(app.$('.modal'), 'reset modal shown');
  }
  const seeded = () => ({ settings: { lang: 'en', sound: false, music: false }, prog: { js: { done: [0], ans: 5, ok: 4, xp: 50 } }, days: {} });

  test('modal: structure, a11y and focus on Cancel (quit and reset)', async () => {
    const app = await T.loadApp({ state: seeded() });
    const c = collector();
    for (const [name, open, act, danger] of [['quit', openQuit, 'Quit', false], ['reset', openReset, 'Reset', true]]) {
      open(app);
      const d = app.$('.modal [role="dialog"]');
      c.check(d && d.getAttribute('aria-modal') === 'true', `${name}: role=dialog aria-modal=true`);
      const title = d && app.doc.getElementById(d.getAttribute('aria-labelledby'));
      c.check(title && title.textContent.length > 0, `${name}: aria-labelledby points to the title`);
      c.check(title && rgb(app, title, 'font-size') === '17px' && rgb(app, title, 'font-weight') === '600', `${name}: title 17/600`);
      const btns = app.$$('.modal .mbox button');
      c.check(btns.length === 2, `${name}: two buttons`);
      c.check(btns[0].textContent === 'Cancel' && btns[0].classList.contains('ghost'), `${name}: Cancel is ghost`);
      c.check(btns[1].textContent === act && btns[1].classList.contains('danger') === danger, `${name}: action "${btns[1].textContent}" danger=${danger}`);
      c.check(app.doc.activeElement === btns[0], `${name}: focus on Cancel`);
      c.check(app.$('.mback') && app.$('#screen').inert && app.$('#tabbar').inert, `${name}: backdrop and inert background`);
      btns.forEach((b) => { const r = b.getBoundingClientRect(); c.check(r.height >= 44 && r.width >= 44, `${name}: tap target ${r.width}x${r.height}`); });
      c.check(btns.every((b) => rgb(app, b, 'box-shadow').includes('3px 3px 0px')), `${name}: buttons use the one shadow`);
      c.check(rgb(app, app.$('.mbox'), 'box-shadow') === 'none', `${name}: dialog box has no extra shadow`);
      key(app, 'Escape');
      c.check(!app.$('.modal'), `${name}: closed by Esc`);
      c.check(!app.$('#screen').inert && !app.$('#lesson').inert, `${name}: background not inert after close`);
      if (name === 'quit') { c.check(!app.$('#lesson').hidden, 'quit: Esc keeps the lesson'); c.check(app.doc.activeElement === app.$('[data-act="quit"]'), 'quit: focus back on the close button'); }
      else c.check(app.doc.activeElement === app.$('[data-act="reset"]'), 'reset: focus back on the reset button');
      if (name === 'quit') { app.$('[data-act="quit"]').click(); app.$('.modal [data-m="ok"]').click(); }
    }
    c.done();
  });

  test('modal: Cancel, Esc and backdrop cancel; the action works (quit)', async () => {
    const app = await T.loadApp();
    openQuit(app);
    app.$('.modal .btn.ghost').click();
    assert(!app.$('.modal') && !app.$('#lesson').hidden, 'Cancel keeps the lesson');
    app.$('[data-act="quit"]').click(); key(app, 'Escape');
    assert(!app.$('.modal') && !app.$('#lesson').hidden, 'Esc keeps the lesson');
    app.$('[data-act="quit"]').click(); app.$('.mback').click();
    assert(!app.$('.modal') && !app.$('#lesson').hidden, 'backdrop keeps the lesson');
    app.$('[data-act="quit"]').click(); app.$('.mbox h2').click();
    assert(app.$('.modal'), 'a tap on the dialog itself does not close it');
    app.$('.modal [data-m="ok"]').click();
    assert(!app.$('.modal') && app.$('#lesson').hidden, 'Quit closes the lesson');
    assert(!app.$('body').classList.contains('in-lesson'), 'back on the course screen');
  });

  test('modal: Cancel, Esc and backdrop cancel; the action works (reset)', async () => {
    const app = await T.loadApp({ state: seeded() });
    const has = () => (app.stored().prog.js || { done: [] }).done.length;
    openReset(app); app.$('.modal .btn.ghost').click();
    assert(!app.$('.modal') && has() === 1, 'Cancel keeps progress');
    openReset(app); key(app, 'Escape');
    assert(!app.$('.modal') && has() === 1, 'Esc keeps progress');
    openReset(app); app.$('.mback').click();
    assert(!app.$('.modal') && has() === 1, 'backdrop keeps progress');
    openReset(app); app.$('.modal [data-m="ok"]').click();
    assert(!app.$('.modal') && has() === 0, 'Reset deletes progress');
    assert.eq(app.stored().settings.lang, 'en', 'settings kept');
    assert.eq(app.$('#toast').textContent, 'Progress reset', 'toast');
    assert(app.doc.activeElement === app.$('[data-act="reset"]'), 'focus back on the (re-rendered) reset button');
  });

  test('modal: Tab and Shift+Tab stay inside (focus trap)', async () => {
    const app = await T.loadApp({ state: seeded() });
    openReset(app);
    const [cancel, ok] = app.$$('.modal .mbox button');
    const seq = [];
    for (let i = 0; i < 4; i++) { key(app, 'Tab'); seq.push(app.doc.activeElement); }
    assert(seq[0] === ok && seq[1] === cancel && seq[2] === ok && seq[3] === cancel, 'Tab cycles Cancel <-> action');
    key(app, 'Tab', true); assert(app.doc.activeElement === ok, 'Shift+Tab from Cancel goes to the action');
    key(app, 'Tab', true); assert(app.doc.activeElement === cancel, 'Shift+Tab from the action goes to Cancel');
    app.$('#screen').inert = false; app.$('[data-act="cycle"]').focus(); app.$('#screen').inert = true; // focus escaped somehow
    key(app, 'Tab'); assert(app.doc.activeElement === cancel, 'Tab from outside comes back into the dialog');
    key(app, 'Escape');
  });

  test('modal: at most one at a time; the action never fires twice', async () => {
    const app = await T.loadApp({ state: seeded() });
    openReset(app);
    app.$('#screen').inert = false; app.$('[data-act="reset"]').click(); app.$('#screen').inert = true;
    assert.eq(app.$$('.modal').length, 1, 'second open ignored');
    let toasts = 0;
    const obs = new app.win.MutationObserver(() => { toasts++; }); obs.observe(app.$('#toast'), { childList: true, characterData: true, subtree: true });
    const ok = app.$('.modal [data-m="ok"]');
    ok.click(); ok.click(); await sleep(0); obs.disconnect();
    assert.eq(toasts, 1, 'reset ran once');
    // A real double tap on Quit: the second tap lands on the screen beneath and must be swallowed.
    openQuit(app);
    const q = app.$('.modal [data-m="ok"]'); const r = q.getBoundingClientRect();
    const tap = (el) => el.dispatchEvent(new app.win.MouseEvent('click', { bubbles: true, cancelable: true, detail: 1, clientX: r.left + 4, clientY: r.top + 4 }));
    tap(q);
    assert(app.$('#lesson').hidden, 'first tap quits');
    const under = app.$('.lesson-item[data-i="0"]'); tap(under);
    assert(app.$('#lesson').hidden, 'second tap of the double tap does not open a lesson');
    await sleep(450); tap(app.$('.lesson-item[data-i="0"]'));
    assert(!app.$('#lesson').hidden, 'a later tap works again');
  });

  test('modal: quitting with music on keeps it playing while the modal is open', async () => {
    const app = await T.loadApp({ state: { settings: { lang: 'en', sound: false, music: true } } });
    openQuit(app);
    const playing = M.playing;
    app.$('.modal .btn.ghost').click();
    assert.eq(M.playing, playing, 'modal does not change music');
    app.$('[data-act="quit"]').click(); app.$('.modal [data-m="ok"]').click();
    assert(!M.playing, 'music stops on exit');
  });

  test('modal: dark theme uses dark tokens', async () => {
    const app = await T.loadApp({ state: { settings: { lang: 'en', sound: false, music: false, theme: 'dark' }, prog: {}, days: {} } });
    openReset(app);
    const box = app.$('.mbox');
    assert.eq(rgb(app, box, 'background-color'), 'rgb(36, 23, 11)', 'box = dark --surface');
    assert.eq(rgb(app, app.$('.mtitle'), 'color'), 'rgb(247, 244, 239)', 'title = dark --ink');
    assert.eq(rgb(app, box, 'border-top-color'), 'rgb(247, 244, 239)', 'border = dark --line');
    assert.eq(rgb(app, app.$('.modal .btn.danger'), 'background-color'), 'rgb(240, 96, 90)', 'danger = dark --bad');
    assert.eq(rgb(app, app.$('.modal .btn.ghost'), 'background-color'), 'rgb(36, 23, 11)', 'ghost = dark --surface');
    assert(rgb(app, app.$('.mback'), 'background-color').startsWith('rgba(0, 0, 0'), 'dark scrim');
    key(app, 'Escape');
  });

  test('modal: action labels fit at 320px in every language', async () => {
    const app = await T.loadApp({ state: seeded(), size: [320, 568] });
    const c = collector();
    for (const l of ['en', 'ru', 'uk', 'cs']) {
      for (let i = 0; i < 4 && app.doc.documentElement.lang !== l; i++) { app.$('.tab[data-tab="settings"]').click(); app.$('[data-act="cycle"][data-k="lang"]').click(); }
      openReset(app);
      app.$$('.modal button').forEach((b) => c.check(b.scrollWidth <= b.clientWidth && b.getBoundingClientRect().height <= 56, `${l}: "${b.textContent}" overflows or wraps`));
      const r = app.$('.mbox').getBoundingClientRect();
      c.check(r.left >= 16 && r.right <= 304, `${l}: dialog inside the screen padding`);
      key(app, 'Escape');
    }
    c.done();
  });

  /* ---------- R8: fixed inset shell, no vh/dvh ---------- */
  function vhRules(app) {
    const bad = [];
    for (const sh of app.doc.styleSheets) {
      for (const r of sh.cssRules) {
        const st = r.style; if (!st) continue;
        ['height', 'min-height', 'max-height'].forEach((p) => { const v = st.getPropertyValue(p); if (/\d(d|s|l)?vh\b/.test(v)) bad.push(`${r.selectorText} { ${p}: ${v} }`); });
      }
    }
    ['html', 'body', '#screen', '#tabbar', '#lesson'].forEach((s) => { const el = app.$(s); const v = el && el.getAttribute('style'); if (v && /vh\b/.test(v)) bad.push(`${s} style="${v}"`); });
    return bad;
  }
  const tabbarAtBottom = (app, label, c) => {
    const b = app.$('#tabbar').getBoundingClientRect().bottom; const ih = app.win.innerHeight;
    c.check(Math.abs(b - ih) <= 1, `${label}: tabbar bottom ${b} != innerHeight ${ih}`);
  };

  test('layout R8: no authored vh/dvh height in the shell or the lesson', async () => {
    const app = await T.loadApp();
    const c = collector();
    vhRules(app).forEach((x) => c.check(false, 'vh height: ' + x));
    const bs = app.win.getComputedStyle(app.doc.body);
    c.check(bs.position === 'fixed' && bs.top === '0px' && bs.bottom === '0px' && bs.left === '0px' && bs.right === '0px', 'body is position:fixed; inset:0');
    openLesson(app);
    const ls = app.win.getComputedStyle(app.$('#lesson'));
    c.check(ls.position === 'fixed' && ls.top === '0px' && ls.bottom === '0px', 'lesson is position:fixed; inset:0');
    c.check(app.$('#lesson').style.height === '', 'no inline lesson height without a focused input: ' + app.$('#lesson').style.height);
    vhRules(app).forEach((x) => c.check(false, 'vh height in lesson: ' + x));
    c.done();
  });

  for (const [w, h] of SIZES) {
    test(`layout R8: fresh launch on Learn, tab bar at the very bottom; same after a lesson (${w}x${h})`, async () => {
      const app = await T.loadApp({ size: [w, h] });
      const c = collector();
      c.check(app.$('.screen[data-view="learn"]'), 'Learn is the first screen');
      c.check(app.win.innerHeight === h, `frame launched at ${h} (got ${app.win.innerHeight})`);
      tabbarAtBottom(app, 'launch', c);
      openLesson(app);
      const lr = app.$('#lesson').getBoundingClientRect();
      c.check(Math.abs(lr.bottom - app.win.innerHeight) <= 1 && lr.top === 0, `lesson pinned to edges: ${lr.top}..${lr.bottom}`);
      app.$('[data-act="quit"]').click(); await sleep(30); // no answer: closes at once
      c.check(app.$('#lesson').hidden, 'lesson closed');
      tabbarAtBottom(app, 'after closing a lesson', c);
      openQuit(app); app.$('.modal [data-m="ok"]').click(); await sleep(30);
      tabbarAtBottom(app, 'after quitting via the modal', c);
      app.$('.tab[data-tab="learn"]').click(); await sleep(30);
      tabbarAtBottom(app, 'back on Learn', c);
      c.done();
    });
  }

  test('layout R8: lesson height follows the viewport only while an input is focused', async () => {
    const app = await T.loadApp();
    const L = app.win.COURSES.find((cr) => cr.id === 'js').lessons[0];
    const saved = L.tasks.map((x) => ({ ...x }));
    try {
      L.tasks.forEach((x) => { Object.keys(x).forEach((k) => delete x[k]); Object.assign(x, { t: 'w', q: 'Write', a: ['ok()'] }); });
      openLesson(app);
      const el = app.$('#lesson');
      assert.eq(el.style.height, '', 'no inline height before focus');
      app.$('#ans').focus(); await sleep(20);
      assert.eq(el.style.height, app.win.visualViewport.height + 'px', 'inline height = visual viewport while typing');
      app.$('#ans').blur(); await sleep(20);
      assert.eq(el.style.height, '', 'inline height cleared on blur');
      app.$('#ans').focus(); await sleep(20);
      app.$('[data-act="quit"]').click(); await sleep(20);
      assert(el.hidden && el.style.height === '', 'cleared after closing the lesson');
    } finally { L.tasks.forEach((x, i) => { Object.keys(x).forEach((k) => delete x[k]); Object.assign(x, saved[i]); }); }
  });
})();
