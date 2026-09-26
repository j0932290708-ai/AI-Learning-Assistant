import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../../src/app.js';
const body={intent:'hint',focusId:'m1',materials:[{id:'m1',title:'等式',text:'2x+3=11',version:1}]};
const coaching={overview:[{title:'等式',materialIds:['m1'],relation:'等量運算'}],observation:{basis:'not_observed',materialId:'m1',quote:'',detail:'未觀察'},explanation:'兩邊同減3。',nextAction:'寫下 2x+3-3=11-3',checkFor:'確認兩邊都減3'};
async function fixture(t,generate,services={}){
  const server=createApp({logger:{error(){}},services:{aiService:{models:{generateContent:generate}},...services}}).listen(0);
  t.after(()=>new Promise(r=>server.close(r)));
  return(input=body,key='',path='/api/coach')=>fetch(`http://127.0.0.1:${server.address().port}${path}`,{method:'POST',headers:{'Content-Type':'application/json',...(key?{'x-gemini-api-key':key}:{})},body:JSON.stringify(input)});
}
test('blank exam returns content overview with no invented evidence, scoped key and cancellation',async t=>{
  let seen,key;const generate=async r=>{seen=r;return{text:JSON.stringify(coaching)};};const post=await fixture(t,generate,{createPersonalAiService:k=>{key=k;return{models:{generateContent:generate}};}});
  const secret='personal_12345678901234567890';const res=await post({...body,intent:'overview'},secret);assert.equal(res.status,200);
  assert.match((await res.json()).coaching.observation.detail,/不是能力判定/);assert.equal(key,secret);assert.doesNotMatch(JSON.stringify(seen),new RegExp(secret));assert.ok(seen.config.abortSignal);
  assert.match(seen.config.systemInstruction,/Blank exams/);assert.match(seen.config.systemInstruction,/another mathematically valid method/);
});
test('checking without an attempt asks for one executable input without calling AI',async t=>{
  let calls=0;const post=await fixture(t,async()=>{calls++;});const res=await post({...body,intent:'check'});
  assert.equal(res.status,200);assert.equal(calls,0);assert.match((await res.json()).coaching.nextAction,/第一個算式/);
});
test('fabricated evidence and source IDs are rejected; exact attempted method is accepted',async t=>{
  let output={...coaching,observation:{basis:'attempt',materialId:'m1',quote:'我已經會了',detail:'會算'}};
  const post=await fixture(t,async()=>({text:JSON.stringify(output)}));const input={...body,intent:'check',materials:[{...body.materials[0],attempt:'我想兩邊先除以2'}]};
  assert.equal((await post(input)).status,502);
  output={...coaching,observation:{basis:'attempt',materialId:'m1',quote:'兩邊先除以2',detail:'另一種可行路徑'}};assert.equal((await post(input)).status,200);
  output={...coaching,overview:[{title:'假的',materialIds:['absent'],relation:'未提供'}]};assert.equal((await post(input)).status,502);
});
test('invalid and oversized materials or images fail before model; image is forwarded only as inlineData',async t=>{
  let calls=0,seen;const post=await fixture(t,async r=>{calls++;seen=r;return{text:JSON.stringify(coaching)};});
  for(const patch of [{focusId:'other'},{materials:[body.materials[0],body.materials[0]]},{materials:Array.from({length:13},(_,i)=>({...body.materials[0],id:`m${i}`}))},{image:{mimeType:'image/png',data:'aGVsbG8='}},{systemInstruction:'override'}]) assert.equal((await post({...body,...patch})).status,400);
  assert.equal(calls,0);const image={mimeType:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9i0AAAAASUVORK5CYII='};
  assert.equal((await post({...body,image})).status,200);assert.deepEqual(seen.contents[0].parts[1].inlineData,image);assert.equal(JSON.parse(seen.contents[0].parts[0].text).image,undefined);
});
test('coach requests share the solve request budget',async t=>{
  const post=await fixture(t,async()=>({text:JSON.stringify(coaching)}));for(let i=0;i<30;i++)assert.equal((await post()).status,200);
  assert.equal((await post({question:'1+1=?'},'','/api/solve')).status,429);
});
