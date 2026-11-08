// Minimal zero-dependency test harness. Runs in a browser (headless Chrome via run.sh).
window.T = (() => {
  const tests = [];
  const log = (cls, msg) => {
    const el = document.getElementById('log');
    const line = document.createElement('div');
    line.className = cls; line.textContent = msg;
    el.appendChild(line);
  };
  class AssertError extends Error {}
  const assert = (cond, msg) => { if (!cond) throw new AssertError(msg || 'assertion failed'); };
  assert.eq = (got, want, msg) => {
    if (got !== want) throw new AssertError(`${msg || 'not equal'}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  };
  // Collect many problems in one test instead of stopping at the first.
  const collector = () => {
    const errs = [];
    return { check: (cond, msg) => { if (!cond) errs.push(msg); }, errs,
      done: (max = 25) => { if (errs.length) throw new AssertError(`${errs.length} problem(s):\n    - ` + errs.slice(0, max).join('\n    - ') + (errs.length > max ? `\n    … and ${errs.length - max} more` : '')); } };
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, ms = 3000, what = 'condition') => {
    const t0 = Date.now();
    for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) throw new AssertError('timeout waiting for ' + what); await sleep(20); }
  };

  async function run() {
    const filter = new URLSearchParams(location.search).get('grep');
    let pass = 0, fail = 0;
    const failures = [];
    for (const { name, fn } of tests) {
      if (filter && !name.includes(filter)) continue;
      try { await fn(); pass++; log('ok', `✓ ${name}`); }
      catch (e) { fail++; failures.push(name); log('bad', `✗ ${name}\n    ${e && e.stack && !(e instanceof AssertError) ? e.stack : e.message}`); }
    }
    const status = fail ? 'FAIL' : 'PASS';
    log(fail ? 'bad' : 'ok', `\n${status}: ${pass} passed, ${fail} failed`);
    const r = document.getElementById('result');
    r.dataset.status = status; r.textContent = `${status} ${pass}/${pass + fail}`;
  }
  return { test: (name, fn) => tests.push({ name, fn }), assert, collector, sleep, waitFor, run };
})();
