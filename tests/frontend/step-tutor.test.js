import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStepTutor } from '../../public/src/stepTutor.js';

const lesson = { subject: 'math', steps: ['兩邊減 3，得到 2x=8', '兩邊除以 2，得到 x=4'] };
function setup(request = async () => ({ reply: '等式兩邊減同一個數，仍相等。' })) {
  const handlers = {};
  const root = { innerHTML: '', hidden: true, addEventListener: (event, fn) => { handlers[event] = fn; } };
  const tutor = createStepTutor(root, request);
  tutor.mount(lesson, '2x+3=11', '<p>最終答案 x=4</p>');
  return { root, tutor, handlers };
}
test('step reader reveals one step, then next/all without an AI request; drafts survive navigation', () => {
  let calls = 0;
  const { root, tutor, handlers } = setup(async () => { calls++; });
  assert.match(root.innerHTML, /第 1 步/);
  assert.doesNotMatch(root.innerHTML, /第 2 步|最終答案 x=4/);
  handlers.input({ target: { dataset: { stepDraft: '0' }, value: '為何減 3？' } });
  tutor.next();
  assert.match(root.innerHTML, /第 2 步|最終答案 x=4/);
  assert.match(root.innerHTML, /為何減 3？/);
  tutor.mount(lesson, 'new', 'full summary'); tutor.next(true);
  assert.match(root.innerHTML, /full summary/); assert.equal(calls, 0);
});
test('step follow-ups include only revealed steps plus chronological discussion across steps', async () => {
  const calls = [];
  const { tutor, root } = setup(async payload => { calls.push(payload); return { reply: '這是說明' }; });
  await tutor.ask(0, '為什麼？');
  assert.deepEqual(calls[0].steps, [lesson.steps[0]]); assert.deepEqual(calls[0].history, []);
  tutor.next(); await tutor.ask(1, '上一個說明不懂'); await tutor.ask(0, '再說明一下');
  assert.equal(calls[2].question, '2x+3=11');
  assert.deepEqual(calls[2].history.map(turn => turn.step), [0, 1]);
  assert.equal(calls[2].history[0].question, '為什麼？');
  assert.match(root.innerHTML, /再說明一下/);
});
test('new problem aborts a pending follow-up and ignores its late response; duplicate sends are ignored', async () => {
  let finish, signal, calls = 0;
  const { tutor, root } = setup((payload, options) => { calls++; signal = options.signal; return new Promise(resolve => { finish = resolve; }); });
  const pending = tutor.ask(0, 'why'); await tutor.ask(0, 'duplicate'); assert.equal(calls, 1);
  tutor.mount({ subject: 'english', steps: ['new step'] }, 'new question', 'new summary');
  assert.equal(signal.aborted, true);
  finish({ reply: 'old reply' }); await pending;
  assert.doesNotMatch(root.innerHTML, /old reply|>why</); assert.match(root.innerHTML, /new step/);
});
test('failed follow-up keeps prior conversation and retry draft; text is escaped', async () => {
  let count = 0;
  const { tutor, root } = setup(async () => { if (++count === 2) throw new Error('offline'); return { reply: '<script>bad()</script>' }; });
  await tutor.ask(0, '<img src=x onerror=bad()>');
  await tutor.ask(0, '再問');
  assert.match(root.innerHTML, /offline|原有步驟與對話仍保留/);
  assert.match(root.innerHTML, /再問/); assert.match(root.innerHTML, /&lt;script&gt;/);
  assert.doesNotMatch(root.innerHTML, /<script>|<img src=x/);
});
test('long conversations stop explicitly rather than silently losing early context', async () => {
  let count = 0;
  const { tutor, root } = setup(async () => { count++; return { reply: 'answer' }; });
  for (let i = 0; i < 31; i++) await tutor.ask(0, `問 ${i}`);
  assert.equal(count, 30); assert.match(root.innerHTML, /30 次追問/); assert.match(root.innerHTML, /問 0/);
});
