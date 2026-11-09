// End-to-end UI tests: the real app runs in an iPhone-sized iframe and is driven by clicks/typing.
(() => {
  const { test, assert, waitFor } = T;
  const KEY = 'codelingo.v1';
  let frame = null;

  // Fresh app instance. `state` optionally pre-seeds localStorage; `lang` forces UI language.
  T.loadApp = async ({ state, lang = 'en' } = {}) => {
    localStorage.removeItem(KEY);
    localStorage.setItem(KEY, JSON.stringify(state || { settings: { lang, sound: false, music: false } }));
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
    assert.eq(app.$('#sheet').textContent.trim(), 'Not quite', 'wrong sheet shows only the title');
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

  const cycle = (app, k) => app.$(`[data-act="cycle"][data-k="${k}"]`).click();

  test('app: settings — language is one button that cycles en → ru → uk → cs → en', async () => {
    const app = await T.loadApp();
    app.$('.tab[data-tab="settings"]').click();
    assert.eq(app.$$('[data-act="cycle"][data-k="lang"]').length, 1, 'one language button');
    assert(!app.$('select'), 'no language select');
    const names = { en: 'English', ru: 'Русский', uk: 'Українська', cs: 'Čeština' };
    assert.eq(app.$('[data-k="lang"]').textContent.trim(), names.en, 'shows the current language');
    for (const l of ['ru', 'uk', 'cs', 'en']) {
      cycle(app, 'lang');
      assert.eq(app.stored().settings.lang, l, 'persisted ' + l);
      assert.eq(app.doc.documentElement.lang, l, 'html lang ' + l);
      assert.eq(app.$('[data-k="lang"]').textContent.trim(), names[l], 'button label ' + l);
      assert.eq(app.$('.tab[data-tab="learn"] span').textContent, window.I18N[l].learn, 'tab label ' + l);
    }
  });

  test('app: settings — theme is one button that cycles Auto → Light → Dark → Auto', async () => {
    const app = await T.loadApp();
    app.$('.tab[data-tab="settings"]').click();
    assert.eq(app.$$('[data-act="cycle"][data-k="theme"]').length, 1, 'one theme button');
    assert.eq(app.$('[data-k="theme"]').textContent.trim(), window.I18N.en.system, 'starts at Auto');
    const want = [['light', 'light', '#F7F4EF'], ['dark', 'dark', '#17110B'], ['system', undefined, null]];
    for (const [v, attr, color] of want) {
      cycle(app, 'theme');
      assert.eq(app.stored().settings.theme, v, 'stored ' + v);
      assert.eq(app.doc.documentElement.dataset.theme, attr, 'data-theme for ' + v);
      assert.eq(app.$('[data-k="theme"]').textContent.trim(), window.I18N.en[v], 'label for ' + v);
      if (color) assert.eq(app.$('meta[name="theme-color"]').getAttribute('content'), color, 'theme-color for ' + v);
    }
  });

  test('app: settings — no code size, daily goal, export or import; toggles sound/music/hints/animations', async () => {
    const app = await T.loadApp();
    app.$('.tab[data-tab="settings"]').click();
    const c = T.collector();
    ['[data-k="code"]', '[data-k="goal"]', '[data-act="export"]', '[data-act="import"]', '#importFile', '.seg', 'select'].forEach((sel) => c.check(!app.$(sel), 'unexpected ' + sel));
    const txt = app.$('#screen').textContent;
    c.check(!/code text size|daily goal|export|import|XP/i.test(txt), 'removed settings still mentioned: ' + txt.replace(/\s+/g, ' ').slice(0, 160));
    c.check(app.$$('input[type=checkbox][data-set]').map((x) => x.dataset.set).join() === 'sound,music,hints,motion', 'toggles: ' + app.$$('input[data-set]').map((x) => x.dataset.set).join());
    c.check(app.$('input[data-set="music"]').checked === false, 'music off as stored');
    c.check(!!app.$('[data-act="reset"]'), 'reset button');
    c.check(/\d+\.\d+\.\d+/.test(app.$('.about').textContent), 'version line');
    c.check(app.doc.documentElement.style.getPropertyValue('--code-size') === '', 'no --code-size switching on <html>');
    ['codeSize', 'goal', 'exportP', 'importP', 'imported', 'importErr', 'data', 'today', 'week', 'lvl'].forEach((k) => ['en', 'ru', 'uk', 'cs'].forEach((l) => c.check(window.I18N[l][k] === undefined, `i18n ${l}.${k} still present`)));
    c.done();
  });

  test('app: music is on by default; the toggle stores it', async () => {
    const app = await T.loadApp({ state: { settings: { lang: 'en', sound: false } } });
    assert.eq(app.stored() && app.win.__codelingo.sanitize({}).settings.music, true, 'default music on');
    app.$('.tab[data-tab="settings"]').click();
    const box = app.$('input[data-set="music"]'); assert(box.checked, 'music toggle checked by default');
    box.checked = false; box.dispatchEvent(new app.win.Event('change', { bubbles: true }));
    assert.eq(app.stored().settings.music, false, 'persisted off');
  });

  test('app: sanitize keeps only known settings and valid best accuracy', async () => {
    const app = await T.loadApp();
    const s = app.win.__codelingo.sanitize({
      settings: { theme: 'neon', lang: 'ru', code: 'l', goal: 50, sound: 'yes', music: false, extra: 1 },
      prog: { js: { done: [0], ans: 5, ok: 4, xp: 10, best: { 0: 87.6, 1: 150, 2: -5, 3: 'x', 9: '40', 10: 90, '-1': 50, '1.5': 60, abc: 70, 4: null, 5: true } } },
    });
    assert.eq(Object.keys(s.settings).sort().join(), 'hints,lang,motion,music,sound,theme', 'settings keys');
    assert.eq(s.settings.theme, 'system', 'bad theme reset');
    assert.eq(s.settings.lang, 'ru', 'lang kept');
    assert.eq(s.settings.sound, true, 'non-boolean sound -> default');
    assert.eq(s.settings.music, false, 'music kept');
    assert.eq(JSON.stringify(s.prog.js.best), JSON.stringify({ 0: 88, 1: 100, 2: 0, 9: 40 }), 'best sanitized');
    assert.eq(JSON.stringify(app.win.__codelingo.sanitize({ prog: { js: { best: [1, 2] } } }).prog.js.best), '{}', 'array best dropped');
  });

  test('app: finishing a lesson stores best accuracy = max(old, new)', async () => {
    const app = await T.loadApp({ state: { settings: { lang: 'en', sound: false, music: false }, prog: { js: { done: [], ans: 0, ok: 0, xp: 0, best: { 0: 95 } } } } });
    await openLesson(app, 'js', 0);
    const n = lessonCtx.tasks.length;
    assert(!answer(app, false), 'wrong'); await cont(app);
    for (let i = 0; i < n; i++) { answer(app, true); await cont(app); }
    assert(app.$('.finish'), 'finished');
    assert.eq(app.stored().prog.js.best[0], 95, 'lower accuracy keeps the old best');
    app.$('#checkBtn').click();
    // second run with a fresh best
    const app2 = await T.loadApp({ state: { settings: { lang: 'en', sound: false, music: false }, prog: { js: { done: [], ans: 0, ok: 0, xp: 0, best: { 0: 10 } } } } });
    await openLesson(app2, 'js', 0);
    assert(!answer(app2, false), 'wrong'); await cont(app2);
    for (let i = 0; i < n; i++) { answer(app2, true); await cont(app2); }
    assert.eq(app2.stored().prog.js.best[0], Math.round((100 * n) / (n + 1)), 'best = round(100*ok/ans)');
  });

  test('app: fill-blank check treats "$" in the input literally ($$ bug)', async () => {
    const app = await T.loadApp();
    const { isCorrect } = app.win.__codelingo;
    const task = { t: 'f', c: 'const s = `${___}`;', a: ['name'] };
    assert(isCorrect(task, 'js', 'name'), 'right answer accepted');
    const tpl = { t: 'f', c: 'x = ___;', a: ['"${"'] };
    assert(isCorrect(tpl, 'js', '"${"'), 'literal ${ accepted');
    assert(!isCorrect(tpl, 'js', '"$${"'), '"$${" must not equal "${"');
    assert(!isCorrect({ t: 'f', c: 'a ___ b', a: ['x'] }, 'js', '$&'), '"$&" must not insert the match');
    const dd = { t: 'f', c: 'v = ___', a: ['$$'] };
    assert(isCorrect(dd, 'js', '$$'), 'answer "$$" stays literal and is accepted');
    assert(!isCorrect(dd, 'js', '$'), '"$" must not equal the "$$" answer');
    assert(!('correctText' in app.win.__codelingo), 'correctText removed (the answer is never shown)');
  });

  test('app: plain-word options render in the system font, code options in mono (R9)', async () => {
    const app = await T.loadApp();
    const { optText } = app.win.__codelingo;
    assert.eq(optText('HyperText Markup Language').code, false, 'prose');
    assert.eq(optText('<p>').code, true, 'tag');
    assert.eq(optText('font size').code, false, 'two words');
    assert.eq(optText('a = b').code, true, 'has =');
    assert.eq(optText('color').code, true, 'one word without space stays code');
    assert.eq(optText('print("hi")').code, true, 'call');
    await openLesson(app, 'html', 0);
    const opt = app.$$('.opt').find((o) => o.textContent === 'HyperText Markup Language');
    assert(opt, 'HTML first task shows the option');
    assert(!opt.classList.contains('mono'), 'no mono class');
    assert(!/mono|Menlo/i.test(app.win.getComputedStyle(opt).fontFamily), 'system font: ' + app.win.getComputedStyle(opt).fontFamily);
  });

  test('app: learn screen — no subtitle, 6 cards, check only on a fully passed course', async () => {
    const full = window.COURSES.find((c) => c.id === 'css');
    const app = await T.loadApp({ state: { settings: { lang: 'en', sound: false, music: false }, prog: { css: { done: full.lessons.map((_, i) => i), ans: 10, ok: 10, xp: 0 }, js: { done: [0, 1, 2], ans: 3, ok: 3, xp: 0 } } } });
    assert(!app.$('.sub'), 'no subtitle');
    assert.eq(app.$$('#screen > *').length, 2, 'only header and grid');
    assert.eq(app.$$('.course').length, 6, 'cards');
    assert.eq(app.$$('.course .cdone').length, 1, 'one done mark');
    assert(app.$('.course[data-id="css"] .cdone'), 'on the CSS card');
    assert(/Completed/.test(app.$('.course[data-id="css"]').getAttribute('aria-label')), 'done mark announced');
  });

  test('app: course screen shows k% styled exactly like the course name; lesson statuses', async () => {
    // k = round(100 * 2/10 * (0.5 + 0.5 * 0.8)) = 18
    const app = await T.loadApp({ state: { settings: { lang: 'en', sound: false, music: false }, prog: { js: { done: [0, 1], ans: 10, ok: 8, xp: 0 } } } });
    app.$('.course[data-id="js"]').click();
    const head = app.$('.course-head'); assert(head, 'course header');
    assert(head.querySelector('.badge'), 'tag');
    const name = head.querySelector('h1'); const pct = head.querySelector('.kpct');
    assert.eq(name.textContent, 'JavaScript', 'name');
    assert.eq(pct.textContent, '18%', 'percent = knowledge()');
    const a = app.win.getComputedStyle(name), b = app.win.getComputedStyle(pct);
    ['fontSize', 'fontWeight', 'color', 'fontFamily'].forEach((k) => assert.eq(b[k], a[k], 'percent ' + k));
    const items = app.$$('.lesson-item');
    assert(items[0].querySelector('.st svg') && items[1].querySelector('.st svg'), 'done = pixel check');
    assert.eq(items[2].querySelector('.go').textContent, 'Start', 'next = Start');
    assert(items[3].disabled && items[3].querySelector('.st svg'), 'locked = lock');
    assert(!items.some((el) => /\d/.test(el.textContent)), 'no lesson numbers');
    const hs = new Set(items.map((el) => Math.round(el.getBoundingClientRect().height)));
    assert.eq(hs.size, 1, 'equal row heights: ' + [...hs].join(','));
    const fresh = await T.loadApp(); fresh.$('.course[data-id="py"]').click();
    assert.eq(fresh.$('.kpct').textContent, '0%', 'untouched course 0%');
  });

  test('app: profile — 7-day strip without label, one block with a 10-segment bar per course', async () => {
    const dk = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
    const app = await T.loadApp({ state: { settings: { lang: 'en', sound: false, music: false }, prog: { js: { done: [0, 1, 2, 3], ans: 10, ok: 5, xp: 150, best: { 0: 100, 1: 90, 2: 89, 3: 59, 4: 100 } } }, days: { [dk]: 15 } } });
    app.$('.tab[data-tab="profile"]').click();
    const c = T.collector();
    c.check(!app.$('.today') && !app.$('.goal'), 'no today/goal block');
    c.check(!/Last 7 days|Today|XP|Knowledge/i.test(app.$('#screen').textContent), 'removed labels present');
    c.check(app.$$('.week i').length === 7 && app.$$('.week i.on').length === 1, '7-day strip with today on');
    c.check(app.$$('.krow').length === 6, 'one row per course');
    app.$$('.krow').forEach((r) => c.check(r.querySelectorAll('.segbar i').length === 10, r.dataset.id + ': 10 segments'));
    const segs = app.$$('.krow[data-id="js"] .segbar i').map((i) => i.className);
    c.check(segs.join() === 'ok,ok,mid,bad,,,,,,', 'js segments: ' + segs.join());
    const ws = new Set(app.$$('.krow[data-id="js"] .segbar i').map((i) => Math.round(i.getBoundingClientRect().width)));
    c.check(ws.size === 1, 'equal segment widths: ' + [...ws].join());
    const outside = app.$('#screen').cloneNode(true); outside.querySelectorAll('.krow').forEach((r) => r.remove());
    c.check(!/\d/.test(outside.textContent), 'digits in profile outside the course blocks: ' + outside.textContent.replace(/\s+/g, ' '));
    c.check(!app.$('.lvl'), 'no level words');
    const rows = app.$$('.krow').map((r) => r.getBoundingClientRect());
    for (let i = 1; i < rows.length; i++) c.check(Math.round(rows[i].top - rows[i - 1].bottom) === 16, `block gap ${rows[i].top - rows[i - 1].bottom}`);
    app.$$('.krow').forEach((r) => {
      const cs = app.win.getComputedStyle(r);
      c.check(cs.boxShadow === 'none', r.dataset.id + ': static block has a shadow');
      c.check(cs.borderTopWidth === '2px' && cs.borderTopStyle === 'solid' && cs.paddingTop === '16px' && cs.paddingLeft === '16px', `${r.dataset.id}: border ${cs.borderTopWidth} ${cs.borderTopStyle}, padding ${cs.padding}`);
    });
    app.$$('#screen *').forEach((el) => { const cs = app.win.getComputedStyle(el); if (cs.borderBottomStyle === 'dotted' || cs.borderTopStyle === 'dotted') c.check(false, 'dotted rule on ' + el.className); });
    const ok = app.win.getComputedStyle(app.$('.segbar i.ok')).backgroundColor, mid = app.win.getComputedStyle(app.$('.segbar i.mid')).backgroundColor;
    c.check(ok !== mid && mid !== 'rgba(0, 0, 0, 0)', 'mid colour set: ' + mid);
    c.done();
  });

  // Screen 4: per-course stats in the profile blocks.
  const statOf = (app, id) => { const r = app.$(`.krow[data-id="${id}"]`); return { name: r.querySelector('.course-head h2').textContent, pct: r.querySelector('.kpct').textContent, les: r.querySelector('.kles').textContent, acc: r.querySelector('.kacc').textContent }; };
  const NB = ' ';

  test('app: profile blocks show "Lessons N of 10" and "Correct answers P% (ok of ans)", "—" without answers', async () => {
    const app = await T.loadApp({ state: { settings: { lang: 'en', sound: false, music: false }, prog: { js: { done: [0, 1, 2], ans: 30, ok: 24, xp: 0 }, py: { done: [], ans: 3, ok: 0, xp: 0 }, css: { done: [0], ans: 3, ok: 2, xp: 0 } } } });
    app.$('.tab[data-tab="profile"]').click();
    const c = T.collector();
    const js = statOf(app, 'js');
    c.check(js.les === `Lessons 3${NB}of${NB}10`, 'js lessons: ' + js.les);
    c.check(js.acc === `Correct answers 80% (24${NB}of${NB}30)`, 'js accuracy: ' + js.acc);
    c.check(statOf(app, 'py').acc === `Correct answers 0% (0${NB}of${NB}3)`, 'py 0%: ' + statOf(app, 'py').acc);
    c.check(statOf(app, 'css').acc === `Correct answers 67% (2${NB}of${NB}3)`, 'css rounds 66.7 to 67: ' + statOf(app, 'css').acc);
    const html = statOf(app, 'html');
    c.check(html.les === `Lessons 0${NB}of${NB}10`, 'untouched lessons: ' + html.les);
    c.check(html.acc === `Correct answers${NB}—`, 'no answers -> dash: ' + html.acc);
    c.check(!/\d/.test(html.acc), 'no number when there are no answers');
    c.check(!app.$('.lvl') && !/beginner|novice|expert|level/i.test(app.$('.klist').textContent), 'no level words');
    // ru wording from the SPEC
    const ru = await T.loadApp({ state: { settings: { lang: 'ru', sound: false, music: false }, prog: { js: { done: [0, 1, 2], ans: 30, ok: 24, xp: 0 } } } });
    ru.$('.tab[data-tab="profile"]').click();
    c.check(statOf(ru, 'js').les === `Уроки 3${NB}из${NB}10`, 'ru lessons: ' + statOf(ru, 'js').les);
    c.check(statOf(ru, 'js').acc === `Верных ответов 80% (24${NB}из${NB}30)`, 'ru accuracy: ' + statOf(ru, 'js').acc);
    c.check(statOf(ru, 'html').acc === `Верных ответов${NB}—`, 'ru dash: ' + statOf(ru, 'html').acc);
    c.done();
  });

  test('app: profile block percent equals the course screen percent, same header style (R9)', async () => {
    const prog = { js: { done: [0, 1, 2, 3], ans: 10, ok: 5, xp: 0 }, py: { done: [0], ans: 7, ok: 6, xp: 0 }, css: { done: [], ans: 4, ok: 4, xp: 0 } };
    const app = await T.loadApp({ state: { settings: { lang: 'en', sound: false, music: false }, prog } });
    const c = T.collector(); const cs = (el) => app.win.getComputedStyle(el);
    const look = (el) => ['fontSize', 'fontWeight', 'fontFamily', 'lineHeight', 'color'].map((k) => cs(el)[k]).join('|');
    for (const cr of window.COURSES) {
      app.$('.tab[data-tab="learn"]').click(); app.$(`.course[data-id="${cr.id}"]`).click();
      const coursePct = app.$('.course-head .kpct').textContent; const nameLook = look(app.$('.course-head h1')); const pctLook = look(app.$('.course-head .kpct'));
      app.$('.tab[data-tab="profile"]').click();
      const r = app.$(`.krow[data-id="${cr.id}"]`);
      c.check(r.querySelector('.kpct').textContent === coursePct, `${cr.id}: profile ${r.querySelector('.kpct').textContent} vs course ${coursePct}`);
      c.check(look(r.querySelector('.course-head h2')) === nameLook, `${cr.id}: name look ${look(r.querySelector('.course-head h2'))} vs ${nameLook}`);
      c.check(look(r.querySelector('.kpct')) === pctLook, `${cr.id}: percent look differs`);
      const h = r.querySelector('.course-head h2').getBoundingClientRect(), k = r.querySelector('.kpct').getBoundingClientRect();
      c.check(k.left > h.right && Math.abs(r.getBoundingClientRect().right - 18 - k.right) <= 1, `${cr.id}: percent not on the right`);
    }
    c.check(statOf(app, 'js').pct === '30%' && statOf(app, 'css').pct === '0%', 'formula: js 30%, css 0% ' + statOf(app, 'js').pct);
    const st = cs(app.$('.kstat'));
    c.check(st.fontSize === '13px', 'caption 13px: ' + st.fontSize);
    c.done();
  });

  test('app: profile caption parts stack at 320px instead of shrinking or breaking words (R10)', async () => {
    const prog = {}; window.COURSES.forEach((cr) => { prog[cr.id] = { done: cr.lessons.map((_, i) => i), ans: 1000, ok: 999, xp: 0 }; });
    const c = T.collector();
    for (const lang of ['en', 'ru', 'uk', 'cs']) {
      const app = await T.loadApp({ state: { settings: { lang, sound: false, music: false }, prog } });
      app.win.frameElement.style.width = '320px'; app.win.frameElement.style.height = '568px'; await T.sleep(60);
      app.$('.tab[data-tab="profile"]').click(); await T.sleep(30);
      app.$$('.krow').forEach((r) => {
        const rr = r.getBoundingClientRect(); const id = lang + ' ' + r.dataset.id;
        const les = r.querySelector('.kles'), acc = r.querySelector('.kacc');
        [les, acc].forEach((el) => {
          c.check(app.win.getComputedStyle(el).fontSize === '13px', `${id}: caption font ${app.win.getComputedStyle(el).fontSize}`);
          const b = el.getBoundingClientRect();
          c.check(b.left >= rr.left + 17 && b.right <= rr.right - 17, `${id}: ${el.className} overflows the block`);
          const rects = [...el.getClientRects()]; c.check(new Set(rects.map((x) => Math.round(x.top))).size === 1, `${id}: ${el.className} wraps inside`);
        });
        const a = les.getBoundingClientRect(), b = acc.getBoundingClientRect();
        c.check(Math.round(b.top) === Math.round(a.top) || b.top >= a.bottom - 0.5, `${id}: caption parts overlap`);
      });
      c.check(app.doc.documentElement.scrollWidth <= 320, `${lang}: horizontal overflow`);
    }
    c.done();
  });

  // Screen 3: a wrong answer reveals nothing.
  test('app: wrong answer sheet shows only the title, no correct answer (MCQ and typed)', async () => {
    const app = await T.loadApp({ state: { settings: { lang: 'en', sound: false, music: false } } });
    const L = app.win.COURSES.find((cr) => cr.id === 'js').lessons[0];
    const saved = L.tasks.map((x) => ({ ...x }));
    const set = (task) => L.tasks.forEach((x) => { Object.keys(x).forEach((k) => delete x[k]); Object.assign(x, task); });
    const open = () => { app.$('.tab[data-tab="learn"]').click(); app.$('.course[data-id="js"]').click(); app.$('.lesson-item[data-i="0"]').click(); };
    const quit = () => { app.$('[data-act="quit"]').click(); };
    const c = T.collector();
    const sheetOk = (tag, secret) => {
      const sh = app.$('#sheet');
      c.check(!sh.hidden && sh.classList.contains('bad'), `${tag}: wrong sheet shown`);
      c.check(sh.textContent.trim() === 'Not quite', `${tag}: sheet text "${sh.textContent.trim()}"`);
      c.check(sh.querySelector('h3 svg') !== null, `${tag}: cross icon`);
      c.check(!sh.querySelector('pre, .small'), `${tag}: answer elements in the sheet`);
      c.check(!sh.textContent.includes(secret) && !/Correct answer/i.test(sh.textContent), `${tag}: sheet reveals the answer`);
    };
    try {
      set({ t: 'm', q: 'Pick', o: ['ZETA_RIGHT', 'alpha', 'beta', 'gamma'], a: 0 });
      open();
      app.$('.opt[data-i="1"]').click(); app.$('#checkBtn').click();
      sheetOk('mcq', 'ZETA_RIGHT');
      c.check(app.$('.opt[data-i="1"]').classList.contains('wrong'), 'mcq: the pick is marked wrong');
      c.check(!app.$('.opt.right'), 'mcq: the right option is not highlighted after a wrong pick');
      quit();
      for (const [kind, task] of [['fill', { t: 'f', q: 'Fill', c: 'v = ___', a: ['QQ_RIGHT'] }], ['write', { t: 'w', q: 'Write', a: ['QQ_RIGHT()'] }]]) {
        set(task); open();
        const el = app.$('#ans'); el.value = 'nope'; el.dispatchEvent(new app.win.Event('input', { bubbles: true }));
        app.$('#checkBtn').click();
        sheetOk(kind, 'QQ_RIGHT');
        quit();
      }
      // a right MCQ pick is still marked right
      set({ t: 'm', q: 'Pick', o: ['ZETA_RIGHT', 'alpha', 'beta', 'gamma'], a: 0 }); open();
      app.$('.opt[data-i="0"]').click(); app.$('#checkBtn').click();
      c.check(app.$('.opt[data-i="0"]').classList.contains('right') && app.$('#sheet').classList.contains('ok'), 'mcq: right pick marked right');
      quit();
    } finally { L.tasks.forEach((x, i) => { Object.keys(x).forEach((k) => delete x[k]); Object.assign(x, saved[i]); }); }
    c.done();
  });

  // Music (R11): a fake AudioContext records what the app does with it.
  function fakeAudio(win) {
    const log = { ctx: 0, osc: [], resumed: 0, suspended: 0, refuseResume: false };
    const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} });
    const node = () => ({ connect() {}, disconnect() {} });
    class FakeCtx {
      constructor() { log.ctx++; this.state = 'running'; this.destination = node(); this.t0 = performance.now(); }
      get currentTime() { return (performance.now() - this.t0) / 1000; }
      resume() { log.resumed++; if (!log.refuseResume) this.state = 'running'; return Promise.resolve(); }
      suspend() { log.suspended++; this.state = 'suspended'; return Promise.resolve(); }
      createGain() { const g = node(); g.gain = param(); log.lastGain = g; return g; }
      createOscillator() { const o = node(); o.frequency = { ...param(), setValueAtTime: (f) => log.osc.push(f) }; o.start = () => {}; o.stop = () => {}; return o; }
    }
    win.AudioContext = FakeCtx; win.webkitAudioContext = undefined;
    return log;
  }
  const setHidden = (app, hidden) => {
    Object.defineProperty(app.doc, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
    app.doc.dispatchEvent(new app.win.Event('visibilitychange'));
  };

  test('app: music starts with a lesson, stops on exit, finish and hidden; resumes only in a lesson', async () => {
    const app = await T.loadApp({ state: { settings: { lang: 'en', sound: false, music: true } } });
    const log = fakeAudio(app.win); const M = app.win.CLMusic;
    assert(!M.playing, 'silent on the home screen');
    await openLesson(app, 'js', 0);
    assert(M.playing, 'playing after lesson start');
    await T.sleep(120);
    assert(log.osc.length > 0, 'notes scheduled');
    assert(log.osc.every((f) => f <= 1000), 'no notes above 1 kHz: ' + Math.max(...log.osc));
    assert(M.GAIN <= 0.03 && M.BPM === 100 && M.BARS >= 8 && M.BARS <= 16, 'gain/bpm/bars');
    setHidden(app, true); assert(!M.playing, 'stops when hidden');
    const n = log.osc.length; await T.sleep(100); assert.eq(log.osc.length, n, 'no notes while hidden');
    setHidden(app, false); assert(M.playing, 'resumes when visible in a lesson');
    app.$('[data-act="quit"]').click(); // no answers yet: no confirm
    assert(app.$('#lesson').hidden && !M.playing, 'stops on exit');
    setHidden(app, true); setHidden(app, false);
    assert(!M.playing, 'does not resume outside a lesson');
    // finish screen
    app.$('.back').click();
    await openLesson(app, 'js', 0);
    for (let i = 0; i < lessonCtx.tasks.length; i++) { answer(app, true); await cont(app); }
    assert(app.$('.finish'), 'finish');
    assert(!M.playing, 'stops on the finish screen');
    setHidden(app, true); setHidden(app, false);
    assert(!M.playing, 'does not resume on the finish screen');
  });

  test('app: music suspends the context on stop and hidden; a refused resume restarts on the next tap', async () => {
    const app = await T.loadApp({ state: { settings: { lang: 'en', sound: false, music: true } } });
    const log = fakeAudio(app.win); const M = app.win.CLMusic;
    await openLesson(app, 'js', 0);
    assert(M.playing, 'playing');
    setHidden(app, true);
    assert(log.suspended === 1 && !M.playing, 'hidden: context suspended, not playing');
    log.refuseResume = true; // iOS: no resume without a gesture
    setHidden(app, false);
    await T.sleep(30);
    assert(!M.playing, 'playing reflects the suspended context');
    app.$('#lessonBody').dispatchEvent(new app.win.Event('pointerdown', { bubbles: true }));
    assert(!M.playing, 'still refused');
    log.refuseResume = false;
    setHidden(app, true); setHidden(app, false); await T.sleep(30);
    assert(M.playing, 'normal resume on visible');
    setHidden(app, true); log.refuseResume = true; setHidden(app, false); await T.sleep(30);
    assert(!M.playing, 'refused again');
    log.refuseResume = false;
    app.$('#lessonBody').dispatchEvent(new app.win.Event('pointerdown', { bubbles: true }));
    assert(M.playing, 'the next tap in the lesson restarts the music');
    const n = log.suspended;
    app.$('[data-act="quit"]').click();
    assert(log.suspended === n + 1 && !M.playing, 'exit suspends the context');
    assert.eq(log.ctx, 1, 'one AudioContext');
  });

  test('app: sound effects reuse the music AudioContext and play after the music stops', async () => {
    const app = await T.loadApp({ state: { settings: { lang: 'en', sound: true, music: true } } });
    const log = fakeAudio(app.win);
    await openLesson(app, 'js', 0);
    for (let i = 0; i < lessonCtx.tasks.length; i++) { answer(app, true); await cont(app); }
    assert(app.$('.finish'), 'finish');
    assert.eq(log.ctx, 1, 'one shared AudioContext');
    assert.eq(app.win.CLMusic.context().state, 'running', 'the done jingle resumed the context after music.stop()');
  });

  test('app: typed tasks — symbol bar docked on the footer, textarea fills the height, hidden after Check', async () => {
    const app = await T.loadApp();
    const c = window.COURSES.find((x) => x.lessons[0].tasks.some((tk) => tk.t === 'w'));
    assert(c, 'a course with a write task in lesson 1');
    await openLesson(app, c.id, 0);
    assert(app.$('#symdock').hidden, 'no symbol bar on a non-typed task') ;
    for (let i = 0; i < lessonCtx.tasks.length && !app.$('textarea#ans'); i++) { answer(app, true); await cont(app); }
    const ta = app.$('textarea#ans'); assert(ta, 'write task reached');
    const dock = app.$('#symdock');
    assert(!dock.hidden && dock.querySelector('.symbar'), 'symbol bar in the dock');
    assert(!app.$('#lessonBody .symbar'), 'not inside the scrolling body');
    const dr = dock.getBoundingClientRect(), fr = app.$('.lfoot').getBoundingClientRect();
    assert(Math.abs(fr.top - dr.bottom) <= 1, `dock ${dr.bottom} vs footer ${fr.top}`);
    const body = app.$('#lessonBody'); const br = body.getBoundingClientRect();
    const pad = parseFloat(app.win.getComputedStyle(body).paddingBottom);
    assert(Math.abs(br.bottom - pad - ta.getBoundingClientRect().bottom) <= 1, 'textarea fills to the bottom of the body');
    assert(ta.getBoundingClientRect().height >= 140, 'min height kept');
    answer(app, true);
    assert(dock.hidden, 'symbol bar hidden after Check');
  });

  test('app: passed lesson row announces "Completed"; settings show only "CodeLingo · version"', async () => {
    const app = await T.loadApp({ state: { settings: { lang: 'en', sound: false, music: false }, prog: { js: { done: [0], ans: 1, ok: 1, xp: 0 } } } });
    app.$('.course[data-id="js"]').click();
    const sr = app.$('.lesson-item[data-i="0"] .st .sr-only');
    assert(sr && sr.textContent === 'Completed', 'visually hidden completed text');
    assert(!app.$('.lesson-item[data-i="1"] .sr-only'), 'only on passed lessons');
    app.$('.tab[data-tab="settings"]').click();
    assert(/^CodeLingo · \d+\.\d+\.\d+$/.test(app.$('.about').textContent.trim()), 'about: ' + app.$('.about').textContent);
    ['en', 'ru', 'uk', 'cs'].forEach((l) => assert(window.I18N[l].offline === undefined && window.I18N[l].version === undefined, l + ': unused keys'));
  });

  test('app: music respects the setting and never throws without AudioContext', async () => {
    const app = await T.loadApp({ state: { settings: { lang: 'en', sound: false, music: false } } });
    const log = fakeAudio(app.win);
    await openLesson(app, 'js', 0);
    assert(!app.win.CLMusic.playing && log.ctx === 0, 'music off: nothing created');
    app.$('[data-act="quit"]').click();
    const app2 = await T.loadApp({ state: { settings: { lang: 'en', sound: false, music: true } } });
    const errs = []; app2.win.addEventListener('error', (e) => errs.push(String(e.message)));
    app2.win.AudioContext = undefined; app2.win.webkitAudioContext = undefined;
    await openLesson(app2, 'js', 0);
    assert(!app2.win.CLMusic.playing, 'not playing without AudioContext');
    setHidden(app2, true); setHidden(app2, false);
    app2.$('[data-act="quit"]').click();
    app2.win.AudioContext = function () { throw new Error('blocked'); };
    app2.$('.back').click();
    await openLesson(app2, 'js', 0);
    assert(!app2.win.CLMusic.playing, 'not playing when the constructor throws');
    assert.eq(errs.length, 0, 'errors: ' + errs.join('; '));
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
    assert(app.$$('.krow .segbar').length === 6, 'profile renders a bar per course');
    assert(!/NaN|undefined/.test(app.$('#screen').textContent), 'no NaN/undefined in profile');
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

  // --- Edge cases: touch without touchstart, multitouch ---
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
