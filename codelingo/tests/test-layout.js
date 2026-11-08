// R8 (app shell), R9 (typography, no numbers), fill-in tap and mascot-hint overlap.
(() => {
  const { test, assert, collector, sleep } = T;
  const SIZES = [[320, 568], [390, 844]];
  const fe = (app) => app.win.frameElement;
  const resize = async (app, w, h) => { fe(app).style.width = w + 'px'; fe(app).style.height = h + 'px'; await sleep(80); };
  const allDone = () => {
    const prog = {};
    window.COURSES.forEach((c) => { prog[c.id] = { done: c.lessons.map((_, i) => i), ans: 20, ok: 15, xp: 400 }; });
    return { settings: { lang: 'cs', sound: false, hints: true, goal: 30 }, prog, days: {} };
  };
  const setLang = (app, l) => { const sel = app.$('select[data-set="lang"]'); sel.value = l; sel.dispatchEvent(new app.win.Event('change', { bubbles: true })); };
  const longestCourse = () => window.COURSES.reduce((a, c) => (c.lessons.length > a.lessons.length ? c : a)).id;

  function shellProblems(app, label, c) {
    const d = app.doc, w = app.win, ih = w.innerHeight;
    const de = d.documentElement;
    c.check(de.scrollHeight === ih, `${label}: scrollHeight ${de.scrollHeight} != innerHeight ${ih}`);
    c.check(w.scrollY === 0, `${label}: scrollY ${w.scrollY}`);
    const tb = app.$('#tabbar').getBoundingClientRect();
    c.check(Math.abs(tb.bottom - ih) < 0.5, `${label}: tabbar bottom ${tb.bottom} != ${ih}`);
    c.check(de.scrollWidth <= w.innerWidth, `${label}: horizontal overflow ${de.scrollWidth}>${w.innerWidth}`);
  }

  async function views(app, label, c, cid) {
    const go = async (name, fn) => { fn(); await sleep(30); shellProblems(app, `${label} ${name}`, c); };
    await go('learn', () => app.$('.tab[data-tab="learn"]').click());
    await go('course', () => app.$(`.course[data-id="${cid}"]`).click());
    await go('profile', () => app.$('.tab[data-tab="profile"]').click());
    await go('settings', () => app.$('.tab[data-tab="settings"]').click());
  }

  for (const [w, h] of SIZES) {
    test(`layout R8: document does not scroll, tab bar pinned (${w}x${h}, fresh)`, async () => {
      const app = await T.loadApp(); await resize(app, w, h);
      const c = collector(); await views(app, `${w}x${h}`, c, 'js'); c.done();
    });
    test(`layout R8: same with all courses done, lang cs (${w}x${h}, long content)`, async () => {
      const app = await T.loadApp({ state: allDone() }); await resize(app, w, h);
      const c = collector(); await views(app, `${w}x${h} long`, c, longestCourse());
      // text zoom-ish stress: bigger code size must not break the shell either
      app.doc.documentElement.style.setProperty('--code-size', '18px');
      app.$('.tab[data-tab="learn"]').click(); app.$(`.course[data-id="${longestCourse()}"]`).click();
      shellProblems(app, `${w}x${h} course L code`, c);
      const s = app.$('#screen');
      c.check(s.scrollHeight > s.clientHeight || w > 0, 'n/a');
      c.done();
    });
  }

  test('layout R8: #screen really is the scroller on long content (320x568)', async () => {
    const app = await T.loadApp({ state: allDone() }); await resize(app, 320, 568);
    const c = collector();
    for (const tab of ['profile', 'settings']) {
      app.$(`.tab[data-tab="${tab}"]`).click(); await sleep(30);
      const s = app.$('#screen');
      c.check(s.scrollHeight > s.clientHeight, `${tab}: expected overflow in #screen to exercise scroll (${s.scrollHeight}/${s.clientHeight})`);
      s.scrollTop = 9999;
      shellProblems(app, `${tab} scrolled`, c);
      app.$$('.tab').find((b) => b.dataset.tab !== tab && b.dataset.tab !== 'learn').click(); await sleep(30);
      c.check(app.$('#screen').scrollTop === 0, `tab switch from ${tab} left scrollTop=${app.$('#screen').scrollTop}`);
    }
    c.done();
  });

  test('layout R8: tab switch and Back reset #screen.scrollTop to 0', async () => {
    const app = await T.loadApp({ state: allDone() }); await resize(app, 320, 568);
    const c = collector(); const cid = longestCourse();
    app.$(`.course[data-id="${cid}"]`).click(); await sleep(30);
    let s = app.$('#screen'); s.scrollTop = 9999;
    c.check(s.scrollTop > 0, 'course screen did not scroll (test precondition)');
    app.$('.back').click(); await sleep(30);
    c.check(app.$('#screen').scrollTop === 0, 'Back left scrollTop=' + app.$('#screen').scrollTop);
    app.$('#screen').scrollTop = 9999;
    app.$('.tab[data-tab="settings"]').click(); await sleep(30);
    c.check(app.$('#screen').scrollTop === 0, 'tab switch left scrollTop=' + app.$('#screen').scrollTop);
    app.$('#screen').scrollTop = 9999;
    app.$('.tab[data-tab="learn"]').click(); await sleep(30);
    c.check(app.$('#screen').scrollTop === 0, 'tab back to learn left scrollTop=' + app.$('#screen').scrollTop);
    // leaving a lesson
    app.$(`.course[data-id="${cid}"]`).click(); app.$('.lesson-item[data-i="0"]').click(); await sleep(30);
    app.$('[data-act="quit"]').click(); await sleep(30);
    c.check(app.$('#screen').scrollTop === 0, 'exit lesson left scrollTop=' + app.$('#screen').scrollTop);
    c.done();
  });

  // ---- lesson driving helpers ----
  const taskOf = (app, lesson) => {
    const q = app.$('#lessonBody .q').textContent;
    const code = app.$('#lessonBody pre.code');
    const ct = code ? code.textContent.replace(/\s/g, '') : '';
    return lesson.tasks.find((t) => t.q.split('§').includes(q) && (!t.c || ct.startsWith(t.c.split('___')[0].replace(/\s/g, ''))));
  };
  function solve(app, lesson) {
    const { win, $, $$ } = app; const task = taskOf(app, lesson);
    assert(task, 'cannot identify task');
    if ($$('.opt').length) $(`.opt[data-i="${task.a}"]`).click();
    else if ($('.bank')) task.a.forEach((tok) => $$('.bank .tok').find((x) => !x.disabled && x.textContent === tok).click());
    else { const el = $('#ans'); el.value = task.a[0]; el.dispatchEvent(new win.Event('input', { bubbles: true })); }
    $('#checkBtn').click();
  }
  const cont = async (app) => { await sleep(420); app.$('#checkBtn').click(); };

  // ---- R9 audit ----
  const CODE_SEL = 'pre, code, .tok, .write, .fill, .opt.mono, .sym';
  function audit(app, where, c, seen) {
    const { win, doc } = app;
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const els = new Set();
    for (let n; (n = walker.nextNode());) if (n.nodeValue.trim() && n.parentElement) els.add(n.parentElement);
    doc.querySelectorAll('input:not([type=checkbox]):not([type=file]), textarea, select').forEach((e) => els.add(e));
    let fam = seen.fam;
    els.forEach((el) => {
      if (el.closest('script, style, [hidden], template') || !el.getClientRects().length) return;
      const cs = win.getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return;
      const id = `${where}: <${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}${el.id ? '#' + el.id : ''}> "${el.textContent.trim().slice(0, 14)}"`;
      const isCode = !!el.closest(CODE_SEL);
      if (!isCode) {
        if (fam === null) fam = seen.fam = cs.fontFamily;
        c.check(cs.fontFamily === fam, `${id} font-family ${cs.fontFamily.slice(0, 40)} != ${fam.slice(0, 40)}`);
      } else {
        c.check(/mono|Menlo|Consolas|Courier/i.test(cs.fontFamily), `${id} code not monospace: ${cs.fontFamily.slice(0, 40)}`);
      }
      const fs = parseFloat(cs.fontSize);
      // code: S/M/L setting (13/15/18); 16 = iOS no-zoom floor for inputs. Outside code only 13/17/22.
      if (!isCode) c.check([13, 17, 22].includes(fs), `${id} font-size ${cs.fontSize}`);
      else c.check([13, 15, 16, 18].includes(fs), `${id} code font-size ${cs.fontSize}`);
      c.check(['400', '600'].includes(cs.fontWeight), `${id} font-weight ${cs.fontWeight}`);
      if (cs.textTransform === 'uppercase' && el.id !== 'checkBtn' && !el.closest('#checkBtn')) c.check(false, `${id} uppercase`);
    });
  }

  test('typography R9: one font, sizes 13/17/22, weights 400/600, caps only on Check — all screens', async () => {
    const app = await T.loadApp({ state: { ...allDone(), settings: { lang: 'en', sound: false, hints: true, goal: 30 } } });
    const c = collector(); const seen = { fam: null };
    for (const lang of ['en', 'cs']) {
      if (lang === 'cs') { app.$('.tab[data-tab="settings"]').click(); setLang(app, 'cs'); }
      for (const tab of ['learn', 'profile', 'settings']) { app.$(`.tab[data-tab="${tab}"]`).click(); audit(app, `${lang} ${tab}`, c, seen); }
      app.$('.tab[data-tab="learn"]').click(); app.$('.course[data-id="js"]').click(); audit(app, `${lang} course`, c, seen);
    }
    // dark theme + largest code size
    app.$('.tab[data-tab="settings"]').click();
    app.$('[data-act="set"][data-k="theme"][data-v="dark"]').click(); app.$('[data-act="set"][data-k="code"][data-v="l"]').click();
    audit(app, 'dark settings', c, seen);
    c.done();
  });

  window.COURSES.forEach((course) => test(`typography R9 + hint overlap: ${course.id} lesson 1 — every task, sheet, finish`, async () => {
    const app = await T.loadApp({ state: { settings: { lang: 'en', sound: false, hints: true }, prog: {}, days: {} } });
    const c = collector(); const seen = { fam: null };
    app.$(`.course[data-id="${course.id}"]`).click();
    const lesson = course.lessons[0]; app.$('.lesson-item[data-i="0"]').click();
    for (let i = 0; i < lesson.tasks.length; i++) {
      const tag = `${course.id} t${i + 1}`;
      audit(app, tag, c, seen);
      // mascot hint must not overlap question / options
      app.$('#lmascot').click(); await sleep(20);
      const b = app.$('#bubble');
      if (!b.hidden) {
        const br = b.getBoundingClientRect();
        app.$$('#lessonBody .q, #lessonBody .opt').forEach((e) => {
          const r = e.getBoundingClientRect();
          const hit = r.width && r.height && br.left < r.right && br.right > r.left && br.top < r.bottom && br.bottom > r.top;
          c.check(!hit, `${tag}: hint bubble overlaps ${e.className} "${e.textContent.trim().slice(0, 12)}"`);
        });
        audit(app, tag + ' hint', c, seen);
        app.$('#lessonBody .q').click(); // click elsewhere hides the bubble
      }
      solve(app, lesson); await sleep(20);
      audit(app, tag + ' sheet', c, seen);
      await cont(app);
    }
    assert(app.$('.finish'), 'finish screen not reached');
    audit(app, `${course.id} finish`, c, seen);
    c.check(!/\d/.test(app.$('#lessonBody').textContent), 'finish screen has digits: ' + app.$('#lessonBody').textContent.trim());
    c.done();
  }));

  test('no numbers R9: profile has no %, no XP/streak/accuracy totals; goal N/M XP present', async () => {
    const dk = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
    const st = allDone(); st.settings.lang = 'en'; st.days = { [dk]: 12 };
    const app = await T.loadApp({ state: st });
    app.$('.tab[data-tab="profile"]').click();
    const c = collector(); const txt = app.$('#screen').textContent;
    c.check(/12\s*\/\s*30\s*XP/.test(txt), 'goal "12/30 XP" missing: ' + txt.replace(/\s+/g, ' ').slice(0, 120));
    c.check(!/%/.test(txt), 'profile contains %');
    const rest = txt.replace(/\d+\s*\/\s*\d+\s*XP/, '').replace(/Last 7 days/, 'Last days');
    c.check(!/\d/.test(rest), 'profile has digits outside goal: ' + (rest.match(/.{0,15}\d+.{0,15}/) || [''])[0].replace(/\s+/g, ' '));
    c.check(!/streak|accuracy|total/i.test(rest), 'profile mentions streak/accuracy/total');
    c.done();
  });

  test('no numbers R9: course cards on Learn have no digits (all langs)', async () => {
    const app = await T.loadApp({ state: allDone() });
    const c = collector();
    for (const lang of ['en', 'ru', 'uk', 'cs']) {
      app.$('.tab[data-tab="settings"]').click(); setLang(app, lang);
      app.$('.tab[data-tab="learn"]').click();
      app.$$('.course').forEach((el) => c.check(!/\d/.test(el.textContent), `${lang}: card "${el.textContent.trim()}" has digits`));
    }
    c.done();
  });

  test('fill-in R7: tap on pre.code.has-fill (not on the input) focuses #ans', async () => {
    let found = 0;
    for (const course of window.COURSES) {
      const app = await T.loadApp();
      app.$(`.course[data-id="${course.id}"]`).click();
      const lesson = course.lessons[0]; app.$('.lesson-item[data-i="0"]').click();
      for (let i = 0; i < lesson.tasks.length; i++) {
        const pre = app.$('pre.code.has-fill');
        if (pre) {
          found++;
          assert(app.doc.activeElement !== app.$('#ans'), 'precondition: not focused');
          pre.click();
          assert(app.doc.activeElement === app.$('#ans'), `${course.id} t${i + 1}: tap on pre did not focus #ans`);
          app.doc.activeElement.blur();
          app.$('pre.code.has-fill code').click();
          assert(app.doc.activeElement === app.$('#ans'), `${course.id} t${i + 1}: tap on code did not focus #ans`);
          break;
        }
        solve(app, lesson); await cont(app);
      }
      if (found >= 2) break;
    }
    assert(found > 0, 'no fill-in task found in any lesson 1');
  });
})();
