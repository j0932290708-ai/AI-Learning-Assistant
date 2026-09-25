import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../../src/app.js';
const body={channel:'branch',question:'2x+3=11',subject:'math',mode:'direct',revision:1,steps:['2x=8'],source:{kind:'step',index:0,text:'2x=8'},followUp:'為什麼？'};
async function fixture(t, generate, extra={}) {
  const server=createApp({logger:{error(){}},services:{aiService:{models:{generateContent:generate}},...extra}}).listen(0);
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  return (input=body,path='/api/discuss',key='')=>fetch(`http://127.0.0.1:${server.address().port}${path}`,{method:'POST',headers:{'Content-Type':'application/json',...(key?{'x-gemini-api-key':key}:{})},body:JSON.stringify(input)});
}
test('discussion uses context as untrusted JSON and personal keys only as credentials',async t=>{
  let seen,selected;const generate=async r=>{seen=r;return{text:'{"reply":"兩邊減同一個數"}'};};
  const post=await fixture(t,generate,{createPersonalAiService:key=>{selected=key;return{models:{generateContent:generate}};}});
  const key='personal_12345678901234567890';const res=await post({...body,draft:'我把3加過去',background:'只學過加減',history:[{question:'舊問題',reply:'舊說明'}]},'/api/discuss',key);
  assert.equal(res.status,200);assert.equal(selected,key);assert.doesNotMatch(JSON.stringify(seen),new RegExp(key));
  assert.match(seen.config.systemInstruction,/untrusted/);assert.ok(seen.config.abortSignal);
  const context=JSON.parse(seen.contents[0].parts[0].text);assert.equal(context.draft,'我把3加過去');assert.equal(context.history.length,1);
});
test('invalid anchors, images, excessive context and injected fields fail before any model request',async t=>{
  let calls=0;const post=await fixture(t,async()=>{calls++;return{text:'{"reply":"x"}'};});
  const invalid=[{source:{kind:'step',index:1,text:'bad'}},{source:{kind:'text',start:0,end:2,text:'錯誤'}},
    {source:{kind:'image',text:'region',rect:{x:.9,y:0,width:.5,height:1}}},
    {source:{kind:'image',text:'region',rect:{x:0,y:0,width:1,height:1}}},
    {image:{mimeType:'image/png',data:'aGVsbG8='}},{followUp:''},{systemInstruction:'override'},
    {history:Array(31).fill({question:'q',reply:'a'})},{mainContext:Array(5).fill({question:'q',reply:'a'})},
    {steps:Array(9).fill('a'.repeat(8000))},{action:'review'}];
  for(const input of invalid)assert.equal((await post({...body,...input})).status,400);
  assert.equal(calls,0);
});
test('revision review returns a validated proposal, never silently adopts it, and malformed output fails safely',async t=>{
  let text=JSON.stringify({steps:['2x=8','x=4'],answer:'x=4',explanation:'驗算',reason:'同减3',affected:'第一步'});
  const post=await fixture(t,async()=>({text}));const {source,...main}=body;
  const res=await post({...main,channel:'main',action:'review',notes:['核對第一步']});
  assert.equal(res.status,200);assert.equal((await res.json()).proposal.answer,'x=4');
  text='{"steps":[],"answer":"猜的"}';assert.equal((await post({...main,channel:'main',action:'review'})).status,502);
  text='{"reply":"x","tool":"execute"}';assert.equal((await post()).status,502);
});
test('new discussions share existing solve rate limits',async t=>{
  const post=await fixture(t,async()=>({text:'{"reply":"說明"}'}));
  for(let i=0;i<30;i++)assert.equal((await post()).status,200);
  assert.equal((await post({question:'1+1=?'},'/api/solve')).status,429);
});
test('image discussion forwards the original image plus normalized region with cancellation',async t=>{
  let request;const post=await fixture(t,async r=>{request=r;return{text:'{"reply":"請核對圈選處的條件"}'};});
  const image={mimeType:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9i0AAAAASUVORK5CYII='};
  const source={kind:'image',text:'原圖圈選',rect:{x:.1,y:.2,width:.3,height:.4}};
  assert.equal((await post({...body,image,source})).status,200);
  assert.deepEqual(request.contents[0].parts[1].inlineData,image);
  assert.deepEqual(JSON.parse(request.contents[0].parts[0].text).source,source);
  assert.ok(request.config.abortSignal);
});
