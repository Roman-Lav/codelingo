(() => {
  'use strict';

  const VERSION = '1.0.12';
  const KEY = 'codelingo.v1';
  const LANGS = ['en', 'ru', 'uk', 'cs'];
  const LANG_NAMES = { en: 'English', ru: 'Русский', uk: 'Українська', cs: 'Čeština' };
  const THEMES = ['system', 'light', 'dark'];
  const TOGGLES = ['sound', 'music', 'hints', 'motion'];
  const COURSES = window.COURSES || [];

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dayKey = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /* ---------- State ---------- */
  function detectLang() {
    const l = (navigator.language || 'en').slice(0, 2).toLowerCase();
    return LANGS.includes(l) ? l : 'en';
  }
  const defaults = () => ({
    settings: { theme: 'system', lang: detectLang(), sound: true, music: true, hints: true, motion: true },
    prog: {}, days: {},
  });
  let S;
  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { /* storage blocked */ }
    try { S = raw ? JSON.parse(raw) : null; } catch (e) { S = null; }
    S = sanitize(S);
  }
  // Coerce stored data into a safe shape so bad JSON can never break boot.
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const num = (x) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Math.floor(Number(x)) : 0);
  function sanitize(raw) {
    const d = defaults();
    if (!isObj(raw)) return d;
    // Only known settings survive; old keys (code size, daily goal) are dropped.
    const rs = isObj(raw.settings) ? raw.settings : {};
    const s = d.settings;
    if (THEMES.includes(rs.theme)) s.theme = rs.theme;
    if (LANGS.includes(rs.lang)) s.lang = rs.lang;
    TOGGLES.forEach((k) => { if (typeof rs[k] === 'boolean') s[k] = rs[k]; });
    const prog = {};
    if (isObj(raw.prog)) {
      Object.keys(raw.prog).forEach((id) => {
        const p = raw.prog[id]; if (!isObj(p)) return;
        const c = COURSES.find((x) => x.id === id);
        const max = c ? c.lessons.length : 0;
        const done = Array.isArray(p.done) ? [...new Set(p.done.filter((i) => Number.isInteger(i) && i >= 0 && i < max))] : [];
        const ans = num(p.ans);
        // best[lesson] = best accuracy 0..100 of a finished lesson
        const best = {};
        if (isObj(p.best)) {
          Object.keys(p.best).forEach((k) => {
            const i = Number(k); const raw = p.best[k]; const v = Number(raw);
            // Strings only in plain decimal form: Number() would also accept "0x10", "0b11", "0o7".
            const okType = typeof raw === 'number' || (typeof raw === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(raw));
            if (/^\d+$/.test(k) && i < max && okType && Number.isFinite(v)) best[i] = Math.min(100, Math.max(0, Math.round(v)));
          });
        }
        prog[id] = { done, ans, ok: Math.min(num(p.ok), ans), xp: num(p.xp), best };
      });
    }
    const days = {};
    if (isObj(raw.days)) Object.keys(raw.days).forEach((k) => { if (/^\d{4}-\d\d-\d\d$/.test(k) && num(raw.days[k])) days[k] = num(raw.days[k]); });
    return { settings: s, prog, days };
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
  function prog(id) { return S.prog[id] || (S.prog[id] = { done: [], ans: 0, ok: 0, xp: 0, best: {} }); }

  const t = (k) => { const d = window.I18N[S.settings.lang] || window.I18N.en; return d[k] !== undefined ? d[k] : (window.I18N.en[k] !== undefined ? window.I18N.en[k] : k); };
  const tr = (s) => { if (s == null) return ''; const p = String(s).split('§'); return p[LANGS.indexOf(S.settings.lang)] || p[0]; };
  // R9: an option is shown as code unless it is translated text ("~") or plain words
  // (has a space and no code characters), e.g. "HyperText Markup Language".
  const CODE_CHARS = /[<>{}()[\];=."'`$#*|&!:/_]/;
  const optText = (o) => {
    if (o[0] === '~') return { text: tr(o.slice(1)), code: false };
    return { text: o, code: !(o.includes(' ') && !CODE_CHARS.test(o)) };
  };

  /* ---------- Pixel graphics ---------- */
  const MASCOT = [
    '..XXXXXXXXXX..',
    '..XXXXXXXXXX..',
    '..XXEXXXXEXX..',
    '..XXEXXXXEXX..',
    'XXXXXXXXXXXXXX',
    'XXXXXXXXXXXXXX',
    '..XXXXXXXXXX..',
    '..XXXXXXXXXX..',
    '..X.X....X.X..',
    '..X.X....X.X..',
  ];
  const ICONS = {
    code: ['...X...X...', '..X...X.X..', '.X...X...X.', 'X....X....X', '.X..X....X.', '..X.X...X..', '...X...X...'],
    user: ['..XXX..', '..XXX..', '..XXX..', '.......', '.XXXXX.', 'XXXXXXX', 'XXXXXXX'],
    gear: ['X..X..X', '.XXXXX.', '.XX.XX.', 'XX...XX', '.XX.XX.', '.XXXXX.', 'X..X..X'],
    check: ['........X', '.......XX', 'X.....XX.', 'XX...XX..', '.XX.XX...', '..XXX....', '...X.....'],
    cross: ['XX....XX', 'XXX..XXX', '.XXXXXX.', '..XXXX..', '..XXXX..', '.XXXXXX.', 'XXX..XXX', 'XX....XX'],
    lock: ['..XXX..', '.X...X.', '.X...X.', 'XXXXXXX', 'XXX.XXX', 'XXX.XXX', 'XXXXXXX'],
    back: ['...X', '..XX', '.XXX', 'XXXX', '.XXX', '..XX', '...X'],
  };
  function gridRects(grid, cls) {
    let r = '';
    grid.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        const c = row[x];
        if (c === '.') { x++; continue; }
        let w = 1;
        while (row[x + w] === c) w++;
        r += `<rect x="${x}" y="${y}" width="${w}" height="1"${cls ? ` class="${cls(c)}"` : ''}/>`;
        x += w;
      }
    });
    return r;
  }
  const pix = (name, cls = '') => {
    const g = ICONS[name];
    return `<svg class="pix ${cls}" viewBox="0 0 ${g[0].length} ${g.length}" shape-rendering="crispEdges" aria-hidden="true">${gridRects(g)}</svg>`;
  };
  const mascotSVG = (cls = '') => `<svg class="mascot ${cls}" viewBox="0 0 14 10" shape-rendering="crispEdges" aria-hidden="true">${gridRects(MASCOT, (c) => (c === 'E' ? 'me' : 'mb'))}</svg>`;

  /* ---------- Sound ---------- */
  const music = window.CLMusic || { start() { return false; }, stop() {}, resume() { return Promise.resolve(false); }, playing: false };
  let ac = null;
  const SND = {
    ok: [[660, 0.08, 0], [990, 0.12, 0.08]],
    bad: [[196, 0.16, 0], [147, 0.22, 0.12]],
    done: [[523, 0.1, 0], [659, 0.1, 0.1], [784, 0.1, 0.2], [1046, 0.22, 0.3]],
  };
  function beep(name) {
    if (!S.settings.sound) return;
    try {
      // One AudioContext for effects and music. resume() also runs after a pending suspend()
      // from music.stop(), e.g. the "done" jingle right after the music stops.
      ac = ac || (music.context && music.context()) || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.resume) { const p = ac.resume(); if (p && p.catch) p.catch(() => {}); }
      const t0 = ac.currentTime + 0.01;
      SND[name].forEach(([f, d, st]) => {
        const o = ac.createOscillator(); const g = ac.createGain();
        o.type = 'square'; o.frequency.value = f;
        g.gain.setValueAtTime(0.05, t0 + st);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + st + d);
        o.connect(g); g.connect(ac.destination);
        o.start(t0 + st); o.stop(t0 + st + d + 0.02);
      });
    } catch (e) { /* audio unavailable */ }
  }

  /* ---------- Answer checking ---------- */
  function norm(s, lang) {
    let x = String(s)
      .replace(/\r/g, '')
      .replace(/[‘’‚′]/g, "'")
      .replace(/[“”„″«»]/g, '"')
      .replace(/—/g, '--').replace(/–/g, '-').replace(/…/g, '...')
      .replace(/ /g, ' ')
      .replace(/'/g, '"');
    if (['js', 'ts', 'sql', 'py'].includes(lang)) {
      x = x.split('\n').map((l) => l.trim().replace(/;+$/, '')).join('\n');
    }
    if (['js', 'ts', 'css'].includes(lang)) x = x.replace(/;\s*}/g, '}');
    x = x.replace(/\s+/g, ' ').trim();
    x = x.replace(/\s*([^\w\s])\s*/g, '$1');
    if (['js', 'ts', 'sql', 'py', 'css'].includes(lang)) x = x.replace(/;+$/, '');
    if (['html', 'css', 'sql'].includes(lang)) x = x.toLowerCase();
    if (lang === 'html') x = x.replace(/\/>/g, '>');
    return x;
  }
  function isCorrect(task, lang, input) {
    if (task.t === 'm') return input === task.a;
    if (task.t === 'f') {
      if (!String(input).trim()) return false;
      // Function replacers: "$$", "$&" etc. in the answer must stay literal.
      const got = norm(task.c.replace('___', () => input), lang);
      return task.a.some((a) => norm(task.c.replace('___', () => a), lang) === got);
    }
    if (task.t === 'w') { const got = norm(input, lang); return got !== '' && task.a.some((a) => norm(a, lang) === got); }
    if (task.t === 'o') return norm(input.join(' '), lang) === norm(task.a.join(' '), lang);
    return false;
  }

  /* ---------- Stats ---------- */
  function knowledge(c) {
    const p = prog(c.id);
    const acc = p.ans ? p.ok / p.ans : 0;
    return Math.round(100 * (p.done.length / c.lessons.length) * (0.5 + 0.5 * acc));
  }

  /* ---------- Settings application ---------- */
  function applySettings() {
    const r = document.documentElement;
    if (S.settings.theme === 'system') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', S.settings.theme);
    r.setAttribute('data-motion', S.settings.motion ? 'on' : 'off');
    r.lang = S.settings.lang;
    const dark = S.settings.theme === 'dark' || (S.settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#17110B' : '#F7F4EF');
  }

  /* ---------- Views ---------- */
  let tab = 'learn';
  let courseId = null;

  function header(title, withBack) {
    return `<header class="top">
      ${withBack ? `<button class="back" data-act="back">${pix('back', 'ic')}<span>${esc(t('back'))}</span></button>` : `<h1>${esc(title)}</h1>`}
      <button class="mascot-btn" data-act="mascot" aria-label="mascot">${mascotSVG()}</button>
    </header>`;
  }

  const allDone = (c) => prog(c.id).done.length >= c.lessons.length;

  function viewLearn() {
    return header('CodeLingo') + '<div class="grid">' +
      COURSES.map((c) => {
        const done = allDone(c);
        return `<button class="card course" data-act="course" data-id="${c.id}" aria-label="${esc(c.name + (done ? ', ' + t('completed') : ''))}">
          <span class="badge">${esc(c.tag)}</span>
          <span class="cname">${esc(c.name)}</span>
          ${done ? pix('check', 'ic ok cdone') : ''}
        </button>`;
      }).join('') + '</div>';
  }

  function viewCourse(id) {
    const c = COURSES.find((x) => x.id === id);
    const p = prog(id);
    // R9: the course percent is the only number in the UI; it looks exactly like the course name.
    return header('', true) + `<div class="course-head"><span class="badge">${esc(c.tag)}</span><h1>${esc(c.name)}</h1>${kpct(c)}</div>
      <div class="list">` + c.lessons.map((L, i) => {
        const done = p.done.includes(i);
        const open = done || i === 0 || p.done.includes(i - 1);
        const st = done ? pix('check', 'ic ok') + `<span class="sr-only">${esc(t('completed'))}</span>` : open ? `<span class="go">${esc(t('start'))}</span>` : pix('lock', 'ic');
        return `<button class="card lesson-item ${done ? 'done' : ''} ${open ? '' : 'locked'}" ${open ? `data-act="lesson" data-i="${i}"` : 'disabled'}>
          <span class="lt">${esc(tr(L.title))}</span>
          <span class="st">${st}</span>
        </button>`;
      }).join('') + '</div>';
  }

  // Colour of a passed lesson by its best accuracy. Lessons passed before best was stored
  // fall back to the course accuracy.
  function segClass(p, i) {
    if (!p.done.includes(i)) return '';
    const acc = p.best[i] !== undefined ? p.best[i] : p.ans ? Math.round((100 * p.ok) / p.ans) : 0;
    return acc >= 90 ? 'ok' : acc >= 60 ? 'mid' : 'bad';
  }

  // Course percent k%: the locale's percent format (cs "45 %"), announced as "Knowledge: 45%".
  // role="img" so screen readers use the label instead of the bare number.
  const kpct = (c) => { const n = knowledge(c); return `<span class="kpct" role="img" aria-label="${esc(fmt(t('knowAria'), { n }))}">${esc(fmt(t('pct'), { n }))}</span>`; };

  // Profile stats of one course (screen 4): lessons passed and the share of correct answers.
  function courseStats(c) {
    const p = prog(c.id);
    return { done: p.done.length, total: c.lessons.length, ok: p.ok, ans: p.ans, pct: p.ans ? Math.round((100 * p.ok) / p.ans) : null };
  }
  const fmt = (s, vars) => Object.keys(vars).reduce((acc, k) => acc.split('{' + k + '}').join(String(vars[k])), s);

  function viewProfile() {
    const week = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); week.push({ on: (S.days[dayKey(d)] || 0) > 0, label: d.toLocaleDateString(S.settings.lang, { weekday: 'short' }).slice(0, 2) }); }
    return header(t('profile')) + `
      <div class="week">${week.map((w) => `<span><i class="${w.on ? 'on' : ''}"></i>${esc(w.label)}</span>`).join('')}</div>
      <div class="klist">` +
      COURSES.map((c) => {
        const p = prog(c.id);
        const st = courseStats(c);
        const lessons = fmt(t('statLessons'), { n: st.done, m: st.total });
        const acc = st.pct === null ? t('statAccNone') : fmt(t('statAcc'), { p: st.pct, ok: st.ok, ans: st.ans });
        // R9: badge, name and percent look exactly like the course-screen header (.course-head).
        // The bar is decorative for screen readers: the caption says the same.
        return `<section class="krow" data-id="${c.id}" aria-labelledby="kh-${c.id}">
          <div class="course-head"><span class="badge">${esc(c.tag)}</span><h2 id="kh-${c.id}">${esc(c.name)}</h2>${kpct(c)}</div>
          <div class="segbar" aria-hidden="true">${c.lessons.map((_, i) => `<i class="${segClass(p, i)}"></i>`).join('')}</div>
          <p class="kstat"><span class="kles">${esc(lessons)}</span><span class="kacc">${esc(acc)}</span></p>
        </section>`;
      }).join('') + '</div>';
  }

  const toggle = (key) => `<label class="sw"><input type="checkbox" data-set="${key}" aria-label="${esc(t(TOGGLE_LABEL[key]))}" ${S.settings[key] ? 'checked' : ''}><i></i></label>`;
  const TOGGLE_LABEL = { sound: 'sound', music: 'music', hints: 'mascotHints', motion: 'animations' };

  function viewSettings() {
    const themeName = t(S.settings.theme);
    const langName = LANG_NAMES[S.settings.lang];
    return header(t('settings')) + `
      <div class="set"><span>${esc(t('theme'))}</span><button class="btn ghost val" data-act="cycle" data-k="theme" aria-label="${esc(t('theme') + ': ' + themeName)}">${esc(themeName)}</button></div>
      <div class="set"><span>${esc(t('language'))}</span><button class="btn ghost val" data-act="cycle" data-k="lang" lang="${S.settings.lang}" aria-label="${esc(t('language') + ': ' + langName)}">${esc(langName)}</button></div>
      ${TOGGLES.map((k) => `<div class="set"><span>${esc(t(TOGGLE_LABEL[k]))}</span>${toggle(k)}</div>`).join('')}
      <div class="stack"><button class="btn danger" data-act="reset">${esc(t('reset'))}</button></div>
      <p class="about">CodeLingo · ${VERSION}</p>`;
  }

  function renderTabs() {
    const items = [['learn', 'code'], ['profile', 'user'], ['settings', 'gear']];
    $('#tabbar').innerHTML = items.map(([k, ic]) => `<button class="tab ${tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${pix(ic)}<span>${esc(t(k))}</span></button>`).join('');
  }

  function render() {
    const scr = $('#screen');
    scr.dataset.view = tab === 'learn' ? (courseId ? 'course' : 'learn') : tab;
    if (tab === 'learn') scr.innerHTML = courseId ? viewCourse(courseId) : viewLearn();
    else if (tab === 'profile') scr.innerHTML = viewProfile();
    else scr.innerHTML = viewSettings();
    renderTabs();
  }

  /* ---------- Lesson ---------- */
  let LS = null;

  // Music fallback after a refused resume: at most one pending pointerdown listener.
  let tapRetry = false;
  const musicWanted = () => !!(LS && !LS.finished && S.settings.music && document.visibilityState === 'visible');
  function onRetryTap() {
    clearTapRetry();
    if (musicWanted()) music.start();
  }
  function clearTapRetry() {
    if (!tapRetry) return;
    tapRetry = false;
    $('#lesson').removeEventListener('pointerdown', onRetryTap);
  }

  function startLesson(cid, li) {
    const c = COURSES.find((x) => x.id === cid);
    const lesson = c.lessons[li];
    LS = { c, li, tasks: lesson.tasks, queue: lesson.tasks.map((_, i) => i), done: 0, total: lesson.tasks.length, wrong: new Set(), xp: 0, ans: 0, ok: 0, cur: null, finished: false };
    $('#lmascot').innerHTML = mascotSVG();
    document.body.classList.add('in-lesson');
    $('#lesson').hidden = false;
    fitViewport();
    if (S.settings.music) music.start(); // started by the tap on the lesson (iOS needs a gesture)
    nextTask();
  }

  function nextTask() {
    hideBubble();
    if (!LS.queue.length) return finishLesson();
    const ti = LS.queue[0];
    const task = LS.tasks[ti];
    const cur = { ti, task, sel: null, picked: [], bank: null, perm: null, hints: 0, removed: new Set(), hl: -1, checked: false };
    if (task.t === 'm') cur.perm = shuffle(task.o.map((_, i) => i));
    if (task.t === 'o') {
      const toks = task.a.concat(task.d).map((x) => ({ x }));
      let b = shuffle(toks);
      if (task.a.length > 1 && b.slice(0, task.a.length).map((o) => o.x).join('\u0001') === task.a.join('\u0001')) b = b.slice(1).concat(b[0]);
      cur.bank = b;
    }
    LS.cur = cur;
    renderTask(true);
  }

  const codeBlock = (code) => `<pre class="code"><code>${esc(code)}</code></pre>`;

  function symbar() {
    return `<div class="symbar">${LS.c.sym.map((s) => `<button class="sym" data-act="sym" data-ins="${esc(s)}">${s === 'Tab' ? '⇥' : esc(s)}</button>`).join('')}</div>`;
  }

  function renderTask(fresh) {
    const { task, perm } = LS.cur;
    const cur = LS.cur;
    let h = `<p class="q">${esc(tr(task.q))}</p>`;
    if (task.t === 'm') {
      if (task.c) h += codeBlock(task.c);
      h += `<div class="opts ${cur.checked ? 'locked' : ''}">` + perm.map((i) => {
        const o = optText(task.o[i]);
        let cls = '';
        // After a check only the picked option is marked; a wrong pick does not reveal the right one (screen 3).
        if (cur.checked) { if (i === cur.sel) cls = i === task.a ? 'right' : 'wrong'; }
        else if (cur.sel === i) cls = 'sel';
        return `<button class="opt ${o.code ? 'mono' : ''} ${cls}" data-act="opt" data-i="${i}" ${cur.removed.has(i) ? 'disabled' : ''}>${esc(o.text)}</button>`;
      }).join('') + '</div>';
    } else if (task.t === 'f') {
      const [a, b] = task.c.split('___');
      const w = Math.max(3, Math.max(...task.a.map((x) => x.length)) + 1);
      h += `<pre class="code has-fill" data-act="fillfocus"><code>${esc(a)}<input id="ans" class="fill" style="width:${w + 1}ch" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="done">${esc(b)}</code></pre>`;
    } else if (task.t === 'w') {
      if (task.c) h += codeBlock(task.c);
      h += `<textarea id="ans" class="write" rows="5" placeholder="${esc(t('typeCode'))}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></textarea>`;
    } else if (task.t === 'o') {
      h += `<div class="slot">${cur.picked.map((k, n) => `<button class="tok mono" data-act="untok" data-n="${n}">${esc(cur.bank[k].x)}</button>`).join('')}</div>
        <p class="small">${esc(t('tapTokens'))}</p>
        <div class="bank">${cur.bank.map((b, k) => `<button class="tok mono ${cur.hl === k ? 'hl' : ''}" data-act="tok" data-k="${k}" ${cur.picked.includes(k) || cur.checked ? 'disabled' : ''}>${esc(b.x)}</button>`).join('')}</div>`;
    }
    const body = $('#lessonBody');
    const typed = task.t === 'f' || task.t === 'w';
    if (fresh || !typed) {
      body.innerHTML = h;
      if (fresh) body.scrollTop = 0;
      body.classList.toggle('grow', task.t === 'w'); // the textarea takes the free height
    }
    // The symbol bar is docked right above the footer (and so above the iOS keyboard).
    const dock = $('#symdock');
    if (fresh) dock.innerHTML = typed ? symbar() : '';
    dock.hidden = !typed || cur.checked;
    $('#bar').firstElementChild.style.width = Math.round((100 * LS.done) / LS.total) + '%';
    if (fresh) {
      const sheet = $('#sheet'); sheet.hidden = true; sheet.className = 'sheet';
      const btn = $('#checkBtn'); btn.className = 'btn'; btn.textContent = t('check');
    }
    $('#checkBtn').disabled = !cur.checked && !canCheck();
  }

  function answerValue() {
    const cur = LS.cur;
    if (cur.task.t === 'm') return cur.sel;
    if (cur.task.t === 'o') return cur.picked.map((k) => cur.bank[k].x);
    const el = $('#ans');
    return el ? el.value : '';
  }
  function canCheck() {
    const cur = LS.cur; if (!cur) return false;
    if (cur.task.t === 'm') return cur.sel !== null;
    if (cur.task.t === 'o') return cur.picked.length > 0;
    return String(answerValue()).trim().length > 0;
  }

  const CHECK_GUARD_MS = 400; let checkedAt = -Infinity;
  function check() {
    if (LS.finished) return exitLesson(true);
    const cur = LS.cur;
    if (cur.checked) {
      // A fast second tap must not skip the answer sheet.
      if (performance.now() - checkedAt < CHECK_GUARD_MS) return;
      return nextTask();
    }
    if (!canCheck()) return;
    const ok = isCorrect(cur.task, LS.c.id, answerValue());
    cur.checked = true; checkedAt = performance.now();
    LS.ans++; if (ok) LS.ok++;
    const p = prog(LS.c.id); p.ans++; if (ok) p.ok++;
    save();
    if (ok) {
      LS.done++;
      LS.queue.shift();
      LS.xp += LS.wrong.has(cur.ti) ? 2 : cur.hints ? 5 : 10;
    } else {
      LS.wrong.add(cur.ti);
      LS.queue.push(LS.queue.shift());
    }
    const el = $('#ans'); if (el) { el.readOnly = true; el.blur(); }
    hideBubble(); // a hint bubble may hold the start of the answer: never leave it next to the result
    renderTask(false);
    feedback(ok);
  }

  function flash(ok) {
    const g = $('#glow'); const i = $('#bigicon');
    g.className = 'glow'; i.className = 'bigicon';
    void g.offsetWidth;
    g.className = 'glow ' + (ok ? 'ok' : 'bad');
    i.innerHTML = pix(ok ? 'check' : 'cross');
    i.className = 'bigicon ' + (ok ? 'ok' : 'bad');
  }

  function react(cls) {
    const m = $('#lmascot .mascot'); if (!m) return;
    m.classList.remove('happy', 'sad'); void m.offsetWidth; m.classList.add(cls);
  }

  // A wrong answer shows only the "wrong" title: the correct answer is not revealed (screen 3).
  function feedback(ok) {
    flash(ok);
    beep(ok ? 'ok' : 'bad');
    react(ok ? 'happy' : 'sad');
    const sheet = $('#sheet');
    sheet.className = 'sheet ' + (ok ? 'ok' : 'bad');
    sheet.innerHTML = `<h3>${pix(ok ? 'check' : 'cross')}<span>${esc(t(ok ? 'correct' : 'wrong'))}</span></h3>`;
    sheet.hidden = false;
    const btn = $('#checkBtn');
    btn.className = 'btn ' + (ok ? 'ok' : 'bad');
    btn.textContent = t('next');
    btn.disabled = false;
  }

  function finishLesson() {
    LS.finished = true;
    music.stop(); clearTapRetry();
    const p = prog(LS.c.id);
    if (!p.done.includes(LS.li)) p.done.push(LS.li);
    const acc = LS.ans ? Math.round((100 * LS.ok) / LS.ans) : 0;
    p.best[LS.li] = Math.max(p.best[LS.li] || 0, acc);
    p.xp += LS.xp;
    S.days[dayKey()] = (S.days[dayKey()] || 0) + LS.xp;
    save();
    $('#bar').firstElementChild.style.width = '100%';
    $('#sheet').hidden = true;
    $('#symdock').hidden = true;
    $('#lessonBody').classList.remove('grow');
    $('#lessonBody').innerHTML = `<div class="finish">${mascotSVG('big jump')}
      <h2>${esc(t('lessonDone'))}</h2></div>`;
    const btn = $('#checkBtn'); btn.className = 'btn'; btn.textContent = t('next'); btn.disabled = false;
    beep('done');
  }

  function exitLesson(force, opener) {
    // R12: an in-app modal instead of window.confirm. Music keeps playing while it is open.
    if (!force && LS && !LS.finished && LS.ans > 0) { modal('quitQ', 'quit', () => exitLesson(true), { opener }); return; }
    LS = null;
    music.stop(); clearTapRetry();
    hideBubble();
    $('#lesson').hidden = true;
    document.body.classList.remove('in-lesson');
    render();
    resetScroll();
  }
  // R8: the document never scrolls, only #screen; a new screen opens from the top.
  function resetScroll() { $('#screen').scrollTop = 0; }

  /* ---------- Mascot hints ---------- */
  let bubbleTimer = 0;
  function bubble(text, code) {
    const b = $('#bubble');
    b.innerHTML = code ? `${esc(text)}<pre>${esc(code)}</pre>` : esc(text);
    // In a lesson the bubble sits in the flow under the top bar, so it never covers the task (R7).
    if (LS) $('#lesson .ltop').after(b); else if (b.parentNode !== document.body || b.nextElementSibling !== $('#toast')) $('#toast').before(b);
    b.hidden = false;
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(hideBubble, 6000);
  }
  function hideBubble() { const b = $('#bubble'); if (b) { b.hidden = true; b.textContent = ''; } clearTimeout(bubbleTimer); }

  function hint() {
    if (!LS || LS.finished || !LS.cur || LS.cur.checked) return bubble(t(LS ? 'hintNone' : 'hello'));
    if (!S.settings.hints) return bubble(t('hintsOff'));
    const cur = LS.cur; const task = cur.task;
    if (task.t === 'm') {
      const wrong = task.o.map((_, i) => i).filter((i) => i !== task.a && !cur.removed.has(i));
      if (wrong.length > 1) {
        cur.hints++;
        cur.removed.add(wrong[Math.floor(Math.random() * wrong.length)]);
        if (cur.sel !== null && cur.removed.has(cur.sel)) cur.sel = null;
        renderTask(false);
        return bubble(t('hintFifty'));
      }
      return bubble(t('hintNone'));
    }
    if (task.t === 'f' || task.t === 'w') {
      if (cur.hints >= 3) return bubble(t('hintNone'));
      cur.hints++;
      const ans = String(task.a[0]);
      const n = Math.max(1, Math.ceil((ans.length * cur.hints) / 4));
      return bubble(t('hintStart'), ans.slice(0, n) + (n < ans.length ? '…' : ''));
    }
    if (task.t === 'o') {
      const picked = cur.picked.map((k) => cur.bank[k].x);
      for (let i = 0; i < picked.length; i++) if (picked[i] !== task.a[i]) return bubble(t('hintUndo'));
      if (picked.length >= task.a.length) return bubble(t('hintNone'));
      const want = task.a[picked.length];
      const k = cur.bank.findIndex((b, idx) => b.x === want && !cur.picked.includes(idx));
      cur.hints++; cur.hl = k;
      renderTask(false);
      return bubble(t('hintNext'));
    }
  }

  /* ---------- Input helpers ---------- */
  function insertSym(btn) {
    const el = $('#ans');
    if (!el || el.readOnly) return;
    let v = btn.dataset.ins;
    if (v === 'Tab') v = LS && LS.c.id === 'py' ? '    ' : '  ';
    const s = el.selectionStart ?? el.value.length; const e = el.selectionEnd ?? s;
    el.setRangeText(v, s, e, 'end');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.focus();
  }

  // R8: the lesson is pinned to the screen edges (position: fixed; inset: 0). Only while a native
  // input in the lesson has focus (the keyboard is up) it follows the visual viewport; otherwise
  // the inline height is cleared so the lesson never keeps a stale height (a band under it).
  function fitViewport() {
    const vv = window.visualViewport; const el = $('#lesson');
    if (!el) return;
    const a = document.activeElement;
    const typing = !!vv && !el.hidden && !!a && el.contains(a) && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
    el.style.height = typing ? vv.height + 'px' : '';
    el.style.transform = typing && vv.offsetTop ? `translateY(${vv.offsetTop}px)` : '';
  }

  /* ---------- Modal (R12): app-styled confirmation instead of window.confirm ---------- */
  // At most one at a time. Focus goes to Cancel, Tab cycles inside, Esc / backdrop = cancel,
  // focus returns to the opener. The action fires once; a ghost tap right after closing is swallowed.
  let modalEl = null;
  let ghostUntil = 0;
  function modal(titleKey, okKey, onOk, opts = {}) {
    if (modalEl) return;
    const opener = opts.opener || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const openerAct = opener && opener.dataset ? opener.dataset.act : '';
    const wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.innerHTML = `<div class="mback" data-m="cancel"></div>
      <div class="mbox" role="dialog" aria-modal="true" aria-labelledby="mtitle">
        <h2 id="mtitle" class="mtitle">${esc(t(titleKey))}</h2>
        <div class="mbtns">
          <button type="button" class="btn ghost" data-m="cancel">${esc(t('cancel'))}</button>
          <button type="button" class="btn${opts.danger ? ' danger' : ''}" data-m="ok">${esc(t(okKey))}</button>
        </div>
      </div>`;
    const behind = ['#screen', '#tabbar', '#lesson'].map((sel) => $(sel)).filter(Boolean);
    let closed = false;
    const close = (ok) => {
      if (closed) return; // a double tap on the action can't fire it twice
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      behind.forEach((el) => { el.inert = false; });
      wrap.remove(); modalEl = null;
      ghostUntil = Date.now() + 400;
      if (ok) onOk();
      const shown = (el) => el.isConnected && el.getClientRects().length > 0;
      const back = opener && shown(opener) ? opener
        : openerAct ? $$(`[data-act="${openerAct}"]`).find(shown) : null;
      if (back) back.focus({ preventScroll: true });
    };
    const btns = () => $$('button', wrap);
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); return; }
      if (e.key !== 'Tab') return;
      const b = btns(); const i = b.indexOf(document.activeElement);
      e.preventDefault(); e.stopPropagation();
      if (i < 0) b[0].focus();
      else if (e.shiftKey) b[(i + b.length - 1) % b.length].focus();
      else b[(i + 1) % b.length].focus();
    }
    wrap.addEventListener('click', (e) => {
      e.stopPropagation(); // never reaches the app's [data-act] handler
      const m = e.target.closest('[data-m]');
      if (m) close(m.dataset.m === 'ok');
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(wrap);
    modalEl = wrap;
    behind.forEach((el) => { el.inert = true; });
    btns()[0].focus({ preventScroll: true });
  }
  // A real tap (detail > 0) right after a modal closed is the second half of a double tap: swallow it,
  // so it can't hit whatever was under the action button (e.g. a lesson row after quitting).
  document.addEventListener('click', (e) => {
    if (!modalEl && e.detail > 0 && Date.now() < ghostUntil) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  function toast(msg) {
    const el = $('#toast'); el.textContent = msg;
    // Keep the toast just above the tab bar, whatever its real height (safe area, font size).
    // In a lesson the tab bar is hidden: sit above the lesson footer (it includes the home-indicator inset).
    const bar = $('#tabbar'); const foot = $('#lesson') && !$('#lesson').hidden ? $('#lesson .lfoot') : null;
    const h = bar && bar.offsetHeight ? bar.offsetHeight : foot ? foot.offsetHeight : 0;
    if (h) document.documentElement.style.setProperty('--tabbar-h', h + 'px');
    else document.documentElement.style.removeProperty('--tabbar-h'); // CSS fallback: 64px + safe-area-inset-bottom
    el.hidden = false;
    clearTimeout(toast.tm); toast.tm = setTimeout(() => { el.hidden = true; }, 2200);
  }

  /* ---------- Events ---------- */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) { if (!e.target.closest('#bubble')) hideBubble(); return; }
    const act = el.dataset.act;
    switch (act) {
      case 'tab': tab = el.dataset.tab; courseId = null; render(); resetScroll(); break;
      case 'course': courseId = el.dataset.id; render(); resetScroll(); break;
      case 'back': courseId = null; render(); resetScroll(); break;
      case 'fillfocus': { const inp = $('#ans', el); if (inp && !inp.readOnly && e.target !== inp) inp.focus(); break; }
      case 'lesson': startLesson(courseId, Number(el.dataset.i)); break;
      case 'mascot': if ($('#bubble').hidden) hint(); else { hideBubble(); if (LS) hint(); } break;
      case 'quit': exitLesson(false, el); break;
      case 'check': check(); break;
      case 'opt': if (!LS.cur.checked) { LS.cur.sel = Number(el.dataset.i); renderTask(false); } break;
      case 'tok': if (!LS.cur.checked) { const k = Number(el.dataset.k); LS.cur.picked.push(k); if (LS.cur.hl === k) LS.cur.hl = -1; renderTask(false); } break;
      case 'untok': if (!LS.cur.checked) { LS.cur.picked.splice(Number(el.dataset.n), 1); renderTask(false); } break;
      case 'sym': insertSym(el); break;
      case 'cycle': {
        // Theme and language are one button each: a tap moves to the next value.
        const k = el.dataset.k; const list = k === 'theme' ? THEMES : LANGS;
        S.settings[k] = list[(list.indexOf(S.settings[k]) + 1) % list.length];
        save(); applySettings(); render();
        const again = $(`[data-act="cycle"][data-k="${k}"]`); if (again) again.focus({ preventScroll: true });
        break;
      }
      case 'reset':
        modal('resetQ', 'resetAct', () => { const keep = S.settings; S = defaults(); S.settings = keep; save(); render(); toast(t('resetDone')); }, { danger: true, opener: el });
        break;
      default: break;
    }
  });

  // Keep the keyboard open when tapping the symbol bar on iOS.
  // The bar scrolls horizontally: a swipe (>10px on any axis) must not insert a symbol.
  // Track the finger that started on a .sym by its identifier, so other fingers don't interfere.
  let symTouch = null;
  const moved = (a, b) => Math.abs(b.clientX - a.x) > 10 || Math.abs(b.clientY - a.y) > 10;
  document.addEventListener('touchstart', (e) => {
    const t0 = e.changedTouches && e.changedTouches[0];
    if (!t0 || !(e.target.closest && e.target.closest('.sym'))) return;
    symTouch = { id: t0.identifier, x: t0.clientX, y: t0.clientY };
  }, { passive: true });
  document.addEventListener('touchcancel', () => { symTouch = null; }, { passive: true });
  document.addEventListener('touchend', (e) => {
    const start = symTouch;
    const list = e.changedTouches ? [...e.changedTouches] : [];
    const mine = start ? list.find((tt) => tt.identifier === start.id) : undefined;
    if (mine) symTouch = null;
    const b = e.target.closest && e.target.closest('.sym');
    if (!b) return;
    if (mine && moved(start, mine)) return; // swipe: let the bar scroll
    // A tap, or a touchend without a known touchstart: insert as a tap.
    e.preventDefault();
    insertSym(b);
  }, { passive: false });
  document.addEventListener('mousedown', (e) => { if (e.target.closest('.sym')) e.preventDefault(); });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'ans' && LS && LS.cur && !LS.cur.checked) $('#checkBtn').disabled = !canCheck();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'ans' && e.target.tagName === 'INPUT') { e.preventDefault(); check(); }
  });
  document.addEventListener('change', (e) => {
    const k = e.target.dataset.set;
    if (k) {
      if (!TOGGLES.includes(k)) return;
      S.settings[k] = e.target.checked;
      if (k === 'music' && !S.settings.music) music.stop();
      save(); applySettings(); render();
    }
  });

  // R11: no music while the app is in the background; resume only inside an open lesson.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { music.stop(); return; }
    if (!musicWanted()) return;
    music.resume().then((running) => {
      // iOS may refuse to resume audio without a gesture: the next tap in the lesson restarts it.
      if (running || !musicWanted() || tapRetry) return;
      tapRetry = true;
      $('#lesson').addEventListener('pointerdown', onRetryTap);
    });
  });

  // The lesson follows the visual viewport only while its input is focused (keyboard up).
  document.addEventListener('focusin', () => setTimeout(fitViewport, 0));
  document.addEventListener('focusout', () => setTimeout(fitViewport, 0));
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', fitViewport);
    window.visualViewport.addEventListener('scroll', fitViewport);
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applySettings);

  /* ---------- Boot ---------- */
  load();
  applySettings();
  render();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  // Exposed for automated checks only.
  window.__codelingo = { norm, isCorrect, optText, sanitize, COURSES };
})();
