// Build/offline checks: every file the service worker precaches exists, and every app file is precached.
(() => {
  const { test, assert, collector } = T;
  const fetchText = (p) => fetch('../' + p, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`); return r.text(); });

  async function swFiles() {
    const src = await fetchText('sw.js');
    const m = src.match(/const FILES = \[([\s\S]*?)\];/);
    assert(m, 'FILES list not found in sw.js');
    return { src, files: [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) };
  }

  test('files: every precached file exists (otherwise SW install fails → no offline)', async () => {
    const { files } = await swFiles();
    const k = collector();
    for (const f of files) {
      const r = await fetch('../' + (f === './' ? '' : f), { cache: 'no-store' });
      k.check(r.ok, `${f}: HTTP ${r.status}`);
    }
    k.done();
  });

  test('files: every script/style/icon referenced by index.html is precached', async () => {
    const { files } = await swFiles();
    const html = await fetchText('index.html');
    const refs = [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map((x) => x[1]);
    const k = collector();
    refs.forEach((r) => k.check(files.includes(r), `${r} is used by index.html but not in sw.js FILES`));
    k.done();
  });

  test('files: manifest is valid JSON with icons that exist', async () => {
    const m = JSON.parse(await fetchText('manifest.webmanifest'));
    assert(m.name && m.start_url && m.display, 'name/start_url/display');
    for (const ic of m.icons) {
      const r = await fetch('../' + ic.src);
      assert(r.ok, `${ic.src} missing`);
      // PNG IHDR: width/height are big-endian uint32 at bytes 16..23.
      const v = new DataView(await r.arrayBuffer());
      assert.eq(v.getUint32(0), 0x89504e47, `${ic.src} is not a PNG`);
      assert.eq(`${v.getUint32(16)}x${v.getUint32(20)}`, ic.sizes, `${ic.src} real size`);
    }
  });

  test('files: style.css has no 100vh or dvh (R8: fixed inset shell)', async () => {
    const css = (await fetchText('style.css')).replace(/\/\*[\s\S]*?\*\//g, '');
    const k = collector();
    css.split('\n').forEach((line, i) => { if (/100vh|dvh/.test(line)) k.check(false, `style.css:${i + 1}: ${line.trim()}`); });
    k.done();
  });

  test('files: no native dialogs, file pickers or share sheet in app code (R12)', async () => {
    const k = collector();
    for (const f of ['app.js', 'music.js', 'sw.js', 'index.html']) {
      const src = await fetchText(f);
      [/\b(window\.)?(confirm|alert|prompt)\s*\(/, /navigator\.(share|canShare)/, /type=["']?file/, /show(Open|Save)FilePicker/].forEach((re) => k.check(!re.test(src), `${f}: matches ${re}`));
    }
    k.done();
  });

  test('files: app VERSION and sw CACHE are bumped together', async () => {
    const app = await fetchText('app.js');
    const { src } = await swFiles();
    const ver = (app.match(/const VERSION = '([^']+)'/) || [])[1];
    const cache = (src.match(/const CACHE = '([^']+)'/) || [])[1];
    assert(ver && cache, 'VERSION / CACHE not found');
    assert(cache.endsWith(ver) || cache.endsWith('v' + ver.split('.')[0]), `sw CACHE "${cache}" should track app VERSION "${ver}"`);
  });
})();
