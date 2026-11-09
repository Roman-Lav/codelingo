// R8 (app shell), R9 (typography, no numbers), fill-in tap and mascot-hint overlap.
(() => {
  const { test, assert, collector, sleep } = T;
  const SIZES = [[320, 568], [390, 844]];
  const fe = (app) => app.win.frameElement;
  const resize = async (app, w, h) => { fe(app).style.width = w + 'px'; fe(app).style.height = h + 'px'; await sleep(80); };
  const allDone = () => {
    const prog = {};
    window.COURSES.forEach((c) => { prog[c.id] = { done: c.lessons.map((_, i) => i), ans: 20, ok: 15, xp: 400 }; });
    return { settings: { lang: 'cs', sound: false, music: false, hints: true }, prog, days: {} };
  };
  // Language is one button that cycles en -> ru -> uk -> cs; tap until the wanted one.
  const setLang = (app, l) => { for (let i = 0; i < 4 && app.doc.documentElement.lang !== l; i++) app.$('[data-act="cycle"][data-k="lang"]').click(); };
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
    else T.typeText(app, task.a[0]);
    $('#checkBtn').click();
  }
  const cont = async (app) => { await sleep(420); app.$('#checkBtn').click(); };

  // ---- R9 audit ----
  const CODE_SEL = 'pre, code, .tok, .write, .fill, .opt.mono';
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
      // code: fixed 15px; 16 = iOS no-zoom floor for inputs. Outside code only 13/17/22.
      if (!isCode) c.check([13, 17, 22].includes(fs), `${id} font-size ${cs.fontSize}`);
      else c.check([15, 16].includes(fs), `${id} code font-size ${cs.fontSize}`);
      c.check(['400', '600'].includes(cs.fontWeight), `${id} font-weight ${cs.fontWeight}`);
      if (cs.textTransform === 'uppercase' && el.id !== 'checkBtn' && !el.closest('#checkBtn')) c.check(false, `${id} uppercase`);
    });
  }

  test('typography R9: one font, sizes 13/17/22, weights 400/600, caps only on Check — all screens', async () => {
    const app = await T.loadApp({ state: { ...allDone(), settings: { lang: 'en', sound: false, music: false, hints: true } } });
    const c = collector(); const seen = { fam: null };
    for (const lang of ['en', 'cs']) {
      if (lang === 'cs') { app.$('.tab[data-tab="settings"]').click(); setLang(app, 'cs'); }
      for (const tab of ['learn', 'profile', 'settings']) { app.$(`.tab[data-tab="${tab}"]`).click(); audit(app, `${lang} ${tab}`, c, seen); }
      app.$('.tab[data-tab="learn"]').click(); app.$('.course[data-id="js"]').click(); audit(app, `${lang} course`, c, seen);
    }
    // dark theme
    app.$('.tab[data-tab="settings"]').click();
    for (let i = 0; i < 3 && app.doc.documentElement.dataset.theme !== 'dark'; i++) app.$('[data-act="cycle"][data-k="theme"]').click();
    audit(app, 'dark settings', c, seen);
    c.done();
  });

  window.COURSES.forEach((course) => test(`typography R9 + hint overlap: ${course.id} lesson 1 — every task, sheet, finish`, async () => {
    const app = await T.loadApp({ state: { settings: { lang: 'en', sound: false, music: false, hints: true }, prog: {}, days: {} } });
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

  test('no numbers R9: digits only in the profile course blocks; settings only in the version line', async () => {
    const dk = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
    const st = allDone(); st.settings.lang = 'en'; st.days = { [dk]: 12 };
    const app = await T.loadApp({ state: st });
    const c = collector();
    app.$('.tab[data-tab="profile"]').click();
    const scr = app.$('#screen').cloneNode(true);
    const blocks = [...scr.querySelectorAll('.klist > .krow')];
    c.check(blocks.length === window.COURSES.length, 'one block per course');
    // Inside a block numbers live only in the percent and the stats caption (screen 4).
    blocks.forEach((b) => {
      const rest = b.cloneNode(true); rest.querySelectorAll('.kpct, .kstat').forEach((e) => e.remove());
      c.check(!/\d|%/.test(rest.textContent), `${b.dataset.id}: digits outside percent/stats: ${rest.textContent.replace(/\s+/g, ' ')}`);
      c.check(/^\d+%$/.test(b.querySelector('.kpct').textContent), `${b.dataset.id}: percent ${b.querySelector('.kpct').textContent}`);
    });
    blocks.forEach((b) => b.remove());
    const txt = scr.textContent;
    c.check(!/\d|%/.test(txt), 'profile has digits outside the course blocks: ' + (txt.match(/.{0,15}\d+.{0,15}/) || [''])[0].replace(/\s+/g, ' '));
    c.check(!/streak|accuracy|total|XP/i.test(app.$('#screen').textContent), 'profile mentions streak/accuracy/total/XP');
    app.$('.tab[data-tab="settings"]').click();
    const set = app.$('#screen').textContent.replace(app.$('.about').textContent, '');
    c.check(!/\d/.test(set), 'settings has digits outside the version line');
    c.done();
  });

  // ---- R10 geometry ----
  const px = (v) => Math.round(parseFloat(v));
  // Every word of the element's text sits on one line (no break inside a word).
  function wordsWhole(app, el) {
    const bad = [];
    const walker = app.doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n; (n = walker.nextNode());) {
      const re = /\S+/g; let m;
      while ((m = re.exec(n.nodeValue))) {
        const r = app.doc.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length);
        const tops = new Set([...r.getClientRects()].map((x) => Math.round(x.top)));
        if (tops.size > 1) bad.push(m[0]);
      }
    }
    return bad;
  }

  for (const [w, h] of [[320, 568], [390, 844], [760, 1024]]) {
    test(`geometry R10: grid, paddings, gaps, centring, shadows (${w}x${h})`, async () => {
      const app = await T.loadApp({ state: allDone() }); await resize(app, w, h);
      const c = collector(); const cs = (el) => app.win.getComputedStyle(el);
      for (const l of ['cs', 'uk']) {
        app.$('.tab[data-tab="settings"]').click(); setLang(app, l); app.$('.tab[data-tab="learn"]').click(); await sleep(30);
        const scr = app.$('#screen'); const grid = app.$('.grid'); const cards = app.$$('.course');
        const sr = scr.getBoundingClientRect(); const gr = grid.getBoundingClientRect();
        c.check(px(cs(grid).columnGap) === 16 && px(cs(grid).rowGap) === 16, `${l} grid gap ${cs(grid).gap}`);
        const cols = new Set(cards.map((k) => Math.round(k.getBoundingClientRect().left))).size;
        c.check(cols === (w >= 700 ? 3 : 2), `${l} ${cols} columns`);
        const sizes = new Set(cards.map((k) => { const r = k.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); }));
        c.check(sizes.size === 1, `${l} card sizes differ: ${[...sizes]}`);
        if (scr.scrollHeight <= scr.clientHeight) c.check(Math.abs(sr.bottom - px(cs(scr).paddingBottom) - gr.bottom) <= 1, `${l} empty band under grid: ${Math.round(sr.bottom - gr.bottom)}px`);
        cards.forEach((k) => {
          const r = k.getBoundingClientRect(); const id = k.dataset.id;
          c.check(px(cs(k).paddingLeft) === 16 && px(cs(k).paddingTop) === 16, `${id} card padding ${cs(k).padding}`);
          c.check(cs(k).boxShadow.includes('3px 3px 0px'), `${id} shadow ${cs(k).boxShadow}`);
          k.querySelectorAll('.badge, .cname').forEach((t) => {
            const tr = t.getBoundingClientRect();
            c.check(Math.abs((tr.left + tr.right) / 2 - (r.left + r.right) / 2) <= 1.5, `${l} ${id} ${t.className} not centred horizontally`);
          });
          const kids = [...k.querySelectorAll('.badge, .cname')].map((t) => t.getBoundingClientRect());
          const top = Math.min(...kids.map((x) => x.top)), bot = Math.max(...kids.map((x) => x.bottom));
          c.check(Math.abs((top + bot) / 2 - (r.top + r.bottom) / 2) <= 1.5, `${l} ${id} content not centred vertically`);
          const bw = wordsWhole(app, k); c.check(!bw.length, `${l} ${id} word broken: ${bw}`);
        });
        // content column and tab bar share the same centred width
        const tb = app.$('#tabbar'); const tbr = tb.getBoundingClientRect();
        const cl = sr.left + px(cs(scr).paddingLeft), cr = sr.right - px(cs(scr).paddingRight);
        const tl = tbr.left + px(cs(tb).paddingLeft), trr = tbr.right - px(cs(tb).paddingRight);
        c.check(Math.abs(cl - tl) <= 1 && Math.abs(cr - trr) <= 1, `${l} column ${cl}..${cr} vs tab bar ${tl}..${trr}`);
        c.check(Math.abs(cl - (w - cr)) <= 1, `${l} column not centred`);
        c.check(px(cs(scr).paddingLeft) >= 16, `${l} screen padding ${cs(scr).paddingLeft}`);
        app.$('.tab[data-tab="settings"]').click();
        app.$$('#screen .set button, #screen .stack button').forEach((b) => {
          c.check(cs(b).textAlign === 'center', `${l} settings button text-align ${cs(b).textAlign}`);
          c.check(cs(b).boxShadow.includes('3px 3px 0px'), `${l} settings button "${b.textContent.trim()}" shadow ${cs(b).boxShadow}`);
          const bw = wordsWhole(app, b); c.check(!bw.length, `${l} settings button word broken: ${bw}`);
        });
        app.$('.tab[data-tab="profile"]').click();
        c.check(px(cs(app.$('.klist')).rowGap) === 16, `${l} profile block gap ${cs(app.$('.klist')).rowGap}`);
        c.check(px(cs(app.$('.klist')).marginTop) === 24, `${l} profile section gap ${cs(app.$('.klist')).marginTop}`);
        app.$$('.krow').forEach((r) => {
          c.check(cs(r).boxShadow === 'none', 'static block has a shadow');
          c.check(px(cs(r).paddingTop) === 16 && px(cs(r).paddingLeft) === 16, `${l} ${r.dataset.id} block padding ${cs(r).padding}`);
          const bw = wordsWhole(app, r); c.check(!bw.length, `${l} ${r.dataset.id} profile word broken: ${bw}`);
          c.check(r.getBoundingClientRect().right <= w - 16 + 0.5, `${l} ${r.dataset.id} block overflows`);
        });
      }
      app.$('.tab[data-tab="learn"]').click();
      const look = (el) => ['fontSize', 'fontWeight', 'fontFamily', 'paddingTop', 'paddingLeft', 'lineHeight'].map((k) => cs(el)[k]).join('|');
      const tileBadge = look(app.$('.course[data-id="js"] .badge'));
      app.$('.course[data-id="js"]').click();
      const head = app.$('.course-head');
      c.check(look(head.querySelector('.badge')) === tileBadge, `badge differs: tile ${tileBadge} vs header ${look(head.querySelector('.badge'))}`);
      c.check(['17px|600', '22px|600'].includes(tileBadge.split('|').slice(0, 2).join('|')), 'badge size/weight ' + tileBadge);
      c.check(px(cs(head).marginBottom) === 24, `course head section gap ${cs(head).marginBottom}`);
      c.check(px(cs(app.$('.list')).rowGap) === 16, 'lesson gap');
      // one shadow value on every element in the app (inset glow excluded)
      const shadows = new Set(app.$$('body *').map((el) => cs(el).boxShadow).filter((v) => v !== 'none' && !v.includes('inset')));
      c.check(shadows.size <= 1, 'shadows: ' + [...shadows].join(' | '));
      c.done();
    });
  }

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

  test('fill-in R7/R13: a tap on pre.code.has-fill outside the blank puts the caret at the end; nothing gets focus', async () => {
    let found = 0;
    for (const course of window.COURSES) {
      const app = await T.loadApp();
      app.$(`.course[data-id="${course.id}"]`).click();
      const lesson = course.lessons[0]; app.$('.lesson-item[data-i="0"]').click();
      for (let i = 0; i < lesson.tasks.length; i++) {
        const pre = app.$('pre.code.has-fill');
        if (pre) {
          found++;
          T.typeText(app, 'ab'); T.tapKey(app, 'left'); T.tapKey(app, 'left');
          assert.eq(app.$('#ans .et').textContent, '', 'caret moved to the start');
          const r = pre.getBoundingClientRect();
          pre.dispatchEvent(new app.win.MouseEvent('click', { bubbles: true, clientX: r.right - 4, clientY: r.bottom - 4 }));
          assert.eq(app.$('#ans .et').textContent, 'ab', `${course.id} t${i + 1}: tap on pre did not put the caret at the end`);
          assert(app.doc.activeElement === app.doc.body, 'nothing focused');
          break;
        }
        solve(app, lesson); await cont(app);
      }
      if (found >= 2) break;
    }
    assert(found > 0, 'no fill-in task found in any lesson 1');
  });
})();
