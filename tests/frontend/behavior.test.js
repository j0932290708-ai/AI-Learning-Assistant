import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { escapeHtml, normalizeQuestion } from '../../public/src/api.js';

// Run the real UI handlers with only the DOM surface they use.
function loadUi(fetchImpl = async () => ({ ok: true, json: async () => ({
  success: true, method: 'algebra', steps: ['整理條件'], answer: 'x = 1'
}) })) {
  const elements = new Map();
  const saved = [];
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value: '', innerHTML: '', textContent: '', disabled: false, style: {},
      classList: { remove() {}, toggle() {} },
      addEventListener() {}, setAttribute() {}, removeAttribute(name) { delete this[name]; },
      querySelectorAll() { return []; }
    });
    return elements.get(id);
  }
  const context = vm.createContext({
    document: { body: { dataset: {} }, getElementById: element, querySelectorAll: () => [] },
    navigator: {}, addEventListener() {}, console: { error() {} },
    setTimeout, clearTimeout, AbortController, fetch: fetchImpl,
    escapeHtml, normalizeQuestion, loadQuestionBank: () => [],
    saveQuestionToBank: (...args) => { saved.push(args); return []; }
  });
  const source = readFileSync(new URL('../../public/src/main.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from '\.\/api.js';/, '');
  vm.runInContext(source, context);
  return { context, element, saved, run: (code) => vm.runInContext(code, context) };
}

test('quadratic graph preserves implicit x coefficient', () => {
  const ui = loadUi();
  assert.match(ui.run("createMathVisual('y=x²+x+1').summary"), /1x² \+ 1x \+ 1/);
  assert.match(ui.run("createMathVisual('y=x²-x-2').summary"), /1x² − 1x − 2/);
});

test('unsupported formulas are rejected instead of drawing a valid prefix', () => {
  const ui = loadUi();
  for (const expression of ['y=x^3', 'y=x/2', 'y=x²+sin(x)', 'y=x+x', 'y=x+1/2', 'y=2*x']) {
    ui.context.expression = expression;
    assert.ok(ui.run('createMathVisual(expression).error'), expression);
  }
});

test('curve uses real out-of-range coordinates and clips at graph boundary', () => {
  const html = loadUi().run("createMathVisual('y=x²').html");
  assert.match(html, /clip-path=/);
  assert.match(html, /80\.0,-505\.0/);
});

test('circuits reject ambiguous topology, negative values and extra components', () => {
  const ui = loadUi();
  for (const question of ['-12V 電源接 4Ω', '12V 接 -4Ω', '12V 接 0Ω',
    '12V 接 4Ω 電阻與二極體', '12V 接 4Ω、6Ω 串並聯', '12V 與 5V 接 4Ω']) {
    ui.context.question = question;
    assert.ok(ui.run('createCircuitVisual(question).error'), question);
  }
  assert.ok(ui.run("createCircuitVisual('12V、R1=4Ω、R2=6Ω 串聯').html"));
});

test('changing question clears completed answer and diagram', async () => {
  const ui = loadUi();
  ui.element('question').value = 'y=x+1';
  await ui.run('solve()');
  ui.run('generateVisual()');
  ui.element('question').value = 'y=x+2';
  ui.run('handleQuestionInput()');
  assert.doesNotMatch(ui.element('result').innerHTML, /x = 1/);
  assert.doesNotMatch(ui.element('visual-result').innerHTML, /<svg/);
});

test('late failure from old question cannot overwrite current status', async () => {
  let rejectFetch;
  const ui = loadUi(() => new Promise((resolve, reject) => { rejectFetch = reject; }));
  ui.element('question').value = 'old';
  const pending = ui.run('solve()');
  ui.element('question').value = 'new';
  ui.run('handleQuestionInput()');
  const status = ui.element('result').innerHTML;
  rejectFetch(new Error('old failure'));
  await pending;
  assert.equal(ui.element('result').innerHTML, status);
  assert.equal(ui.element('solve-button').disabled, false);
});

test('actual AI method is displayed and saved while selection remains auto', async () => {
  const ui = loadUi();
  ui.element('question').value = 'x + 1 = 2';
  await ui.run('solve()');
  assert.match(ui.element('result').innerHTML, /代數/);
  ui.run('saveQuestion()');
  assert.equal(ui.saved[0][2], '代數');
  assert.equal(ui.saved[0][3], 'x = 1');
});

test('programming output preserves code whitespace and escapes HTML', () => {
  const ui = loadUi();
  ui.context.answer = { answer: '範例', code: 'if (a < b) {\n  print("<script>");\n}',
    complexity: { time: 'O(n)', space: 'O(1)' } };
  const html = ui.run('formatStructuredAnswer(answer)');
  assert.match(html, /<pre/);
  assert.match(html, /  print\(&quot;&lt;script&gt;&quot;\)/);
  assert.match(html, /O\(n\)/);
  assert.doesNotMatch(html, /<script>/);
});

test('saved answer is visible when reopening the question bank', () => {
  const ui = loadUi();
  ui.run("renderBank([{ question: '1+1', subject: '數學', method: '算術', answer: '2 < 3' }])");
  assert.match(ui.element('bank').innerHTML, /2 &lt; 3/);
});

test('photo selection clears old preview and ignores a stale file read', () => {
  const ui = loadUi();
  const readers = [];
  ui.context.FileReader = class {
    constructor() { readers.push(this); }
    readAsDataURL() {}
  };
  ui.run("handlePhotoUpload({target:{files:[{name:'old.png',type:'image/png',size:10}]}})");
  ui.element('preview').src = 'old-preview';
  ui.run("handlePhotoUpload({target:{files:[{name:'bad.svg',type:'image/svg+xml',size:10}]}})");
  readers[0].result = 'data:image/png;base64,old';
  readers[0].onload();
  assert.equal(ui.element('preview').src, undefined);
  assert.equal(ui.element('preview').style.display, 'none');
  assert.match(ui.element('photoStatus').textContent, /只支援/);
});

test('corrupt photo reports a decoding error and clears preview', () => {
  const ui = loadUi();
  let reader;
  ui.context.FileReader = class {
    constructor() { reader = this; }
    readAsDataURL() {}
  };
  ui.run("handlePhotoUpload({target:{files:[{name:'bad.png',type:'image/png',size:10}]}})");
  reader.result = 'data:image/png;base64,bad';
  reader.onload();
  ui.element('preview').onerror();
  assert.equal(ui.element('preview').style.display, 'none');
  assert.match(ui.element('photoStatus').textContent, /格式損壞/);
});
