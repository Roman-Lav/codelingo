// Course helpers. Translatable strings use "§" as separator: "en§ru§uk§cs".
// Options starting with "~" are translated text; otherwise they are shown as code.
// In every multiple-choice task the correct option is listed first (a = 0); the app shuffles them.
window.COURSES = [];

const P = {
  out: 'What will this output?§Что выведет этот код?§Що виведе цей код?§Co tento kód vypíše?',
  fill: 'Fill in the blank§Заполните пропуск§Заповніть пропуск§Doplňte chybějící část',
  order: 'Put the code in order§Соберите код в правильном порядке§Складіть код у правильному порядку§Seřaďte kód ve správném pořadí',
};

// Multiple choice
function M(q, code, o, a) { return { t: 'm', q, c: code, o, a: a || 0 }; }
// Fill the "___" blank inside code
function F(q, code, a) { return { t: 'f', q, c: code, a }; }
// Write code from scratch; a = list of accepted answers
function W(q, a, code) { return { t: 'w', q, a, c: code || '' }; }
// Order tokens; d = extra distractor tokens
function O(q, a, d) { return { t: 'o', q, a, d: d || [] }; }
function L(title, tasks) { return { title, tasks }; }
function C(id, name, tag, lessons) { window.COURSES.push({ id, name, tag, lessons }); }

// Teaching cards (Duolingo-style "new concept" screens) live in courses/teach-<id>.js.
// Teach(id, lessons): lessons[i] is the list of cards for lesson i (same order as the course's lessons).
// K(title, text, code): title and text are translatable ("en§ru§uk§cs"); code is the example the learner
// will be asked to repeat (typed on the in-app keyboard), so keep it short — one line, max ~40 chars,
// using only characters from the keyboard layers. The same cards build the course Guide.
window.TEACH = {};
function K(title, text, code) { return { title, text, code }; }
function Teach(id, lessons) { window.TEACH[id] = lessons; }
