import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDiscussionSession } from '../../public/src/discussionSession.js';
import { createDiscussionPanel } from '../../public/src/discussionPanel.js';
import { createDiscussionStore } from '../../public/src/discussionStore.js';

export function memoryStore() {
  const rows = new Map();
  return { rows, list: async () => [...rows.values()], get: async id => structuredClone(rows.get(id)),
    put: async (record, version) => {
      assert.equal(rows.get(record.id)?.version || 0, version);
      rows.set(record.id, structuredClone({ ...record, version: version + 1 })); return version + 1;
    } };
}
const lesson = { subject: 'math', method: 'algebra', steps: ['兩邊減 3，2x=8', '兩邊除 2，x=4'], answer: 'x=4' };
const reader = { visible: 1, steps: lesson.steps.slice(0, 1), drafts: { 0: '原來的草稿' }, history: [] };
const source = { kind: 'step', index: 0, text: lesson.steps[0] };
function setup(request = async () => ({ reply: '保持兩邊相等' }), store = memoryStore()) {
  const app = createDiscussionSession({ request, store }); app.start(lesson, '2x+3=11', null, reader); return { app, store };
}
test('branches are manual, retain source/reader and have isolated histories with bounded main context', async () => {
  const seen = []; const { app } = setup(async p => { seen.push(p); return { reply: `說明 ${seen.length}` }; });
  for (let i=0; i<5; i++) await app.ask(`主線 ${i}`);
  const branchA = app.open(source, reader); assert.equal(seen.length, 5);
  app.edit('attempt', '我的草稿'); app.edit('background', '還沒學移項'); await app.ask('為何兩邊同減？');
  assert.equal(seen[5].mainContext.length, 4); assert.deepEqual(seen[5].steps, reader.steps);
  assert.equal(seen[5].draft, '我的草稿'); assert.equal(seen[5].background, '還沒學移項');
  const branchB = app.open({ kind: 'text', start: 0, end: 2, text: '2x' }); await app.ask('這是乘法嗎？');
  assert.deepEqual(seen[6].history, []); assert.equal(app.view().record.branches.length, 2);
  app.select(branchA); await app.ask('再用天平說明'); assert.equal(seen[7].history.length, 1);
  assert.doesNotMatch(JSON.stringify(seen[7]), /這是乘法嗎/);
  app.select(); assert.equal(app.view().record.main.history.length, 5);
  assert.deepEqual(app.view().record.reader, reader); assert.notEqual(branchA, branchB); await app.flush();
});
test('pending replies remain with origin across branches, new problems and reopening the old problem', async () => {
  let finish; const { app, store } = setup(() => new Promise(resolve => { finish = resolve; }));
  const oldId = app.view().record.id, oldBranch = app.open(source, reader);
  const work = app.ask('慢一點的追問'); await app.ask('重複送出');
  app.open({ kind: 'text', start:0, end:2, text:'2x' });
  app.start({ ...lesson, answer:'new' }, 'new problem', null, reader);
  finish({ reply:'只屬於旧旁支' }); await work;
  assert.equal(app.view().record.question, 'new problem'); assert.equal(app.view().record.branches.length, 0);
  await app.resume(oldId); app.select(oldBranch);
  assert.equal(app.view().record.branches[0].history.length, 1);
  assert.equal(store.rows.get(oldId).branches[0].history[0].reply, '只屬於旧旁支');
  await app.flush();
});
test('return does not transfer or invoke AI; edited notes transfer without whole transcripts; proposals need adoption', async () => {
  const seen=[]; let adopted;
  const store=memoryStore(); const app=createDiscussionSession({store, onAdopt:r=>{adopted=r;}, request:async p=>{
    seen.push(p);return p.action==='review'?{proposal:{steps:['重新核對 2x=8','x=4'],answer:'x=4',explanation:'核對完成',reason:'原計算無誤',affected:'維持答案，補充第一步理由'}}:{reply:'旁支私有的長篇內容'};
  }});
  app.start(lesson,'2x+3=11',null,reader);const b=app.open(source,reader);await app.ask('為何減3');
  app.select();assert.equal(seen.length,1);assert.equal(app.view().record.transfers.length,0);
  app.select(b);app.edit('conclusion','兩邊做相同操作');app.edit('correction','請核對第一步');app.transfer();
  assert.equal(seen.length,1);assert.equal(app.view().selected,'main');assert.equal(app.view().record.revision,1);
  await app.review();assert.equal(adopted,undefined);assert.equal(app.view().record.lesson.steps[0],lesson.steps[0]);
  assert.doesNotMatch(JSON.stringify(seen[1]),/旁支私有的長篇內容/);assert.match(seen[1].notes[0],/兩邊做相同操作/);
  app.adopt();assert.equal(adopted.revision,2);assert.equal(adopted.revisions[0].lesson.answer,'x=4');
  assert.equal(adopted.revisions[0].reason,'原計算無誤');assert.equal(adopted.branches[0].revision,1);await app.flush();
});
test('reload restores progress, drafts, separate histories and material anchors without sending AI', async () => {
  const {app,store}=setup();const recordId=app.view().record.id;
  app.open(source,reader);app.edit('draft','尚未送出的問題');app.edit('unresolved','還不懂');await app.flush();
  let calls=0,restored;const fresh=createDiscussionSession({store,request:async()=>{calls++;},onRestore:r=>{restored=r;}});
  await fresh.resume(recordId);assert.equal(calls,0);assert.deepEqual(restored.reader,reader);
  assert.equal(restored.branches[0].draft,'尚未送出的問題');assert.equal(restored.branches[0].transfer.unresolved,'還不懂');
  assert.deepEqual(restored.branches[0].source,source);
});
test('network and storage failures preserve drafts and histories with truthful status', async () => {
  const {app}=setup(async()=>{throw new Error('offline');},{list:async()=>[],put:async()=>{throw new Error('quota full');}});
  app.open(source,reader);await app.ask('保留我的問題');await app.flush();
  assert.equal(app.view().record.branches[0].draft,'保留我的問題');assert.match(app.view().notice,/尚未保存.*quota full/);
  assert.match(app.view().record.branches[0].status,/offline/);assert.match(app.export(),/保留我的問題/);
  await assert.rejects(createDiscussionStore(null).list(),/不支援/);
});
test('branch image source is tied to a snapshot and all discussion content is escaped', async () => {
  const root={innerHTML:'',addEventListener(){}};const store=memoryStore();
  const panel=createDiscussionPanel(root,async()=>({reply:'<img src=x onerror=alert(1)>'}),{store});
  panel.start(lesson,'<script>alert(1)</script>',{mimeType:'image/png',data:'aGVsbG8='},reader);
  panel.open({kind:'image',text:'原圖',rect:{x:.1,y:.2,width:.3,height:.4}},reader);await panel.ask('看這裡');
  assert.match(root.innerHTML,/left:10%;top:20%;width:30%;height:40%/);
  assert.doesNotMatch(root.innerHTML,/<script>|<img src=x/);assert.match(root.innerHTML,/&lt;img/);await panel.flush();
});
test('a late review cannot replace a proposal after the user changes transferred notes',async()=>{
  let finish;const {app}=setup(()=>new Promise(resolve=>{finish=resolve;}));
  const b=app.open(source,reader);app.edit('correction','第一筆');app.transfer();
  const work=app.review();app.select(b);app.edit('correction','第二筆');app.transfer();
  finish({proposal:{steps:['new'],answer:'new',reason:'r',affected:'a'}});await work;
  assert.equal(app.view().record.proposal,null);assert.match(app.view().record.main.status,/未套用舊提案/);await app.flush();
});
test('typing the next question while waiting is not erased by the earlier reply',async()=>{
  let finish;const {app,store}=setup(()=>new Promise(resolve=>{finish=resolve;}));
  const b=app.open(source,reader);const work=app.ask('第一個問題');
  await app.flush();assert.equal([...store.rows.values()][0].branches[0].draft,'第一個問題');
  app.edit('draft','我先寫好第二個問題');finish({reply:'第一個回答'});await work;
  app.select(b);assert.equal(app.view().record.branches[0].draft,'我先寫好第二個問題');
});
test('autosave failure updates its status callback without rerendering the focused editor',async()=>{
  const messages=[];let renders=0;const app=createDiscussionSession({request:async()=>({reply:'a'}),store:{list:async()=>[],put:async()=>{throw new Error('disk full');}},onChange:()=>renders++,onSaveStatus:m=>messages.push(m)});
  app.start(lesson,'q',null,reader);await app.flush();const before=renders;
  app.edit('draft','留下草稿');await app.flush();assert.equal(renders,before);
  assert.match(messages.at(-1),/尚未保存.*disk full/);assert.equal(app.view().record.main.draft,'留下草稿');
});
