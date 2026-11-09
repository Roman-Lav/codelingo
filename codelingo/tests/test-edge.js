// Edge-case tests added by QA for the minimal rebuild (R9-R11, IA, screens 1-5).
(() => {
  const { test, assert, waitFor } = T;
  const OFFMUSIC = { lang: 'en', sound: false, music: false };
  const MUSIC = { settings: { lang: 'en', sound: false, music: true } };

  // ---- helpers ----
  function fakeAudio(win) {
    const log = { ctx: 0, osc: 0, intervals: new Set(), started: 0 };
    const param = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {} });
    const node = () => ({ connect() {}, disconnect() {} });
    class FakeCtx {
      constructor() { log.ctx++; this.state = 'running'; this.destination = node(); this.t0 = performance.now(); }
      get currentTime() { return (performance.now() - this.t0) / 1000; }
      resume() { return Promise.resolve(); }
      createGain() { const g = node(); g.gain = param(); return g; }
      createOscillator() { const o = node(); o.frequency = param(); o.start = () => {}; o.stop = () => {}; log.osc++; return o; }
    }
    win.AudioContext = FakeCtx; win.webkitAudioContext = undefined;
    const si = win.setInterval.bind(win), ci = win.clearInterval.bind(win);
    win.setInterval = (fn, ms, ...a) => { const id = si(fn, ms, ...a); if (ms === 25) { log.intervals.add(id); log.started++; } return id; };
    win.clearInterval = (id) => { log.intervals.delete(id); return ci(id); };
    return log;
  }
  const setHidden = (app, hidden) => {
    Object.defineProperty(app.doc, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
    app.doc.dispatchEvent(new app.win.Event('visibilitychange'));
  };
  const lessonOf = (cid, li) => window.COURSES.find((c) => c.id === cid).lessons[li];
  function open(app, cid, li) {
    const card = app.$(`.course[data-id="${cid}"]`); if (card) card.click();
    const item = app.$(`.lesson-item[data-i="${li}"]`); assert(item && !item.disabled, `lesson ${li} not clickable`);
    item.click();
    assert(!app.$('#lesson').hidden, 'lesson not shown');
  }
  const settingsTab = (app) => app.$('.tab[data-tab="settings"]').click();
  const setToggle = (app, key, on) => { const b = app.$(`input[data-set="${key}"]`); b.checked = on; b.dispatchEvent(new app.win.Event('change', { bubbles: true })); };
  async function reload(app) {
    const fr = app.doc.defaultView.frameElement;
    fr.contentWindow.__old = true;
    fr.contentWindow.location.reload();
    await waitFor(() => fr.contentWindow.__codelingo && !fr.contentWindow.__old && fr.contentDocument.querySelector('#screen *'), 4000, 'reload');
    const win = fr.contentWindow, doc = fr.contentDocument;
    return { win, doc, $: (s) => doc.querySelector(s), $$: (s) => [...doc.querySelectorAll(s)], stored: app.stored };
  }
  const solve = async (app, cid, li, wrongFirst) => {
    // Solve a lesson through the UI. Only multiple-choice/fill/write/order are all handled by reading the task list.
    const tasks = lessonOf(cid, li).tasks;
    const cur = () => {
      const q = app.$('#lessonBody .q').textContent;
      const code = app.$('#lessonBody pre.code'); const ct = code ? code.textContent.replace(/\s/g, '') : '';
      return tasks.find((t) => t.q.split('§')[0] === q && (!t.c || ct.startsWith(t.c.split('___')[0].replace(/\s/g, ''))));
    };
    let first = true;
    while (!app.$('.finish')) {
      const task = cur(); assert(task, 'unknown task');
      const bad = wrongFirst && first; first = false;
      if (app.$$('.opt').length) {
        const i = bad ? task.o.findIndex((_, k) => k !== task.a) : task.a; app.$(`.opt[data-i="${i}"]`).click();
      } else if (app.$('.bank')) {
        const seq = bad ? task.a.slice().reverse() : task.a;
        seq.forEach((tok) => app.$$('.bank .tok').find((x) => !x.disabled && x.textContent === tok).click());
        if (bad && seq.join(' ') === task.a.join(' ')) throw new Error('cannot make a wrong order answer');
      } else {
        const el = app.$('#ans'); el.value = bad ? 'zzz_wrong' : task.a[0]; el.dispatchEvent(new app.win.Event('input', { bubbles: true }));
      }
      app.$('#checkBtn').click();
      await T.sleep(420); app.$('#checkBtn').click();
    }
  };

  // ---- music ----
  test('edge/music: start-stop-start never leaves more than one timer', async () => {
    const app = await T.loadApp({ state: MUSIC });
    const log = fakeAudio(app.win); const M = app.win.CLMusic;
    for (let i = 0; i < 5; i++) { assert(M.start(), 'start ok'); M.start(); M.stop(); M.stop(); }
    assert.eq(log.intervals.size, 0, 'no live intervals after stop');
    M.start(); M.start(); M.stop(); M.start();
    assert.eq(log.intervals.size, 1, 'exactly one live interval');
    assert(M.playing, 'playing');
    M.stop();
    assert.eq(log.intervals.size, 0, 'cleared');
    assert(!M.playing, 'not playing');
    // via the app: three lessons in a row
    for (let i = 0; i < 3; i++) { open(app, 'js', 0); app.$('[data-act="quit"]').click(); app.$('.back') && app.$('.back').click(); }
    assert.eq(log.intervals.size, 0, 'no leaked interval after repeated open/quit');
    assert.eq(log.ctx, 1, 'one AudioContext reused');
  });

  test('edge/music: quitting before the first answer stops it (no confirm shown)', async () => {
    const app = await T.loadApp({ state: MUSIC });
    const log = fakeAudio(app.win);
    let asked = 0; app.win.confirm = () => { asked++; return true; };
    open(app, 'js', 0);
    assert(app.win.CLMusic.playing && log.intervals.size === 1, 'playing in lesson');
    app.$('[data-act="quit"]').click();
    assert.eq(asked, 0, 'no confirm before first answer');
    assert(app.$('#lesson').hidden, 'closed');
    assert(!app.win.CLMusic.playing && log.intervals.size === 0, 'music stopped');
  });

  test('edge/music: switching music off mid-lesson stops it and it stays off after hide/show', async () => {
    const app = await T.loadApp({ state: MUSIC });
    const log = fakeAudio(app.win); const M = app.win.CLMusic;
    open(app, 'js', 0);
    assert(M.playing, 'playing');
    settingsTab(app); // tab bar is hidden in a lesson, but the settings view exists underneath
    setToggle(app, 'music', false);
    assert(!M.playing && log.intervals.size === 0, 'stopped by the toggle');
    assert.eq(app.stored().settings.music, false, 'persisted');
    setHidden(app, true); setHidden(app, false);
    assert(!M.playing && log.intervals.size === 0, 'does not resume while setting is off');
    assert(app.$('#lesson') && !app.$('#lesson').hidden, 'lesson still open');
  });

  test('edge/music: no audio after the finish screen (even on tab changes and hide/show)', async () => {
    const app = await T.loadApp({ state: MUSIC });
    const log = fakeAudio(app.win); const M = app.win.CLMusic;
    open(app, 'js', 0);
    await solve(app, 'js', 0, false);
    assert(app.$('.finish'), 'finish shown');
    assert(!M.playing && log.intervals.size === 0, 'stopped at finish');
    const n = log.osc; await T.sleep(150); assert.eq(log.osc, n, 'no new notes after finish');
    setHidden(app, true); setHidden(app, false);
    assert(!M.playing && log.intervals.size === 0, 'no resume on finish screen');
    app.$('#checkBtn').click();
    assert(app.$('#lesson').hidden, 'lesson closed');
    setHidden(app, true); setHidden(app, false);
    assert(!M.playing && log.intervals.size === 0, 'no resume after closing');
  });

  test('edge/music: visibilitychange outside a lesson (fresh boot, settings, course) never starts music', async () => {
    const app = await T.loadApp({ state: MUSIC });
    const log = fakeAudio(app.win);
    setHidden(app, true); setHidden(app, false);
    assert(!app.win.CLMusic.playing && log.ctx === 0, 'home: nothing created');
    app.$('.course[data-id="css"]').click();
    setHidden(app, true); setHidden(app, false);
    assert(!app.win.CLMusic.playing && log.ctx === 0, 'course screen: nothing created');
    settingsTab(app); setHidden(app, false); setHidden(app, true); setHidden(app, false);
    assert(!app.win.CLMusic.playing && log.ctx === 0 && log.intervals.size === 0, 'settings: nothing created');
  });

  // ---- cycling ----
  test('edge/cycle: theme and language survive reload; button text follows every tap', async () => {
    let app = await T.loadApp({ state: { settings: { theme: 'system', lang: 'en', sound: false, music: false } } });
    settingsTab(app);
    const names = { en: 'English', ru: 'Русский', uk: 'Українська', cs: 'Čeština' };
    const order = ['ru', 'uk', 'cs', 'en', 'ru'];
    for (const l of order) {
      app.$('[data-act="cycle"][data-k="lang"]').click();
      const btn = app.$('[data-act="cycle"][data-k="lang"]');
      assert.eq(btn.textContent.trim(), names[l], 'language button after tap -> ' + l);
      assert.eq(btn.getAttribute('lang'), l, 'button lang attr');
      assert.eq(app.doc.documentElement.lang, l, 'html lang');
      assert.eq(app.stored().settings.lang, l, 'stored lang');
    }
    const themes = []; const seen = new Set();
    for (let i = 0; i < 4; i++) {
      app.$('[data-act="cycle"][data-k="theme"]').click();
      const dt = app.doc.documentElement.getAttribute('data-theme');
      themes.push(dt || 'system'); seen.add(app.stored().settings.theme);
      assert.eq(app.$('[data-act="cycle"][data-k="theme"]').textContent.trim().length > 0, true, 'theme text');
    }
    assert.eq(themes.join(), 'light,dark,system,light', 'theme order light,dark,system,light (' + themes + ')');
    assert.eq(seen.size, 3, 'three distinct themes');
    // now: lang ru, theme light
    app = await reload(app);
    assert.eq(app.doc.documentElement.lang, 'ru', 'lang after reload');
    assert.eq(app.doc.documentElement.getAttribute('data-theme'), 'light', 'theme after reload');
    settingsTab(app);
    assert.eq(app.$('[data-act="cycle"][data-k="lang"]').textContent.trim(), 'Русский', 'button after reload');
    app.$('[data-act="cycle"][data-k="theme"]').click();
    app = await reload(app);
    assert.eq(app.doc.documentElement.getAttribute('data-theme'), 'dark', 'dark after reload');
    assert.eq(app.doc.querySelector('meta[name="theme-color"]').getAttribute('content'), '#17110B', 'theme-color meta dark');
  });

  // ---- sanitize ----
  test('edge/sanitize: garbage best values', async () => {
    const app = await T.loadApp();
    const sz = (best) => JSON.stringify(app.win.__codelingo.sanitize({ prog: { js: { done: [0], ans: 1, ok: 1, best } } }).prog.js.best);
    const nan = NaN, inf = Infinity;
    assert.eq(sz({ 0: '85' }), '{"0":85}', 'numeric string');
    assert.eq(sz({ 0: ' ' }), '{}', 'blank string');
    assert.eq(sz({ 0: '' }), '{}', 'empty string');
    assert.eq(sz({ 0: nan }), '{}', 'NaN');
    assert.eq(sz({ 0: inf }), '{}', 'Infinity');
    assert.eq(sz({ 0: 999 }), '{"0":100}', '999 clamped');
    assert.eq(sz({ 0: -5 }), '{"0":0}', '-5 clamped');
    assert.eq(sz({ 0: 59.5 }), '{"0":60}', 'rounded');
    assert.eq(sz({ 0: {} }), '{}', 'object');
    assert.eq(sz({ 0: [50] }), '{}', 'array value');
    assert.eq(sz({ 0: [] }), '{}', 'empty array value');
    assert.eq(sz({ 0: null, 1: true, 2: false, 3: undefined }), '{}', 'null/bool/undefined');
    assert.eq(sz({ 10: 50, 99: 50, 1e3: 50, '-1': 50, '1.5': 50, '': 50, ' 2': 50, '2 ': 50, '0x1': 50, '1e0': 50 }), '{}', 'out-of-range / non-integer keys');
    assert.eq(sz('90'), '{}', 'string best container');
    assert.eq(sz(null), '{}', 'null best container');
    assert.eq(sz(42), '{}', 'number best container');
    assert.eq(sz({ __proto__: { 0: 50 } }), '{}', 'inherited keys');
    assert.eq(sz({ 2: 'abc', 3: '12px', 4: '  70  ', 5: '1e2' }), '{"4":70,"5":100}', 'text strings');
    const proto = app.win.__codelingo.sanitize(JSON.parse('{"prog":{"js":{"done":[0],"best":{"__proto__":50,"constructor":5}}}}'));
    assert.eq(JSON.stringify(proto.prog.js.best), '{}', '__proto__ keys');
    // the app still shows the course screen with garbage best
    const g = await T.loadApp({ state: { settings: OFFMUSIC, prog: { js: { done: [0, 1, 2], ans: 3, ok: 3, xp: 0, best: { 0: 'x', 1: nan, 2: 999 } } } } });
    g.$('.tab[data-tab="profile"]').click();
    const cls = g.$$('.krow[data-id="js"] .segbar i').map((i) => i.className).slice(0, 4).join();
    assert.eq(cls, 'ok,ok,ok,', 'fallback to course accuracy for missing best, 999 -> ok: ' + cls);
  });

  test('edge/sanitize: hex string best ("0x10") is garbage and must be dropped', async () => {
    const app = await T.loadApp();
    const r = app.win.__codelingo.sanitize({ prog: { js: { done: [0], ans: 1, ok: 1, best: { 0: '0x10', 1: '0b11', 2: '0o7' } } } }).prog.js.best;
    assert.eq(JSON.stringify(r), '{}', 'hex/binary/octal strings accepted as numbers');
  });

  // ---- best = max over repeated plays ----
  test('edge/best: repeated plays of the same lesson keep the maximum', async () => {
    const app = await T.loadApp({ state: { settings: OFFMUSIC } });
    const n = lessonOf('js', 0).tasks.length;
    const lowest = Math.round((100 * n) / (n + 1));
    open(app, 'js', 0); await solve(app, 'js', 0, true); assert(app.$('.finish'), 'finished 1');
    assert.eq(app.stored().prog.js.best[0], lowest, 'first play: imperfect');
    app.$('#checkBtn').click();
    open(app, 'js', 0); await solve(app, 'js', 0, false);
    assert.eq(app.stored().prog.js.best[0], 100, 'second play perfect: 100');
    app.$('#checkBtn').click();
    open(app, 'js', 0); await solve(app, 'js', 0, true);
    assert.eq(app.stored().prog.js.best[0], 100, 'third play imperfect: still 100');
    app.$('#checkBtn').click();
    assert.eq(app.stored().prog.js.done.join(), '0', 'done not duplicated');
  });

  // ---- profile colours ----
  test('edge/profile: segment colours at exactly 60 and 90 (stored best and fallback accuracy)', async () => {
    const best = { 0: 59, 1: 60, 2: 89, 3: 90, 4: 0, 5: 100, 6: 89.5, 7: 59.5 };
    const app = await T.loadApp({ state: { settings: OFFMUSIC, prog: { js: { done: [0, 1, 2, 3, 4, 5, 6, 7], ans: 10, ok: 10, xp: 0, best } } } });
    app.$('.tab[data-tab="profile"]').click();
    const segs = app.$$('.krow[data-id="js"] .segbar i').map((i) => i.className);
    assert.eq(segs.join(), 'bad,mid,mid,ok,bad,ok,ok,mid,,', 'best boundaries: ' + segs);
    // computed colours are distinct and set for each class
    const cs = (cls) => app.win.getComputedStyle(app.$('.segbar i.' + cls)).backgroundColor;
    assert(cs('ok') !== cs('mid') && cs('mid') !== cs('bad') && cs('ok') !== cs('bad'), 'three distinct colours: ' + [cs('ok'), cs('mid'), cs('bad')]);
    const empty = app.win.getComputedStyle(app.$$('.krow[data-id="js"] .segbar i')[9]).backgroundColor;
    assert(![cs('ok'), cs('mid'), cs('bad')].includes(empty), 'empty segment differs from filled');
    // old saves without best: fallback uses ok/ans of the course
    const fb = async (ans, ok) => {
      const a = await T.loadApp({ state: { settings: OFFMUSIC, prog: { js: { done: [0], ans, ok, xp: 0 } } } });
      a.$('.tab[data-tab="profile"]').click();
      return a.$('.krow[data-id="js"] .segbar i').className;
    };
    assert.eq(await fb(5, 3), 'mid', '60% fallback');
    assert.eq(await fb(100, 59), 'bad', '59% fallback');
    assert.eq(await fb(10, 9), 'ok', '90% fallback');
    assert.eq(await fb(100, 89), 'mid', '89% fallback');
    assert.eq(await fb(0, 0), 'bad', 'no answers: done lesson is red, not blank');
  });

  // ---- completed course ----
  test('edge/course: fully completed course shows the check on Learn and 100% on the course screen', async () => {
    const prog = {};
    window.COURSES.forEach((c) => { prog[c.id] = { done: c.lessons.map((_, i) => i), ans: 40, ok: 40, xp: 100, best: {} }; });
    const app = await T.loadApp({ state: { settings: OFFMUSIC, prog } });
    assert.eq(app.$$('.course .cdone').length, window.COURSES.length, 'check on every course card');
    for (const c of window.COURSES) {
      app.$(`.course[data-id="${c.id}"]`).click();
      assert.eq(app.$('.kpct').textContent, '100%', c.id + ' percent');
      const items = app.$$('.lesson-item');
      assert(items.every((b) => !b.disabled && !b.querySelector('.go')), c.id + ': all lessons done and open');
      app.$('.back').click();
    }
    // one lesson short: no check, below 100%
    const c0 = window.COURSES[0];
    const p2 = { [c0.id]: { done: c0.lessons.slice(1).map((_, i) => i + 1), ans: 10, ok: 10, xp: 0 } };
    const a2 = await T.loadApp({ state: { settings: OFFMUSIC, prog: p2 } });
    assert.eq(a2.$$('.course .cdone').length, 0, 'no check with a missing lesson');
    a2.$(`.course[data-id="${c0.id}"]`).click();
    assert(a2.$('.kpct').textContent !== '100%', 'not 100%');
    // completed with imperfect accuracy: check is shown; percent is reported
    const p3 = { [c0.id]: { done: c0.lessons.map((_, i) => i), ans: 10, ok: 5, xp: 0 } };
    const a3 = await T.loadApp({ state: { settings: OFFMUSIC, prog: p3 } });
    assert.eq(a3.$$('.course .cdone').length, 1, 'check when all lessons are passed');
    a3.$(`.course[data-id="${c0.id}"]`).click();
    assert.eq(a3.$('.kpct').textContent, '75%', 'spec formula: 100 * 1 * (0.5 + 0.5 * 0.5)');
  });

  // ---- $ patterns through the UI ----
  test('edge/fill: $ patterns in fill answers are literal in checking and in the answer sheet', async () => {
    const app = await T.loadApp({ state: { settings: OFFMUSIC } });
    const L = app.win.COURSES.find((c) => c.id === 'js').lessons[0];
    const saved = L.tasks.map((t) => ({ ...t }));
    try {
      const mk = (a) => { L.tasks.forEach((t) => { Object.keys(t).forEach((k) => delete t[k]); Object.assign(t, { t: 'f', q: 'Fill', c: 'v = ___', a: [a] }); }); };
      const type = (v) => { const el = app.$('#ans'); el.value = v; el.dispatchEvent(new app.win.Event('input', { bubbles: true })); app.$('#checkBtn').click(); return app.$('#sheet').classList.contains('ok'); };
      const tryOne = async (answer, input, expectOk) => {
        mk(answer);
        app.$('.course[data-id="js"]').click(); app.$('.lesson-item[data-i="0"]').click();
        assert(app.$('#ans'), 'no fill input: ' + app.$('#lessonBody').innerHTML.slice(0, 200));
        const ok = type(input);
        const sheet = app.$('#sheet').textContent;
        app.$('[data-act="quit"]').click(); if (app.$('.back')) app.$('.back').click();
        assert.eq(ok, expectOk, `answer ${JSON.stringify(answer)} input ${JSON.stringify(input)}`);
        return sheet;
      };
      for (const p of ['$&', "$'", '$`', '$$', '$1', '${x}', '$<a>']) {
        await tryOne(p, p, true);
        const sheet = await tryOne(p, 'nope', false);
        assert(sheet.includes('v = ' + p), `sheet shows literal ${p}: ${sheet}`);
      }
      await tryOne('$', '$$', false); // "$$" must not collapse to "$"
      await tryOne('$$', '$', false);
      await tryOne('a', '$&', false); // "$&" must not insert the match
      await tryOne('$&', 'v = $&', false);
    } finally { L.tasks.forEach((t, i) => { Object.keys(t).forEach((k) => delete t[k]); Object.assign(t, saved[i]); }); }
  });
})();
