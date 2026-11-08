// End-to-end UI tests: the real app runs in an iPhone-sized iframe and is driven by clicks/typing.
(() => {
  const { test, assert, waitFor } = T;
  const KEY = 'codelingo.v1';
  let frame = null;

  // Fresh app instance. `state` optionally pre-seeds localStorage; `lang` forces UI language.
  T.loadApp = async ({ state, lang = 'en' } = {}) => {
    localStorage.removeItem(KEY);
    localStorage.setItem(KEY, JSON.stringify(state || { settings: { lang, sound: false } }));
    if (frame) frame.remove();
    frame = document.createElement('iframe');
    document.body.appendChild(frame);
    await new Promise((res) => { frame.onload = res; frame.src = '../index.html?t=' + Math.random(); });
    const win = frame.contentWindow; const doc = frame.contentDocument;
    win.confirm = () => (win.__confirmAnswer ?? true);
    await waitFor(() => win.__codelingo, 3000, 'app boot');
    return { win, doc, $: (s) => doc.querySelector(s), $$: (s) => [...doc.querySelectorAll(s)], stored: () => JSON.parse(localStorage.getItem(KEY)) };
  };

  // Answer the current task correctly (or deliberately wrong) through the UI.
  function answer(app, ok) {
    const { win, $, $$ } = app;
    // Find which task is on screen from the question text + current queue: read it from the DOM-visible state.
    const lessonBody = $('#lessonBody');
    if ($$('.opt').length) {
      const task = currentTask(app);
      const target = ok ? task.a : task.o.findIndex((_, i) => i !== task.a && !$(`.opt[data-i="${i}"]`).disabled);
      $(`.opt[data-i="${target}"]`).click();
    } else if ($('.bank')) {
      const task = currentTask(app);
      const seq = ok ? task.a : task.a.slice().reverse();
      seq.forEach((tok) => { const b = $$('.bank .tok').find((x) => !x.disabled && x.textContent === tok); assert(b, `token "${tok}" not in bank`); b.click(); });
    } else {
      const task = currentTask(app);
      const el = $('#ans'); assert(el, 'no input in ' + lessonBody.innerHTML.slice(0, 80));
      el.value = ok ? task.a[0] : 'zzz_wrong';
      el.dispatchEvent(new win.Event('input', { bubbles: true }));
    }
    const btn = $('#checkBtn');
    assert(!btn.disabled, 'Check button disabled after answering');
    btn.click();
    return $('#sheet').classList.contains('ok');
  }

  // Map the visible question back to the task object (question text is unique enough within a lesson when paired with the order of the queue).
  let lessonCtx = null;
  function currentTask(app) {
    const q = app.$('#lessonBody .q').textContent;
    const code = app.$('#lessonBody pre.code');
    const codeTxt = code ? code.textContent : '';
    const cands = lessonCtx.tasks.filter((t) => t.q.split('§')[0] === q && (!t.c || codeTxt.replace(/\s/g, '').startsWith(t.c.split('___')[0].replace(/\s/g, ''))));
    assert(cands.length >= 1, `cannot identify task for "${q}"`);
    return cands[0];
  }

  // "Continue" after Check: the app ignores taps for 400 ms after a check (anti double-tap), so wait first.
  async function cont(app) { await T.sleep(420); app.$('#checkBtn').click(); }

  async function openLesson(app, cid, li) {
    app.$(`.course[data-id="${cid}"]`).click();
    lessonCtx = window.COURSES.find((c) => c.id === cid).lessons[li];
    const item = app.$(`.lesson-item[data-i="${li}"]`); assert(item, `lesson ${li} not clickable`);
    item.click();
    assert(!app.$('#lesson').hidden, 'lesson screen not shown');
  }

  test('app: home screen lists all 6 courses and the tab bar', async () => {
    const app = await T.loadApp();
    assert.eq(app.$$('.course').length, 6, 'course cards');
    assert.eq(app.$$('#tabbar .tab').length, 3, 'tabs');
  });

  test('app: only the first lesson is unlocked in a new course', async () => {
    const app = await T.loadApp();
    app.$('.course[data-id="js"]').click();
    const items = app.$$('.lesson-item');
    assert(items.length > 1, 'lessons rendered');
    assert(!items[0].disabled, 'first lesson open');
    assert(items.slice(1).every((b) => b.disabled), 'others locked');
  });

  // Complete lesson 1 of every course with all-correct answers.
  window.COURSES.forEach((c) => test(`app: complete ${c.id} lesson 1 with perfect answers`, async () => {
    const app = await T.loadApp();
    await openLesson(app, c.id, 0);
    const n = lessonCtx.tasks.length;
    for (let i = 0; i < n; i++) {
      assert(answer(app, true), `task ${i + 1} marked wrong: ${app.$('#lessonBody .q').textContent}`);
      await cont(app);
    }
    assert(app.$('.finish'), 'finish screen');
    app.$('#checkBtn').click();
    assert(app.$('#lesson').hidden, 'lesson closed');
    const p = app.stored().prog[c.id];
    assert.eq(p.done.join(), '0', 'lesson 1 marked done');
    assert.eq(p.xp, n * 10, 'XP');
    assert.eq(p.ok, n, 'correct answers');
    assert(!app.$('.lesson-item[data-i="1"]').disabled, 'lesson 2 unlocked');
  }));

  test('app: wrong answer is re-queued and earns reduced XP', async () => {
    const app = await T.loadApp();
    await openLesson(app, 'js', 0);
    const n = lessonCtx.tasks.length;
    assert(!answer(app, false), 'wrong answer accepted');
    assert(app.$('#sheet').textContent.length > 0, 'correct answer shown');
    await cont(app);
    for (let i = 0; i < n; i++) { assert(answer(app, true), `task ${i + 1} wrong`); await cont(app); }
    assert(app.$('.finish'), 'finish after retry');
    const p = app.stored().prog.js;
    assert.eq(p.xp, (n - 1) * 10 + 2, 'XP with one retry');
    assert.eq(p.ans, n + 1, 'answers counted');
  });

  test('app: quitting mid-lesson asks for confirmation and keeps lesson undone', async () => {
    const app = await T.loadApp();
    await openLesson(app, 'py', 0);
    answer(app, true); await cont(app);
    app.win.__confirmAnswer = false;
    app.$('[data-act="quit"]').click();
    assert(!app.$('#lesson').hidden, 'cancel keeps lesson open');
    app.win.__confirmAnswer = true;
    app.$('[data-act="quit"]').click();
    assert(app.$('#lesson').hidden, 'confirm closes lesson');
    assert.eq((app.stored().prog.py || { done: [] }).done.length, 0, 'lesson not done');
  });

  test('app: double-tapping Check does not double-count', async () => {
    const app = await T.loadApp();
    await openLesson(app, 'js', 0);
    app.$(`.opt[data-i="${currentTask(app).a}"]`).click();
    app.$('#checkBtn').click(); app.$('#checkBtn').click(); app.$('#checkBtn').click();
    const p = app.stored().prog.js;
    assert.eq(p.ans, 1, 'only one answer counted');
  });

  test('app: fast second tap after Check does not skip the answer sheet', async () => {
    const app = await T.loadApp();
    await openLesson(app, 'js', 0);
    const q = app.$('#lessonBody .q').textContent;
    answer(app, false);
    app.$('#checkBtn').click(); // immediate second tap: ignored
    assert(!app.$('#sheet').hidden, 'answer sheet still shown');
    assert.eq(app.$('#lessonBody .q').textContent, q, 'still on the same task');
    await cont(app);
    assert(app.$('#sheet').hidden, 'after the guard delay Continue advances');
  });

  test('app: mascot hint removes a wrong option in multiple choice', async () => {
    const app = await T.loadApp({ state: { settings: { lang: 'en', sound: false, hints: true } } });
    await openLesson(app, 'js', 0);
    assert(app.$$('.opt').length, 'first JS task is multiple choice');
    app.$('#lmascot').click();
    assert.eq(app.$$('.opt:disabled').length, 1, 'one option crossed out');
    assert(!app.$('#bubble').hidden, 'bubble shown');
  });

  test('app: settings — language switch re-renders UI in Russian', async () => {
    const app = await T.loadApp();
    app.$('.tab[data-tab="settings"]').click();
    const sel = app.$('select[data-set="lang"]');
    sel.value = 'ru'; sel.dispatchEvent(new app.win.Event('change', { bubbles: true }));
    assert.eq(app.$('.tab[data-tab="learn"] span').textContent, window.I18N.ru.learn, 'tab label');
    assert.eq(app.doc.documentElement.lang, 'ru', 'html lang');
    assert.eq(app.stored().settings.lang, 'ru', 'persisted');
  });

  test('app: settings — dark theme and code size apply to the document', async () => {
    const app = await T.loadApp();
    app.$('.tab[data-tab="settings"]').click();
    app.$('[data-k="theme"][data-v="dark"]').click();
    assert.eq(app.doc.documentElement.dataset.theme, 'dark', 'data-theme');
    app.$('[data-k="code"][data-v="l"]').click();
    assert.eq(app.doc.documentElement.style.getPropertyValue('--code-size'), '18px', 'code size');
  });

  test('app: profile shows totals from stored progress', async () => {
    const app = await T.loadApp({ state: { settings: { lang: 'en' }, prog: { js: { done: [0, 1], ans: 10, ok: 8, xp: 150 } }, days: {} } });
    app.$('.tab[data-tab="profile"]').click();
    const nums = app.$$('.stats3 .stat b').map((b) => b.textContent);
    assert.eq(nums[0], '150', 'total XP');
    assert.eq(nums[2], '80%', 'accuracy');
  });

  test('app: corrupted localStorage does not crash the app', async () => {
    localStorage.setItem(KEY, '{not json');
    if (frame) frame.remove();
    frame = document.createElement('iframe'); document.body.appendChild(frame);
    await new Promise((res) => { frame.onload = res; frame.src = '../index.html?t=' + Math.random(); });
    assert.eq(frame.contentDocument.querySelectorAll('.course').length, 6, 'home renders');
  });

  test('app: stored progress for a removed/unknown course does not crash', async () => {
    const app = await T.loadApp({ state: { settings: { lang: 'xx', goal: 0 }, prog: { gone: { done: [0], ans: 1, ok: 1, xp: 10 }, js: { done: [999], ans: 0, ok: 0, xp: 0 } }, days: {} } });
    assert.eq(app.$$('.course').length, 6, 'home renders');
    app.$('.tab[data-tab="profile"]').click();
    assert(!/NaN|Infinity|undefined/.test(app.$('#screen').textContent), 'profile has no NaN/Infinity/undefined: ' + app.$('#screen').textContent.match(/.{0,20}(NaN|Infinity|undefined).{0,20}/)?.[0]);
  });

  test('app: malformed imported progress does not brick the app on next launch', async () => {
    const app = await T.loadApp({ state: { settings: 'oops', prog: { js: {}, py: { done: 'x', ans: '3', ok: null }, css: null }, days: [] } });
    assert.eq(app.$$('.course').length, 6, 'home renders');
    app.$('.tab[data-tab="profile"]').click();
    assert(app.$('.stats3'), 'profile renders');
    assert(!/NaN|undefined/.test(app.$('#screen').textContent), 'no NaN/undefined in profile');
  });

  // Export: stub navigator.share/canShare and <a>.click inside the app frame.
  function stubExport(app, { share, canShare } = {}) {
    const nav = app.win.navigator; const calls = { share: [], download: [] };
    Object.defineProperty(nav, 'share', { configurable: true, value: share ? (d) => { calls.share.push(d); return share(d); } : undefined });
    Object.defineProperty(nav, 'canShare', { configurable: true, value: canShare });
    app.win.HTMLAnchorElement.prototype.click = function () { calls.download.push(this.download); };
    return calls;
  }
  async function clickExport(app) {
    app.$('.tab[data-tab="settings"]').click();
    const btn = app.$('[data-act="export"]'); assert(btn, 'export button');
    btn.click();
    await T.sleep(30);
  }
  const EXPORT_NAME = /^codelingo-\d{4}-\d{2}-\d{2}\.json$/;

  test('app: export shares a single .json file when canShare is true', async () => {
    const app = await T.loadApp();
    const calls = stubExport(app, { share: () => Promise.resolve(), canShare: (d) => !!(d && d.files && d.files.length) });
    await clickExport(app);
    assert.eq(calls.share.length, 1, 'navigator.share calls');
    const files = calls.share[0].files;
    assert(Array.isArray(files) && files.length === 1, 'exactly one file');
    assert(files[0] instanceof app.win.File, 'is a File');
    assert(EXPORT_NAME.test(files[0].name), 'file name: ' + files[0].name);
    assert.eq(files[0].type, 'application/json', 'mime');
    const data = JSON.parse(await files[0].text());
    assert(data && data.settings, 'file contains progress');
    assert.eq(calls.download.length, 0, 'no download fallback');
  });

  test('app: export without navigator.share falls back to <a download>', async () => {
    const app = await T.loadApp();
    const errs = [];
    app.win.addEventListener('unhandledrejection', (e) => errs.push(String(e.reason)));
    app.win.addEventListener('error', (e) => errs.push(String(e.message)));
    const calls = stubExport(app, {});
    await clickExport(app);
    assert.eq(errs.length, 0, 'errors: ' + errs.join('; '));
    assert.eq(calls.download.length, 1, 'download fallback used');
    assert(EXPORT_NAME.test(calls.download[0]), 'download name: ' + calls.download[0]);
  });

  test('app: export — cancel (AbortError) does nothing, other share errors fall back', async () => {
    const app = await T.loadApp();
    let calls = stubExport(app, { share: () => Promise.reject(new app.win.DOMException('cancel', 'AbortError')), canShare: () => true });
    await clickExport(app);
    assert.eq(calls.share.length, 1, 'share attempted');
    assert.eq(calls.download.length, 0, 'no fallback after cancel');
    calls = stubExport(app, { share: () => Promise.reject(new app.win.DOMException('nope', 'NotAllowedError')), canShare: () => true });
    await clickExport(app);
    assert.eq(calls.download.length, 1, 'fallback after share error');
    calls = stubExport(app, { share: () => Promise.resolve(), canShare: () => false });
    await clickExport(app);
    assert.eq(calls.share.length, 0, 'no share when canShare is false');
    assert.eq(calls.download.length, 1, 'fallback when canShare is false');
  });

  // Symbol bar: synthetic touch events with touches/changedTouches defined explicitly.
  function touch(app, el, type, x, y) {
    const ev = new app.win.Event(type, { bubbles: true, cancelable: true });
    const pt = [{ clientX: x, clientY: y, target: el }];
    Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : pt });
    Object.defineProperty(ev, 'changedTouches', { value: pt });
    el.dispatchEvent(ev);
    return ev;
  }

  test('app: swiping the symbol bar does not insert; a tap does', async () => {
    const app = await T.loadApp();
    const c = window.COURSES.find((x) => x.lessons[0].tasks.some((tk) => tk.t === 'f' || tk.t === 'w'));
    assert(c, 'a course whose lesson 1 has a typed task');
    await openLesson(app, c.id, 0);
    for (let i = 0; i < lessonCtx.tasks.length && !app.$('#ans'); i++) { answer(app, true); await cont(app); }
    const ans = app.$('#ans'); assert(ans, 'typed task reached');
    const sym = app.$$('.sym').find((b) => b.dataset.ins !== 'Tab'); assert(sym, 'symbol button');
    ans.value = ''; ans.focus();
    touch(app, sym, 'touchstart', 100, 20);
    const swipe = touch(app, sym, 'touchend', 130, 20);
    assert.eq(ans.value, '', 'horizontal swipe must not insert');
    assert(!swipe.defaultPrevented, 'swipe must not preventDefault');
    touch(app, sym, 'touchstart', 100, 20);
    const vSwipe = touch(app, sym, 'touchend', 100, 45);
    assert.eq(ans.value, '', 'vertical swipe must not insert');
    assert(!vSwipe.defaultPrevented, 'vertical swipe must not preventDefault');
    touch(app, sym, 'touchstart', 100, 20);
    const tap = touch(app, sym, 'touchend', 104, 22);
    assert.eq(ans.value, sym.dataset.ins, 'tap inserts the symbol');
    assert(tap.defaultPrevented, 'tap calls preventDefault (keyboard stays open)');
  });

  test('app: no element wider than an iPhone SE screen (320px) on any tab', async () => {
    const app = await T.loadApp();
    frame.style.width = '320px';
    await T.sleep(50);
    const bad = [];
    for (const tab of ['learn', 'profile', 'settings']) {
      app.$(`.tab[data-tab="${tab}"]`).click();
      if (app.doc.documentElement.scrollWidth > 320) bad.push(`${tab}: page scrollWidth ${app.doc.documentElement.scrollWidth}`);
    }
    frame.style.width = '';
    assert(!bad.length, bad.join('; '));
  });

  test('app: tap targets are at least 44×44 px', async () => {
    const app = await T.loadApp();
    const small = [];
    const scan = (where) => app.$$('button, select, label.sw').forEach((b) => {
      const r = b.getBoundingClientRect();
      if (r.width && r.height && (r.width < 44 || r.height < 44)) small.push(`${where}: ${b.className || b.tagName} "${b.textContent.trim().slice(0, 12)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
    });
    scan('home');
    app.$('.tab[data-tab="settings"]').click(); scan('settings');
    app.$('.tab[data-tab="learn"]').click();
    await openLesson(app, 'js', 0); scan('lesson');
    const uniq = [...new Set(small)];
    assert(!uniq.length, uniq.length + ' small targets:\n    - ' + uniq.slice(0, 15).join('\n    - '));
  });

  // --- Edge cases: export double-tap, touch without touchstart, multitouch ---
  test('app: double-tap Export while share sheet is open — no unhandled errors, no extra download', async () => {
    const app = await T.loadApp();
    const errs = [];
    app.win.addEventListener('unhandledrejection', (e) => errs.push(String(e.reason)));
    app.win.addEventListener('error', (e) => errs.push(String(e.message)));
    // Real browsers reject a second share() while the first is pending with InvalidStateError.
    let pending = false;
    const calls = stubExport(app, {
      canShare: () => true,
      share: () => {
        if (pending) return Promise.reject(new app.win.DOMException('An earlier share has not yet completed.', 'InvalidStateError'));
        pending = true; return new Promise(() => {});
      },
    });
    app.$('.tab[data-tab="settings"]').click();
    const btn = app.$('[data-act="export"]');
    btn.click(); btn.click();
    await T.sleep(50);
    assert.eq(errs.length, 0, 'errors: ' + errs.join('; '));
    assert.eq(calls.download.length, 0, 'second tap must not trigger <a download> while share sheet is open (got ' + calls.download.length + ')');
  });

  function touchMulti(app, el, type, touches, changed) {
    const ev = new app.win.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'touches', { value: touches });
    Object.defineProperty(ev, 'changedTouches', { value: changed });
    el.dispatchEvent(ev);
    return ev;
  }
  async function openTyped(app) {
    const c = window.COURSES.find((x) => x.lessons[0].tasks.some((tk) => tk.t === 'f' || tk.t === 'w'));
    await openLesson(app, c.id, 0);
    for (let i = 0; i < lessonCtx.tasks.length && !app.$('#ans'); i++) { answer(app, true); await cont(app); }
    const ans = app.$('#ans'); assert(ans, 'typed task reached');
    const sym = app.$$('.sym').find((b) => b.dataset.ins !== 'Tab'); assert(sym, 'symbol button');
    ans.value = ''; ans.focus();
    return { ans, sym };
  }

  test('app: touchend on .sym without touchstart acts as a tap, no exception', async () => {
    const app = await T.loadApp();
    const errs = []; app.win.addEventListener('error', (e) => errs.push(String(e.message)));
    const { ans, sym } = await openTyped(app);
    const ev = touchMulti(app, sym, 'touchend', [], [{ clientX: 50, clientY: 50, target: sym }]);
    assert.eq(ans.value, sym.dataset.ins, 'inserted');
    assert(ev.defaultPrevented, 'preventDefault');
    const ev2 = touchMulti(app, sym, 'touchend', [], []); // empty changedTouches
    assert.eq(ans.value, sym.dataset.ins + sym.dataset.ins, 'inserted with empty changedTouches');
    assert(ev2.defaultPrevented, 'preventDefault (2)');
    assert.eq(errs.length, 0, 'errors: ' + errs.join('; '));
  });

  test('app: multitouch — second finger elsewhere must not turn a swipe on .sym into an insert', async () => {
    const app = await T.loadApp();
    const { ans, sym } = await openTyped(app);
    const other = app.$('#ans');
    const A0 = { identifier: 0, clientX: 100, clientY: 20, target: sym };
    const B0 = { identifier: 1, clientX: 200, clientY: 300, target: other };
    touchMulti(app, sym, 'touchstart', [A0], [A0]);
    touchMulti(app, other, 'touchstart', [A0, B0], [B0]);
    const A1 = { identifier: 0, clientX: 160, clientY: 20, target: sym };
    touchMulti(app, sym, 'touchend', [B0], [A1]);
    assert.eq(ans.value, '', 'swipe by finger A (60px) must not insert');
  });

  test('app: multitouch — tap on .sym while another finger rests elsewhere inserts', async () => {
    const app = await T.loadApp();
    const { ans, sym } = await openTyped(app);
    const other = app.$('#ans');
    const A0 = { identifier: 0, clientX: 200, clientY: 300, target: other };
    const B0 = { identifier: 1, clientX: 100, clientY: 20, target: sym };
    touchMulti(app, other, 'touchstart', [A0], [A0]);
    touchMulti(app, sym, 'touchstart', [A0, B0], [B0]);
    touchMulti(app, sym, 'touchend', [A0], [{ ...B0, clientX: 102 }]);
    assert.eq(ans.value, sym.dataset.ins, 'tap by finger B must insert');
  });
})();
