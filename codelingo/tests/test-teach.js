// SPEC 3a (L1-L6): teach cards ('k'), repeat tasks ('r'), the course Guide and the teach data files.
(() => {
  const { test, assert, collector, sleep } = T;
  const OFF = { settings: { lang: 'en', sound: false, music: false } };
  const card = (title, text, code) => ({ title: `${title}§${title} ru§${title} uk§${title} cs`, text: `${text}§${text} ru§${text} uk§${text} cs`, code });
  const A = card('Alpha', 'First idea.', 'let a = 1');
  const B = card('Beta', 'Second idea.', 'a + 1');
  const G = card('Gamma', 'Third idea.', 'a * 2');
  // js: lesson 1 has two cards, lesson 2 is missing, lesson 3 has one card.
  const FIX = { js: [[A, B], undefined, [G]] };
  const btn = (app) => app.$('#checkBtn');
  const barPct = (app) => parseInt(app.$('#bar i').style.width, 10);
  const isTeach = (app) => !!app.$('#lessonBody .teach');
  // "Got it" / "Continue" ignore taps for 400 ms after the screen changed (anti double-tap).
  const press = async (app) => { await sleep(420); btn(app).click(); };
  const open = (app, cid = 'js', li = 0) => {
    app.$('.tab[data-tab="learn"]').click();
    app.$(`.course[data-id="${cid}"]`).click();
    const item = app.$(`.lesson-item[data-i="${li}"]`); assert(item && !item.disabled, `lesson ${li} not open`);
    item.click();
    assert(!app.$('#lesson').hidden, 'lesson shown');
  };
  const practiceQ = (app, cid, li, ti = 0) => app.win.COURSES.find((c) => c.id === cid).lessons[li].tasks[ti].q.split('§')[0];
  // Replace the practice tasks of a lesson (COURSES lives in the iframe, fresh per loadApp).
  const setTasks = (app, cid, li, tasks) => { app.win.COURSES.find((c) => c.id === cid).lessons[li].tasks = tasks; };
  const MCQ = { t: 'm', q: 'Pick§Pick§Pick§Pick', o: ['RIGHT', 'wrong1', 'wrong2'], a: 0 };

  test('teach: queue order k → r → k → r → practice; progress counts every item', async () => {
    const app = await T.loadApp({ state: OFF, teach: FIX });
    open(app);
    const total = 4 + app.win.COURSES.find((c) => c.id === 'js').lessons[0].tasks.length;
    const seen = [];
    for (const [cd, step] of [[A, 0], [B, 2]]) {
      assert(isTeach(app), `item ${step + 1} should be a teach card`);
      assert.eq(app.$('.teach .kt').textContent, cd.title.split('§')[0], 'card title');
      assert.eq(app.$('.teach pre.code').textContent, cd.code, 'card code');
      assert.eq(barPct(app), Math.round((100 * step) / total), `bar before card ${step}`);
      seen.push('k');
      await press(app);
      assert(!isTeach(app) && app.$('#ans'), 'repeat task follows the card');
      assert.eq(app.$('#lessonBody .q').textContent, 'Repeat the example', 'repeat prompt');
      assert.eq(app.$('#lessonBody pre.code').textContent, cd.code, 'example visible in the repeat task');
      assert.eq(barPct(app), Math.round((100 * (step + 1)) / total), 'the card counts in the progress bar');
      seen.push('r');
      T.typeText(app, cd.code);
      assert.eq(T.edText(app), cd.code, 'typed on the in-app keyboard');
      btn(app).click();
      assert(app.$('#sheet').classList.contains('ok'), 'typed example accepted');
      assert.eq(barPct(app), Math.round((100 * (step + 2)) / total), 'the repeat counts in the progress bar');
      await press(app);
    }
    assert(!isTeach(app), 'practice after the cards');
    assert.eq(app.$('#lessonBody .q').textContent, practiceQ(app, 'js', 0), 'first practice task');
    assert.eq(seen.join(''), 'krkr', 'order');
  });

  test('teach: card has caption, title, text, code; Got it enabled; no keyboard, scoring or hint', async () => {
    const app = await T.loadApp({ state: OFF, teach: FIX });
    open(app);
    assert.eq(app.$('.teach .knew').textContent, 'New', 'caption');
    assert.eq(app.$('.teach .kx').textContent, 'First idea.', 'text');
    const cs = (el) => app.win.getComputedStyle(el);
    assert.eq(cs(app.$('.teach .kt')).fontSize, '17px', 'title 17px'); assert.eq(cs(app.$('.teach .kt')).fontWeight, '600', 'title 600');
    assert.eq(cs(app.$('.teach .kx')).fontSize, '17px', 'text 17px'); assert.eq(cs(app.$('.teach .kx')).fontWeight, '400', 'text 400');
    assert.eq(cs(app.$('.teach .knew')).fontSize, '13px', 'caption 13px');
    assert(app.$('#kbd').hidden, 'no keyboard on a teach card');
    assert(!app.$('#ans'), 'no editor on a teach card');
    assert(!btn(app).disabled, 'Got it is enabled');
    assert.eq(btn(app).textContent, 'Got it', 'button label');
    app.$('#lmascot').click();
    assert.eq(app.$('#bubble').textContent, app.win.I18N.en.hintNone, 'mascot gives no hint');
    btn(app).click(); // too fast: guarded
    assert(isTeach(app), 'an immediate tap does not skip the card');
    await press(app);
    assert(app.$('#sheet').hidden, 'no result sheet for a card');
    const p = (app.stored().prog || {}).js;
    assert(!p || p.ans === 0, 'a card is not an answer');
    app.$('[data-act="quit"]').click();
    assert(!app.$('.modal'), 'no answers yet: quitting needs no confirmation');
    assert(app.$('#lesson').hidden, 'lesson closed');
    // Hints off: the card still says "nothing to hint" rather than "hints are off".
    const off = await T.loadApp({ state: { settings: { lang: 'ru', sound: false, music: false, hints: false } }, teach: FIX });
    open(off);
    off.$('#lmascot').click();
    assert.eq(off.$('#bubble').textContent, off.win.I18N.ru.hintNone, 'ru hintNone');
    assert.eq(off.$('#checkBtn').textContent, 'Понятно', 'ru Got it');
    assert.eq(off.$('.teach .knew').textContent, 'Новое', 'ru caption');
    assert.eq(off.$('.teach .kt').textContent, 'Alpha ru', 'card title translated');
  });

  test('teach: wrong repeat → "Not quite", example stays, re-queued at the end; accuracy and XP ignore the card', async () => {
    const app = await T.loadApp({ state: OFF, teach: { js: [[A]] } });
    setTasks(app, 'js', 0, [MCQ]);
    open(app);
    await press(app); // card → repeat
    T.typeText(app, 'let b');
    btn(app).click();
    assert(app.$('#sheet').classList.contains('bad'), 'wrong repeat');
    assert.eq(app.$('#sheet').textContent.trim(), 'Not quite', 'only "Not quite"');
    assert.eq(app.$('#lessonBody pre.code').textContent, A.code, 'example still visible after the wrong answer');
    assert(!app.$('#sheet').textContent.includes(A.code), 'the answer is not revealed in the sheet');
    assert.eq(barPct(app), 33, 'wrong answer does not advance the bar (1 of 3)');
    await press(app);
    assert(app.$('.opt'), 'practice task comes before the re-queued repeat');
    app.$('.opt[data-i="0"]').click(); btn(app).click();
    await press(app);
    assert.eq(app.$('#lessonBody .q').textContent, 'Repeat the example', 'repeat re-queued at the end');
    assert.eq(app.$('#lessonBody pre.code').textContent, A.code, 'example visible on the retry');
    // Hint for 'r' = the start of the answer, like a write task.
    app.$('#lmascot').click();
    assert(app.$('#bubble pre') && A.code.startsWith(app.$('#bubble pre').textContent.replace('…', '')), 'hint shows the start of the example');
    app.$('#lmascot').click(); // close the bubble
    T.typeText(app, A.code); btn(app).click();
    assert(app.$('#sheet').classList.contains('ok'), 'correct on retry');
    await press(app);
    assert(app.$('.finish'), 'finish screen');
    const p = app.stored().prog.js;
    assert.eq(p.ans, 3, 'answers: wrong repeat, MCQ, repeat (the card is not counted)');
    assert.eq(p.ok, 2, 'correct answers');
    assert.eq(p.best[0], 67, 'best accuracy only from scored tasks');
    assert.eq(p.xp, 12, 'XP: MCQ 10 + repeat after a mistake 2');
  });

  test('teach: no TEACH, missing course, missing lesson or bad cards → the lesson starts with practice', async () => {
    const cases = [
      ['no TEACH global', null, 0],
      ['empty TEACH', {}, 0],
      ['course has no lesson entry', { js: [] }, 0],
      ['lesson entry missing (lesson 2)', FIX, 1],
      ['lesson is not an array', { js: ['oops'] }, 0],
      ['broken cards are skipped', { js: [[null, { title: 'x' }, 'str', { title: 'T', text: 'X', code: '' }]] }, 0],
    ];
    for (const [name, teach, li] of cases) {
      const app = await T.loadApp({ state: { settings: OFF.settings, prog: { js: { done: [0], ans: 0, ok: 0, xp: 0, best: {} } } }, teach });
      open(app, 'js', li);
      assert(!isTeach(app), `${name}: no teach card`);
      assert.eq(app.$('#lessonBody .q').textContent, practiceQ(app, 'js', li), `${name}: first practice task`);
      assert.eq(barPct(app), 0, `${name}: bar`);
    }
  });

  test('teach: Guide button in the course header (i18n, secondary style, fits 320px)', async () => {
    for (const [lang, label] of [['en', 'Guide'], ['ru', 'Гид'], ['uk', 'Гід'], ['cs', 'Průvodce']]) {
      const app = await T.loadApp({ state: { settings: { lang, sound: false, music: false } }, teach: FIX, size: [320, 568] });
      app.$('.course[data-id="js"]').click();
      const b = app.$('[data-act="guide"]');
      assert(b, `${lang}: Guide button`);
      assert.eq(b.textContent.trim(), label, `${lang}: label`);
      const cs = app.win.getComputedStyle(b);
      assert(cs.boxShadow !== 'none', `${lang}: the one shadow`);
      assert(b.classList.contains('ghost'), `${lang}: secondary button`);
      const r = b.getBoundingClientRect(); const scr = app.$('#screen');
      assert(r.height >= 44 && r.width >= 44, `${lang}: tap target`);
      assert(scr.scrollWidth <= scr.clientWidth, `${lang}: no horizontal scroll`);
      assert(b.scrollWidth <= b.clientWidth, `${lang}: label not clipped`);
    }
  });

  test('teach: Guide lists cards per lesson, scrolls in #screen, tab bar unchanged, Back returns to the course', async () => {
    const app = await T.loadApp({ state: OFF, teach: FIX });
    app.$('.course[data-id="js"]').click();
    const tabTop = app.$('#tabbar').getBoundingClientRect().top;
    app.$('[data-act="guide"]').click();
    const scr = app.$('#screen');
    assert.eq(scr.dataset.view, 'guide', 'guide view');
    assert.eq(app.$('.course-head h1').textContent, 'JavaScript', 'course header');
    assert(app.$('.course-head .badge'), 'badge');
    const groups = app.$$('.gles');
    assert.eq(groups.length, 2, 'lessons with cards');
    const L = app.win.COURSES.find((c) => c.id === 'js').lessons;
    assert.eq(groups[0].querySelector('.glt').textContent, L[0].title.split('§')[0], 'lesson 1 title');
    assert.eq(groups[1].querySelector('.glt').textContent, L[2].title.split('§')[0], 'lesson 3 title');
    assert.eq(groups[0].querySelectorAll('.gcard').length, 2, 'lesson 1 cards');
    const c0 = groups[0].querySelector('.gcard');
    assert.eq(c0.querySelector('.kt').textContent, 'Alpha', 'card title');
    assert.eq(c0.querySelector('.kx').textContent, 'First idea.', 'card text');
    assert.eq(c0.querySelector('pre.code').textContent, A.code, 'card code');
    const cs = (el) => app.win.getComputedStyle(el);
    assert.eq(cs(c0).boxShadow, 'none', 'static card: no shadow');
    assert.eq(cs(groups[0].querySelector('.glt')).fontSize, '17px', 'lesson title 17px');
    assert.eq(cs(groups[0].querySelector('.glt')).fontWeight, '600', 'lesson title 600');
    assert.eq(cs(groups[0]).rowGap, '16px', '16px between cards');
    assert.eq(app.$$('#tabbar .tab').length, 3, 'tab bar');
    assert.eq(app.$('#tabbar').getBoundingClientRect().top, tabTop, 'tab bar does not move');
    assert(app.$('.tab[data-tab="learn"]').classList.contains('on'), 'Learn tab stays active');
    assert(/(auto|scroll)/.test(cs(scr).overflowY), '#screen scrolls');
    app.$('[data-act="back"]').click();
    assert.eq(scr.dataset.view, 'course', 'Back → course');
    assert(app.$('[data-act="guide"]'), 'course screen again');
    app.$('[data-act="back"]').click();
    assert.eq(scr.dataset.view, 'learn', 'Back → courses');
    // A tab switch closes the Guide.
    app.$('.course[data-id="js"]').click(); app.$('[data-act="guide"]').click();
    app.$('.tab[data-tab="profile"]').click(); app.$('.tab[data-tab="learn"]').click();
    assert.eq(scr.dataset.view, 'learn', 'tab switch leaves the Guide');
  });

  test('teach: Guide empty state when the course has no cards (and without TEACH at all)', async () => {
    for (const teach of [{}, null, { css: [[], []] }]) {
      const app = await T.loadApp({ state: { settings: { lang: 'uk', sound: false, music: false } }, teach });
      app.$('.course[data-id="css"]').click(); app.$('[data-act="guide"]').click();
      assert.eq(app.$('#screen').dataset.view, 'guide', 'guide view');
      assert.eq(app.$$('.gcard').length, 0, 'no cards');
      assert.eq(app.$('.gempty').textContent, app.win.I18N.uk.guideEmpty, 'empty line');
    }
  });

  // Real courses/teach-<id>.js (if a file is there): the full card → repeat flow of lesson 1.
  test('teach: real teach files — lesson 1 cards and repeats pass through the UI', async () => {
    const ids = Object.keys(window.TEACH || {}).filter((id) => (window.TEACH[id][0] || []).length);
    for (const id of ids) {
      const app = await T.loadApp({ state: OFF, teach: 'real' });
      open(app, id, 0);
      for (const cd of window.TEACH[id][0]) {
        assert(isTeach(app), `${id}: card expected`);
        await press(app);
        T.typeText(app, cd.code); btn(app).click();
        assert(app.$('#sheet').classList.contains('ok'), `${id}: repeat of "${cd.code}" not accepted`);
        await press(app);
      }
      assert.eq(app.$('#lessonBody .q').textContent, practiceQ(app, id, 0), `${id}: practice after the cards`);
    }
  });

  // L1/L6: data shape of every loaded teach file.
  test('data: teach — one entry per lesson, 4-part title/text, one-line code ≤ 40 chars typable on the keyboard', async () => {
    const app = await T.loadApp({ state: OFF, teach: 'real' });
    const { KBD, isCorrect } = app.win.__codelingo;
    const keys = new Set(Object.values(KBD).flat().flat().filter((k) => k.length === 1));
    const typable = (ch) => ch === ' ' || /[a-z]/i.test(ch) || keys.has(ch);
    const k = collector();
    const TEACH = window.TEACH || {};
    Object.keys(TEACH).forEach((id) => {
      const c = window.COURSES.find((x) => x.id === id);
      k.check(c, `${id}: teach file for an unknown course`);
      if (!c) return;
      const lessons = TEACH[id];
      k.check(Array.isArray(lessons), `${id}: Teach() needs an array`);
      if (!Array.isArray(lessons)) return;
      if (!lessons.length) return; // placeholder file: no cards yet
      k.check(lessons.length === c.lessons.length, `${id}: ${lessons.length} lessons of cards, course has ${c.lessons.length}`);
      lessons.forEach((cards, li) => {
        k.check(Array.isArray(cards) && cards.length > 0, `${id} L${li + 1}: no cards`);
        (cards || []).forEach((cd, ci) => {
          const w = `${id} L${li + 1} K${ci + 1}`;
          ['title', 'text'].forEach((f) => {
            const p = String(cd && cd[f]).split('§');
            k.check(p.length === 4 && p.every((x) => x.trim()), `${w}: ${f} has ${p.length} parts`);
          });
          const code = String(cd && cd.code);
          k.check(code.trim() !== '' && !code.includes('\n'), `${w}: code must be one non-empty line`);
          k.check(code.length <= 40, `${w}: code is ${code.length} chars (max 40): ${code}`);
          const bad = [...code].filter((ch) => !typable(ch));
          k.check(!bad.length, `${w}: not on the keyboard: ${JSON.stringify(bad.join(''))}`);
          k.check(isCorrect({ t: 'r', a: [code] }, id, code), `${w}: the example is not accepted as its own repeat`);
        });
      });
    });
    k.done();
  });
})();
