(() => {
  'use strict';

  const VERSION = '1.0.4';
  const KEY = 'codelingo.v1';
  const LANGS = ['en', 'ru', 'uk', 'cs'];
  const LANG_NAMES = { en: 'English', ru: 'Русский', uk: 'Українська', cs: 'Čeština' };
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
    settings: { theme: 'system', lang: detectLang(), sound: true, hints: true, motion: true, code: 'm', goal: 30 },
    prog: {}, days: {},
  });
  let S;
  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { /* storage blocked */ }
    try { S = raw ? JSON.parse(raw) : null; } catch (e) { S = null; }
    S = sanitize(S);
  }
  // Coerce stored/imported data into a safe shape so bad JSON can never break boot.
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const num = (x) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Math.floor(Number(x)) : 0);
  function sanitize(raw) {
    const d = defaults();
    if (!isObj(raw)) return d;
    const s = Object.assign(d.settings, isObj(raw.settings) ? raw.settings : {});
    if (!LANGS.includes(s.lang)) s.lang = detectLang();
    if (![10, 20, 30, 50].includes(Number(s.goal))) s.goal = 30; else s.goal = Number(s.goal);
    const prog = {};
    if (isObj(raw.prog)) {
      Object.keys(raw.prog).forEach((id) => {
        const p = raw.prog[id]; if (!isObj(p)) return;
        const c = COURSES.find((x) => x.id === id);
        const max = c ? c.lessons.length : 0;
        const done = Array.isArray(p.done) ? [...new Set(p.done.filter((i) => Number.isInteger(i) && i >= 0 && i < max))] : [];
        const ans = num(p.ans);
        prog[id] = { done, ans, ok: Math.min(num(p.ok), ans), xp: num(p.xp) };
      });
    }
    const days = {};
    if (isObj(raw.days)) Object.keys(raw.days).forEach((k) => { if (/^\d{4}-\d\d-\d\d$/.test(k) && num(raw.days[k])) days[k] = num(raw.days[k]); });
    return { settings: s, prog, days };
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
  function prog(id) { return S.prog[id] || (S.prog[id] = { done: [], ans: 0, ok: 0, xp: 0 }); }

  const t = (k) => { const d = window.I18N[S.settings.lang] || window.I18N.en; return d[k] !== undefined ? d[k] : (window.I18N.en[k] !== undefined ? window.I18N.en[k] : k); };
  const tr = (s) => { if (s == null) return ''; const p = String(s).split('§'); return p[LANGS.indexOf(S.settings.lang)] || p[0]; };
  const optText = (o) => (o[0] === '~' ? { text: tr(o.slice(1)), code: false } : { text: o, code: true });

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
  let ac = null;
  const SND = {
    ok: [[660, 0.08, 0], [990, 0.12, 0.08]],
    bad: [[196, 0.16, 0], [147, 0.22, 0.12]],
    done: [[523, 0.1, 0], [659, 0.1, 0.1], [784, 0.1, 0.2], [1046, 0.22, 0.3]],
  };
  function beep(name) {
    if (!S.settings.sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
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
      const got = norm(task.c.replace('___', input), lang);
      return task.a.some((a) => norm(task.c.replace('___', a), lang) === got);
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
  function lvlName(k) { const l = t('lvl'); return k === 0 ? l[0] : k < 25 ? l[1] : k < 50 ? l[2] : k < 75 ? l[3] : k < 100 ? l[4] : l[5]; }

  /* ---------- Settings application ---------- */
  function applySettings() {
    const r = document.documentElement;
    if (S.settings.theme === 'system') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', S.settings.theme);
    r.setAttribute('data-motion', S.settings.motion ? 'on' : 'off');
    r.style.setProperty('--code-size', { s: '13px', m: '15px', l: '18px' }[S.settings.code] || '15px');
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

  function viewLearn() {
    return header('CodeLingo') + `<p class="sub">${esc(t('chooseLang'))}</p><div class="grid">` +
      COURSES.map((c) => {
        return `<button class="card course" data-act="course" data-id="${c.id}">
          <span class="badge">${esc(c.tag)}</span>
          <span class="cname">${esc(c.name)}</span>
        </button>`;
      }).join('') + '</div>';
  }

  function viewCourse(id) {
    const c = COURSES.find((x) => x.id === id);
    const p = prog(id);
    return header('', true) + `<div class="course-head"><span class="badge">${esc(c.tag)}</span><h1>${esc(c.name)}</h1></div>
      <div class="list">` + c.lessons.map((L, i) => {
        const done = p.done.includes(i);
        const open = done || i === 0 || p.done.includes(i - 1);
        return `<button class="card lesson-item ${done ? 'done' : ''} ${open ? '' : 'locked'}" ${open ? `data-act="lesson" data-i="${i}"` : 'disabled'}>
          <span class="num">${i + 1}</span>
          <span class="lt">${esc(tr(L.title))}</span>
          <span class="st">${done ? pix('check', 'ic ok') : open ? esc(t('start')) : pix('lock', 'ic')}</span>
        </button>`;
      }).join('') + '</div>';
  }

  function viewProfile() {
    const todayXp = S.days[dayKey()] || 0;
    const goal = S.settings.goal;
    const week = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); week.push({ on: (S.days[dayKey(d)] || 0) > 0, label: d.toLocaleDateString(S.settings.lang, { weekday: 'short' }).slice(0, 2) }); }
    return header(t('profile')) + `
      <div class="card today">
        <div class="row"><b>${esc(t('today'))}</b><span class="goal">${todayXp}/${goal} XP</span></div>
        <div class="bar big"><i style="width:${Math.min(100, (100 * todayXp) / goal)}%;"></i></div>
        <div class="small">${esc(t('week'))}</div>
        <div class="week">${week.map((w) => `<span><i class="${w.on ? 'on' : ''}"></i>${esc(w.label)}</span>`).join('')}</div>
      </div>
      <h2 class="h2">${esc(t('knowledge'))}</h2>` +
      COURSES.map((c) => {
        const k = knowledge(c);
        return `<div class="krow" data-id="${c.id}">
          <div class="row"><b>${esc(c.name)}</b><span class="lvl">${esc(lvlName(k))}</span></div>
          <div class="bar" aria-hidden="true"><i style="width:${k}%;"></i></div>
        </div>`;
      }).join('');
  }

  function seg(key, opts) {
    return `<div class="seg">${opts.map(([v, l]) => `<button class="${String(S.settings[key]) === String(v) ? 'on' : ''}" data-act="set" data-k="${key}" data-v="${v}">${esc(l)}</button>`).join('')}</div>`;
  }
  const toggle = (key) => `<label class="sw"><input type="checkbox" data-set="${key}" ${S.settings[key] ? 'checked' : ''}><i></i></label>`;

  function viewSettings() {
    return header(t('settings')) + `
      <div class="set col"><span>${esc(t('theme'))}</span>${seg('theme', [['system', t('system')], ['light', t('light')], ['dark', t('dark')]])}</div>
      <div class="set"><span>${esc(t('language'))}</span>
        <select data-set="lang">${LANGS.map((l) => `<option value="${l}" ${S.settings.lang === l ? 'selected' : ''}>${LANG_NAMES[l]}</option>`).join('')}</select></div>
      <div class="set"><span>${esc(t('sound'))}</span>${toggle('sound')}</div>
      <div class="set"><span>${esc(t('mascotHints'))}</span>${toggle('hints')}</div>
      <div class="set"><span>${esc(t('animations'))}</span>${toggle('motion')}</div>
      <div class="set col"><span>${esc(t('codeSize'))}</span>${seg('code', [['s', 'S'], ['m', 'M'], ['l', 'L']])}</div>
      <div class="set col"><span>${esc(t('goal'))}</span>${seg('goal', [[10, '10 XP'], [20, '20 XP'], [30, '30 XP'], [50, '50 XP']])}</div>
      <h2 class="h2">${esc(t('data'))}</h2>
      <div class="stack">
        <button class="btn ghost" data-act="export">${esc(t('exportP'))}</button>
        <button class="btn ghost" data-act="import">${esc(t('importP'))}</button>
        <button class="btn danger" data-act="reset">${esc(t('reset'))}</button>
      </div>
      <p class="about">CodeLingo · ${esc(t('version'))} ${VERSION}<br>${esc(t('offline'))}</p>`;
  }

  function renderTabs() {
    const items = [['learn', 'code'], ['profile', 'user'], ['settings', 'gear']];
    $('#tabbar').innerHTML = items.map(([k, ic]) => `<button class="tab ${tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${pix(ic)}<span>${esc(t(k))}</span></button>`).join('');
  }

  function render() {
    const scr = $('#screen');
    if (tab === 'learn') scr.innerHTML = courseId ? viewCourse(courseId) : viewLearn();
    else if (tab === 'profile') scr.innerHTML = viewProfile();
    else scr.innerHTML = viewSettings();
    renderTabs();
  }

  /* ---------- Lesson ---------- */
  let LS = null;

  function startLesson(cid, li) {
    const c = COURSES.find((x) => x.id === cid);
    const lesson = c.lessons[li];
    LS = { c, li, tasks: lesson.tasks, queue: lesson.tasks.map((_, i) => i), done: 0, total: lesson.tasks.length, wrong: new Set(), xp: 0, ans: 0, ok: 0, cur: null, finished: false };
    $('#lmascot').innerHTML = mascotSVG();
    document.body.classList.add('in-lesson');
    $('#lesson').hidden = false;
    fitViewport();
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
        if (cur.checked) { if (i === task.a) cls = 'right'; else if (i === cur.sel) cls = 'wrong'; }
        else if (cur.sel === i) cls = 'sel';
        return `<button class="opt ${o.code ? 'mono' : ''} ${cls}" data-act="opt" data-i="${i}" ${cur.removed.has(i) ? 'disabled' : ''}>${esc(o.text)}</button>`;
      }).join('') + '</div>';
    } else if (task.t === 'f') {
      const [a, b] = task.c.split('___');
      const w = Math.max(3, Math.max(...task.a.map((x) => x.length)) + 1);
      h += `<pre class="code has-fill" data-act="fillfocus"><code>${esc(a)}<input id="ans" class="fill" style="width:${w + 1}ch" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="done">${esc(b)}</code></pre>` + symbar();
    } else if (task.t === 'w') {
      if (task.c) h += codeBlock(task.c);
      h += `<textarea id="ans" class="write" rows="5" placeholder="${esc(t('typeCode'))}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></textarea>` + symbar();
    } else if (task.t === 'o') {
      h += `<div class="slot">${cur.picked.map((k, n) => `<button class="tok mono" data-act="untok" data-n="${n}">${esc(cur.bank[k].x)}</button>`).join('')}</div>
        <p class="small">${esc(t('tapTokens'))}</p>
        <div class="bank">${cur.bank.map((b, k) => `<button class="tok mono ${cur.hl === k ? 'hl' : ''}" data-act="tok" data-k="${k}" ${cur.picked.includes(k) || cur.checked ? 'disabled' : ''}>${esc(b.x)}</button>`).join('')}</div>`;
    }
    const body = $('#lessonBody');
    if (fresh || (task.t !== 'f' && task.t !== 'w')) {
      body.innerHTML = h;
      if (fresh) body.scrollTop = 0;
    }
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

  function correctText(task) {
    if (task.t === 'm') return optText(task.o[task.a]).text;
    if (task.t === 'f') return task.c.replace('___', task.a[0]);
    if (task.t === 'w') return task.a[0];
    return task.a.join(' ');
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
    renderTask(false);
    feedback(ok, cur.task);
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

  function feedback(ok, task) {
    flash(ok);
    beep(ok ? 'ok' : 'bad');
    react(ok ? 'happy' : 'sad');
    const sheet = $('#sheet');
    sheet.className = 'sheet ' + (ok ? 'ok' : 'bad');
    sheet.innerHTML = `<h3>${pix(ok ? 'check' : 'cross')}<span>${esc(t(ok ? 'correct' : 'wrong'))}</span></h3>` +
      (ok ? '' : `<div class="small">${esc(t('answer'))}</div><pre>${esc(correctText(task))}</pre>`);
    sheet.hidden = false;
    const btn = $('#checkBtn');
    btn.className = 'btn ' + (ok ? 'ok' : 'bad');
    btn.textContent = t('next');
    btn.disabled = false;
  }

  function finishLesson() {
    LS.finished = true;
    const p = prog(LS.c.id);
    if (!p.done.includes(LS.li)) p.done.push(LS.li);
    p.xp += LS.xp;
    S.days[dayKey()] = (S.days[dayKey()] || 0) + LS.xp;
    save();
    $('#bar').firstElementChild.style.width = '100%';
    $('#sheet').hidden = true;
    $('#lessonBody').innerHTML = `<div class="finish">${mascotSVG('big jump')}
      <h2>${esc(t('lessonDone'))}</h2></div>`;
    const btn = $('#checkBtn'); btn.className = 'btn'; btn.textContent = t('next'); btn.disabled = false;
    beep('done');
  }

  function exitLesson(force) {
    if (!force && LS && !LS.finished && LS.ans > 0 && !window.confirm(t('quitQ'))) return;
    LS = null;
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
  function hideBubble() { const b = $('#bubble'); if (b) b.hidden = true; clearTimeout(bubbleTimer); }

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

  function fitViewport() {
    const vv = window.visualViewport; const el = $('#lesson');
    if (!vv || !el || el.hidden) return;
    el.style.height = vv.height + 'px';
    el.style.transform = `translateY(${vv.offsetTop}px)`;
  }

  // iOS home-screen apps ignore <a download> with blob URLs: prefer the Web Share sheet with a File.
  function downloadFallback(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  let exporting = false; // share sheet is open: ignore repeated taps on Export
  async function exportProgress() {
    if (exporting) return;
    exporting = true;
    try { await doExport(); } finally { exporting = false; }
  }
  async function doExport() {
    const name = `codelingo-${dayKey()}.json`;
    const json = JSON.stringify(S, null, 2);
    let file = null;
    try { file = new File([json], name, { type: 'application/json' }); } catch (_) { file = null; }
    if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; }
      catch (err) {
        // AbortError: user cancelled. InvalidStateError: another share is still open.
        if (err && (err.name === 'AbortError' || err.name === 'InvalidStateError')) return;
      }
    }
    downloadFallback(file || new Blob([json], { type: 'application/json' }), name);
  }

  function toast(msg) {
    const el = $('#toast'); el.textContent = msg;
    // Keep the toast just above the tab bar, whatever its real height (safe area, font size).
    const bar = $('#tabbar');
    document.documentElement.style.setProperty('--tabbar-h', (bar && bar.offsetHeight ? bar.offsetHeight : 0) + 'px');
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
      case 'quit': exitLesson(false); break;
      case 'check': check(); break;
      case 'opt': if (!LS.cur.checked) { LS.cur.sel = Number(el.dataset.i); renderTask(false); } break;
      case 'tok': if (!LS.cur.checked) { const k = Number(el.dataset.k); LS.cur.picked.push(k); if (LS.cur.hl === k) LS.cur.hl = -1; renderTask(false); } break;
      case 'untok': if (!LS.cur.checked) { LS.cur.picked.splice(Number(el.dataset.n), 1); renderTask(false); } break;
      case 'sym': insertSym(el); break;
      case 'set': {
        const k = el.dataset.k; let v = el.dataset.v;
        if (k === 'goal') v = Number(v);
        S.settings[k] = v; save(); applySettings(); render(); break;
      }
      case 'export': exportProgress(); break;
      case 'import': $('#importFile').click(); break;
      case 'reset':
        if (window.confirm(t('resetQ'))) { const keep = S.settings; S = defaults(); S.settings = keep; save(); render(); toast(t('resetDone')); }
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
      S.settings[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      save(); applySettings(); render();
      return;
    }
    if (e.target.id === 'importFile') {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      f.text().then((txt) => {
        const data = JSON.parse(txt);
        if (!isObj(data) || !isObj(data.prog)) throw new Error('bad');
        S = sanitize(data); save(); applySettings(); render(); toast(t('imported'));
      }).catch(() => toast(t('importErr'))).finally(() => { e.target.value = ''; });
    }
  });

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
  window.__codelingo = { norm, isCorrect, COURSES };
})();
