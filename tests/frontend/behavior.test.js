import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { escapeHtml, normalizeQuestion, questionNumber } from '../../public/src/api.js';
import { formatStudyText, skeletonMarkup } from '../../public/src/richText.js';
import { compressImage } from '../../public/src/imageTools.js';

// Run the real UI handlers with only the DOM surface they use.
function loadUi(fetchImpl = async () => ({ ok: true, json: async () => ({
  success: true, method: 'algebra', steps: ['整理條件'], answer: 'x = 1'
}) })) {
  const elements = new Map();
  const saved = [];
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value: '', innerHTML: '', textContent: '', disabled: false, style: {},
      classList: { add() {}, remove() {}, toggle() {} }, focus() {},
      addEventListener() {}, setAttribute() {}, removeAttribute(name) { delete this[name]; },
      querySelectorAll() { return []; },
      showModal() { this.open = true; }, close() { this.open = false; }, play: async () => {}
    });
    return elements.get(id);
  }
  const context = vm.createContext({
    document: { body: { dataset: {} }, getElementById: element, querySelectorAll: () => [],
      createElement: () => ({ getContext: () => ({ drawImage() {}, fillRect() {} }), toDataURL: () => 'data:image/jpeg;base64,aGVsbG8=' }) },
    navigator: {}, addEventListener() {}, console: { error() {} },
    setTimeout, clearTimeout, AbortController, fetch: fetchImpl,
    escapeHtml, normalizeQuestion, questionNumber, loadQuestionBank: () => [],
    formatStudyText, skeletonMarkup, createCropTool: () => ({ open() {}, close() {} }),
    compressImage: (image, rect) => compressImage(image, rect, () => context.document.createElement('canvas')),
    requestAI: async (url, payload, options) => {
      const response = await fetchImpl(url, { body: JSON.stringify(payload), signal: options.signal });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data?.error?.message || 'AI 解題失敗');
      return data;
    },
    saveQuestionToBank: (...args) => { saved.push(args); return []; }
  });
  const source = readFileSync(new URL('../../public/src/main.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from '[^']+';\r?\n/gm, '');
  vm.runInContext(source, context);
  return { context, element, saved, run: (code) => vm.runInContext(code, context) };
}

test('AI truth table displays every input and output row without executing HTML', () => {
  const ui = loadUi();
  ui.context.answer = { answer: 'AND', table: { inputs: ['A', 'B'], rows: [
    { A: 0, B: 0, Y: 0 }, { A: 0, B: 1, Y: 0 },
    { A: 1, B: 0, Y: 0 }, { A: 1, B: 1, Y: '<script>alert(1)</script>' }
  ] } };
  const html = ui.run('formatStructuredAnswer(answer)');
  assert.equal((html.match(/<tr>/g) || []).length, 5);
  for (const header of ['A', 'B', 'Y']) assert.ok(html.includes(`>${header}</th>`));
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test('pending solve shows skeleton, ignores duplicate clicks and switching teaching mode ignores old replies', async () => {
  let finish, calls = 0;
  const ui = loadUi(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  ui.element('question').value = '2x+3=11';
  const pending = ui.run('solve()');
  assert.match(ui.element('result').innerHTML, /class="skeleton"/);
  await ui.run('solve()'); assert.equal(calls, 1);
  ui.run("changeTeachingMode('guided')");
  finish({ ok: true, json: async () => ({ success: true, answer: 'old final answer', steps: ['old'] }) });
  await pending;
  assert.doesNotMatch(ui.element('result').innerHTML, /old final answer|class="skeleton"/);
});

test('guided retry sends the learner attempt and previous hints without showing a final answer label', async () => {
  const calls = [];
  const ui = loadUi(async (url, options) => { calls.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ success: true, mode: 'guided', steps: ['先減 3'], answer: '下一步呢？' }) }; });
  ui.element('question').value = '2x+3=11'; ui.run("changeTeachingMode('guided')");
  await ui.run('solve()');
  assert.doesNotMatch(ui.element('result').innerHTML, /最終答案/);
  ui.element('answer-feedback').value = '我得到 2x=8';
  await ui.run('solve()');
  assert.equal(calls[1].mode, 'guided'); assert.equal(calls[1].feedback, '我得到 2x=8');
  assert.match(calls[1].previousAnswer, /先減 3/);
  ui.run('saveQuestion()'); assert.match(ui.saved[0][2], /引導提示/);
});

test('cropping cancels an in-flight recognition and prevents stale OCR from being applied', async () => {
  let finish, signal;
  const ui = loadUi((url, options) => { signal = options.signal; return new Promise(resolve => { finish = resolve; }); });
  ui.run("state.imageData={mimeType:'image/png',data:'aGVsbG8='}; state.originalPhoto='original'");
  const pending = ui.run('recognizePhoto()');
  assert.match(ui.element('result').innerHTML, /skeleton/);
  ui.run("useEditedPhoto({mimeType:'image/jpeg',data:'cropped',url:'data:image/jpeg;base64,cropped',width:800,height:400})");
  finish({ ok: true, json: async () => ({ success: true, text: 'wrong old image' }) });
  await pending;
  assert.equal(signal.aborted, true); assert.equal(ui.element('recognized-text').value, '');
  assert.equal(ui.run('state.imageData.data'), 'cropped');
});

test('a question-number-only request uses the photo and never calls text solve', async () => {
  const calls = [];
  const ui = loadUi(async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ success: true, text: '174. 2x + 3 = 11', questionNumber: '174', warnings: [] }) };
  });
  ui.element('question').value = '幫我解第174提';
  ui.run("state.imageData = {mimeType:'image/png',data:'aGVsbG8='}");
  await ui.run('solve()');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/recognize');
  assert.equal(calls[0].body.questionNumber, '174');
  assert.equal(ui.element('question').value, '幫我解第174提');
  assert.equal(ui.element('recognized-text').value, '174. 2x + 3 = 11');
});

test('a question number without a photo asks for the full question without AI', async () => {
  let calls = 0;
  const ui = loadUi(async () => { calls++; });
  ui.element('question').value = '174';
  await ui.run('solve()');
  assert.equal(calls, 0);
  assert.match(ui.element('result').innerHTML, /完整題目/);
});

test('changing target cancels recognition and clears previously recognized text', async () => {
  let resolve, signal;
  const ui = loadUi((url, options) => { signal = options.signal; return new Promise((r) => { resolve = r; }); });
  ui.run("state.imageData = {mimeType:'image/png',data:'aGVsbG8='}");
  ui.element('target-number').value = '174';
  const pending = ui.run('recognizePhoto()');
  ui.element('target-number').value = '175';
  ui.run('changeTargetNumber()');
  resolve({ ok: true, json: async () => ({ success: true, text: 'old question' }) });
  await pending;
  assert.equal(signal.aborted, true);
  assert.equal(ui.element('recognized-text').value, '');
});

test('editing target after applying OCR replaces the old question with the new reference', () => {
  const ui = loadUi();
  ui.element('recognized-text').value = '174. 解 2x + 3 = 11';
  ui.run('applyRecognition()');
  ui.element('target-number').value = '175';
  ui.run('changeTargetNumber()');
  assert.equal(questionNumber(ui.element('question').value), '175');
  ui.element('question').value = '請解第176題';
  ui.run('handleQuestionInput()');
  assert.equal(ui.element('target-number').value, '176');
});

test('camera permissions, release and late permission resolution are handled', async () => {
  const ui = loadUi();
  let stopped = 0;
  const stream = { getTracks: () => [{ stop: () => stopped++ }] };
  ui.context.navigator.mediaDevices = { getUserMedia: async () => stream };
  await ui.run('openCamera()');
  assert.equal(ui.element('camera-video').srcObject, stream);
  assert.equal(ui.element('capture-button').disabled, false);
  ui.run('closeCamera()');
  assert.equal(stopped, 1);
  assert.equal(ui.element('camera-dialog').open, false);
  let finish;
  ui.context.navigator.mediaDevices.getUserMedia = () => new Promise((r) => { finish = r; });
  const pending = ui.run('openCamera()');
  ui.run('closeCamera()');
  finish(stream);
  await pending;
  assert.equal(stopped, 2);
  assert.equal(ui.element('camera-video').srcObject, null);
  ui.context.navigator.mediaDevices.getUserMedia = async () => { throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }); };
  await ui.run('openCamera()');
  assert.match(ui.element('camera-status').textContent, /權限未開啟/);
  assert.equal(ui.element('capture-button').disabled, true);
});

test('installed app hides install control and unsupported drawing links to steps', () => {
  const ui = loadUi();
  ui.context.navigator.standalone = true;
  ui.run('updateInstalledUi()');
  assert.equal(ui.element('install-button').hidden, true);
  ui.element('question').value = '2 + 2';
  ui.run('generateVisual()');
  assert.match(ui.element('visual-result').innerHTML, /參閱|參考|閱讀解題步驟/);
  assert.match(ui.element('visual-result').innerHTML, /href="#result"/);
});

test('camera capture compresses a snapshot and feeds normal photo validation', async () => {
  const ui = loadUi();
  let stopped = false, capturedFile, rendered = false;
  ui.context.navigator.mediaDevices = { getUserMedia: async () => ({ getTracks: () => [{ stop: () => { stopped = true; } }] }) };
  ui.context.File = class { constructor(parts, name, options) { this.name = name; this.type = options.type; this.size = 200; } };
  ui.context.FileReader = class { readAsDataURL(file) { capturedFile = file; } };
  const canvas = { getContext: () => ({ drawImage: () => { rendered = true; } }), toBlob: (callback, mime) => { assert.equal(mime, 'image/jpeg'); callback({}); } };
  ui.context.document.createElement = () => canvas;
  await ui.run('openCamera()');
  ui.element('camera-video').videoWidth = 4000;
  ui.element('camera-video').videoHeight = 3000;
  ui.run('capturePhoto()');
  assert.equal(canvas.width, 2000);
  assert.equal(canvas.height, 1500);
  assert.equal(rendered, true);
  assert.equal(stopped, true);
  assert.equal(capturedFile.type, 'image/jpeg');
  assert.equal(ui.element('camera-dialog').open, false);
});

test('AI table supports column and row arrays, and omits an empty table', () => {
  const ui = loadUi();
  ui.context.table = { columns: ['A', 'Y'], rows: [[0, 0], [1, 1]] };
  assert.equal((ui.run('formatAnswerTable(table)').match(/<td /g) || []).length, 4);
  assert.equal(ui.run('formatAnswerTable([])'), '');
});

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

test('saving an empty question shows inline feedback without a blocking dialog', () => {
  const ui = loadUi();
  ui.run('saveQuestion()');
  assert.match(ui.element('result').innerHTML, /請先輸入題目再收藏/);
  assert.equal(ui.saved.length, 0);
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

test('recognition requires review before replacing a manually typed question', async () => {
  let sent;
  const ui = loadUi(async (url, options) => {
    sent = { url, body: JSON.parse(options.body) };
    return { ok: true, json: async () => ({ success: true, text: '2x+3=11', warnings: ['核對數字'] }) };
  });
  ui.element('question').value = 'original';
  ui.run("state.imageData = {mimeType:'image/png',data:'aGVsbG8='}");
  await ui.run('recognizePhoto()');
  assert.equal(sent.url, '/api/recognize');
  assert.equal(sent.body.mimeType, 'image/png');
  assert.equal(ui.element('question').value, 'original');
  assert.equal(ui.element('recognized-text').value, '2x+3=11');
  assert.match(ui.element('photoStatus').textContent, /核對數字/);
  ui.element('recognized-text').value = '2x+3=13';
  ui.run('applyRecognition()');
  assert.equal(ui.element('question').value, '2x+3=13');
});

test('removing a photo cancels recognition and ignores its late result', async () => {
  let finish, signal;
  const ui = loadUi((url, options) => {
    signal = options.signal;
    return new Promise((resolve) => { finish = resolve; });
  });
  ui.run("state.imageData = {mimeType:'image/png',data:'aGVsbG8='}");
  const pending = ui.run('recognizePhoto()');
  ui.run('clearPhoto()');
  assert.equal(signal.aborted, true);
  finish({ ok: true, json: async () => ({ success: true, text: 'stale', warnings: [] }) });
  await pending;
  assert.equal(ui.element('recognized-text').value, '');
  assert.equal(ui.element('recognize-button').disabled, true);
  assert.match(ui.element('photoStatus').textContent, /已移除/);
});

test('recognition errors allow retry and never replace the question', async () => {
  const ui = loadUi(async () => ({ ok: false, json: async () => ({ error: { message: 'AI 忙碌，稍後重試' } }) }));
  ui.element('question').value = 'keep';
  ui.run("state.imageData = {mimeType:'image/png',data:'aGVsbG8='}");
  await ui.run('recognizePhoto()');
  assert.equal(ui.element('recognize-button').disabled, false);
  assert.equal(ui.element('question').value, 'keep');
  assert.match(ui.element('photoStatus').textContent, /忙碌/);
});

test('valid decoded image enables recognition, oversized dimensions do not', () => {
  const ui = loadUi();
  let reader;
  ui.context.FileReader = class {
    constructor() { reader = this; }
    readAsDataURL() {}
  };
  ui.run("handlePhotoUpload({target:{files:[{name:'math.png',type:'image/png',size:100}]}})");
  reader.result = 'data:image/png;base64,aGVsbG8=';
  reader.onload();
  assert.equal(ui.element('recognize-button').disabled, true);
  ui.element('preview').naturalWidth = 100;
  ui.element('preview').naturalHeight = 100;
  ui.element('preview').onload();
  assert.equal(ui.element('recognize-button').disabled, false);
  ui.run("handlePhotoUpload({target:{files:[{name:'large.png',type:'image/png',size:100}]}})");
  reader.result = 'data:image/png;base64,aGVsbG8=';
  reader.onload();
  ui.element('preview').naturalWidth = 6000;
  ui.element('preview').naturalHeight = 4000;
  ui.element('preview').onload();
  assert.equal(ui.element('recognize-button').disabled, true);
  assert.match(ui.element('photoStatus').textContent, /解析度過大/);
});
