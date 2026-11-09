// UI string tables: same keys and types in every language.
(() => {
  const { test, assert, collector } = T;
  const I = window.I18N;

  test('i18n: en, ru, uk, cs all present', () => {
    ['en', 'ru', 'uk', 'cs'].forEach((l) => assert(I[l] && typeof I[l] === 'object', `missing ${l}`));
  });

  test('i18n: every key exists in every language with the same type', () => {
    const k = collector();
    const all = new Set(Object.keys(I).flatMap((l) => Object.keys(I[l])));
    Object.keys(I).forEach((l) => all.forEach((key) => {
      const v = I[l][key]; const e = I.en[key];
      k.check(v !== undefined, `${l}: missing "${key}"`);
      if (v !== undefined && e !== undefined) {
        k.check(Array.isArray(v) === Array.isArray(e) && typeof v === typeof e, `${l}.${key}: type differs from en`);
        if (Array.isArray(v)) k.check(v.length === e.length, `${l}.${key}: ${v.length} items, en has ${e.length}`);
        if (typeof v === 'string') k.check(v.trim() !== '', `${l}.${key}: empty string`);
      }
    }));
    k.done();
  });
})();
