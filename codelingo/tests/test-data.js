// Course content integrity: structure, translations, and that every listed answer is accepted by the checker.
(() => {
  const { test, assert, collector } = T;
  const LANGS = 4;
  const C = window.COURSES;
  const parts = (s) => String(s).split('§');
  const each = (fn) => C.forEach((c) => c.lessons.forEach((L, li) => L.tasks.forEach((t, ti) => fn(c, L, t, `${c.id} L${li + 1} T${ti + 1} [${t.t}]`))));

  test('data: 6 courses with unique ids and required fields', () => {
    assert.eq(C.length, 6, 'course count');
    const ids = C.map((c) => c.id);
    assert.eq(new Set(ids).size, ids.length, 'unique ids');
    C.forEach((c) => {
      assert(c.name && c.tag, `${c.id}: name/tag`);
      assert(Array.isArray(c.sym) && c.sym.length > 0, `${c.id}: symbol bar`);
      assert(c.lessons.length > 0, `${c.id}: lessons`);
    });
  });

  test('data: lesson titles translated into all 4 languages', () => {
    const k = collector();
    C.forEach((c) => c.lessons.forEach((L, i) => {
      const p = parts(L.title);
      k.check(p.length === LANGS && p.every((x) => x.trim()), `${c.id} L${i + 1}: title "${L.title}" has ${p.length} parts`);
      k.check(L.tasks.length >= 4, `${c.id} L${i + 1}: only ${L.tasks.length} tasks`);
    }));
    k.done();
  });

  test('data: every question translated into all 4 languages', () => {
    const k = collector();
    each((c, L, t, id) => {
      const p = parts(t.q);
      k.check(p.length === LANGS && p.every((x) => x.trim()), `${id}: question has ${p.length} parts: "${String(t.q).slice(0, 60)}"`);
    });
    k.done();
  });

  test('data: task shapes are valid', () => {
    const k = collector();
    each((c, L, t, id) => {
      if (t.t === 'm') {
        k.check(Array.isArray(t.o) && t.o.length >= 2, `${id}: needs ≥2 options`);
        k.check(Number.isInteger(t.a) && t.a >= 0 && t.a < t.o.length, `${id}: answer index out of range`);
        t.o.forEach((o) => {
          if (o[0] === '~') { const p = parts(o.slice(1)); k.check(p.length === LANGS && p.every((x) => x.trim()), `${id}: option "${o.slice(0, 40)}" has ${p.length} translations`); }
          else k.check(!o.includes('§'), `${id}: code option contains § — missing "~"? "${o.slice(0, 40)}"`);
        });
      } else if (t.t === 'f') {
        k.check(t.c.split('___').length === 2, `${id}: code must contain exactly one ___`);
        k.check(Array.isArray(t.a) && t.a.length && t.a.every((x) => String(x).trim()), `${id}: empty accepted answer`);
      } else if (t.t === 'w') {
        k.check(Array.isArray(t.a) && t.a.length && t.a.every((x) => String(x).trim()), `${id}: empty accepted answer`);
      } else if (t.t === 'o') {
        k.check(Array.isArray(t.a) && t.a.length >= 2, `${id}: order task needs ≥2 tokens`);
        k.check(t.d.every((d) => !t.a.includes(d)), `${id}: distractor equals a real token`);
      } else k.check(false, `${id}: unknown task type`);
    });
    k.done();
  });

  test('data: multiple-choice options are distinct in every language', () => {
    const k = collector();
    each((c, L, t, id) => {
      if (t.t !== 'm') return;
      for (let lang = 0; lang < LANGS; lang++) {
        const texts = t.o.map((o) => (o[0] === '~' ? (parts(o.slice(1))[lang] || parts(o.slice(1))[0]) : o).trim());
        k.check(new Set(texts).size === texts.length, `${id}: duplicate options in lang #${lang}: ${JSON.stringify(texts)}`);
      }
    });
    k.done();
  });

  test('data: every accepted answer passes the app checker', async () => {
    const { win } = await T.loadApp();
    const { isCorrect } = win.__codelingo;
    const k = collector();
    each((c, L, t, id) => {
      if (t.t === 'm') k.check(isCorrect(t, c.id, t.a), `${id}: correct option rejected`);
      if (t.t === 'f' || t.t === 'w') t.a.forEach((a) => k.check(isCorrect(t, c.id, a), `${id}: accepted answer "${a}" rejected`));
      if (t.t === 'o') k.check(isCorrect(t, c.id, t.a.slice()), `${id}: correct order rejected`);
    });
    k.done();
  });

  test('data: wrong answers are rejected (no false positives)', async () => {
    const { win } = await T.loadApp();
    const { isCorrect } = win.__codelingo;
    const k = collector();
    each((c, L, t, id) => {
      if (t.t === 'm') t.o.forEach((_, i) => { if (i !== t.a) k.check(!isCorrect(t, c.id, i), `${id}: wrong option #${i} accepted`); });
      if (t.t === 'f' || t.t === 'w') {
        k.check(!isCorrect(t, c.id, ''), `${id}: empty input accepted`);
        k.check(!isCorrect(t, c.id, '   '), `${id}: whitespace input accepted`);
        k.check(!isCorrect(t, c.id, 'zzz_wrong'), `${id}: garbage accepted`);
      }
      if (t.t === 'o') {
        const rev = t.a.slice().reverse();
        if (rev.join('\u0001') !== t.a.join('\u0001')) k.check(!isCorrect(t, c.id, rev), `${id}: reversed order accepted`);
        k.check(!isCorrect(t, c.id, t.a.slice(0, -1)), `${id}: incomplete order accepted`);
        if (t.d.length) k.check(!isCorrect(t, c.id, t.a.concat(t.d[0])), `${id}: answer + distractor accepted`);
      }
    });
    k.done();
  });

  test('data: order tasks never ambiguous (two different token orders that normalise equal)', async () => {
    const { win } = await T.loadApp();
    const { norm } = win.__codelingo;
    const k = collector();
    each((c, L, t, id) => {
      if (t.t !== 'o') return;
      // Swapping two adjacent tokens must change the normalised result, otherwise a wrong order is accepted.
      for (let i = 0; i + 1 < t.a.length; i++) {
        if (t.a[i] === t.a[i + 1]) continue;
        const sw = t.a.slice(); [sw[i], sw[i + 1]] = [sw[i + 1], sw[i]];
        k.check(norm(sw.join(' '), c.id) !== norm(t.a.join(' '), c.id), `${id}: swapping "${t.a[i]}" and "${t.a[i + 1]}" is still accepted`);
      }
    });
    k.done();
  });
})();
