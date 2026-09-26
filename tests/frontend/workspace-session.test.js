import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWorkspaceSession } from '../../public/src/workspaceSession.js';
function fixture(request = async () => ({ coaching: { overview: [], observation: { basis: 'not_observed', detail: '未觀察' }, explanation: '先找已知', nextAction: '寫下已知條件', checkFor: '與原題比較' } })) {
  const data = new Map(), versions = new Map();
  const store = { list: async () => [...data.values()], get: async id => structuredClone(data.get(id)), put: async (r,v) => {
    assert.equal(v, versions.get(r.id) || 0); versions.set(r.id,v+1); data.set(r.id, structuredClone({...r,version:v+1})); return v+1;
  } };
  return { store, data, session: createWorkspaceSession({store,request}) };
}
test('workspaces persist multiple materials, drafts and separate self-completion across reload without AI',async()=>{
  let calls=0;const f=fixture(async()=>{calls++;});const s=f.session;
  const w=s.create('段考'), a=s.material().id;
  s.capture({text:'2x+3=11',image:null,feedback:'再解釋',discussionId:'discussion-a'});s.edit('attempt','兩邊減3');s.edit('completed',true);
  const b=s.addMaterial().id;s.capture({text:'分數',image:{mimeType:'image/png',data:'picture'}});s.edit('layout','conversation');
  await s.flush();const restored=createWorkspaceSession({store:f.store,request:async()=>{calls++;}});await restored.open(w.id);
  assert.equal(restored.view().current.layout,'conversation');assert.equal(restored.material().id,b);
  restored.select(a);assert.equal(restored.material().attempt,'兩邊減3');assert.equal(restored.material().completed,true);
  assert.deepEqual(restored.material().discussionIds,['discussion-a']);assert.equal(restored.material().editor.feedback,'再解釋');assert.equal(calls,0);
  await restored.flush();
});
test('late tutor replies belong to originating workspace and preserve a newly typed prompt',async()=>{
  let finish,seen;const f=fixture(p=>{seen=p;return new Promise(r=>finish=r);});const s=f.session;
  const first=s.create('A');s.capture({text:'第一題'});s.edit('prompt','先提示');const pending=s.coach('hint');
  s.edit('prompt','下一個問題');const second=s.create('B');s.capture({text:'第二題'});
  finish({coaching:{nextAction:'下一步',explanation:'說明'}});await pending;
  assert.equal(s.view().current.id,second.id);assert.equal(s.view().current.history.length,0);
  await s.open(first.id);assert.equal(s.view().current.history.length,1);assert.equal(s.view().current.prompt,'下一個問題');
  assert.equal(seen.materials[0].text,'第一題');await s.flush();
});
test('only focused image is sent, source versions track changes and progress is absent from AI evidence',async()=>{
  let payload;const f=fixture(async p=>{payload=p;return{coaching:{nextAction:'一步',explanation:'說明'}};});const s=f.session;
  s.create('章節');s.capture({text:'A',image:{data:'A',mimeType:'image/png'}});const a=s.material();s.edit('completed',true);
  s.addMaterial();s.capture({text:'B',image:{data:'B',mimeType:'image/png'}});await s.coach('overview');
  assert.equal(payload.materials.length,2);assert.equal(payload.image.data,'B');assert.equal(payload.materials[0].completed,undefined);
  assert.equal(payload.materials[0].image,undefined);const version=a.version;s.select(a.id);s.capture({text:'A changed'});assert.equal(a.version,version+1);
  assert.equal(s.view().current.history[0].sources[0].version,version);await s.flush();
});
test('failed saving or AI never reports saved mastery or discards attempts',async()=>{
  const statuses=[];const s=createWorkspaceSession({store:{list:async()=>[],put:async()=>{throw new Error('quota');}},request:async()=>{throw new Error('offline');},onStatus:v=>statuses.push(v)});
  s.create('A');s.capture({text:'題目'});s.edit('attempt','我的方法');s.edit('prompt','如何繼續');await s.coach('check');await s.flush();
  assert.equal(s.material().attempt,'我的方法');assert.equal(s.view().current.prompt,'如何繼續');assert.equal(s.view().current.history.length,0);assert.ok(statuses.some(t=>t.includes('尚未保存')));
  assert.ok(s.export().materials.length);
});
