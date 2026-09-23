import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../../src/app.js';

test('personal credentials are request-scoped, absent from prompts and never fall back to shared credentials', async () => {
  const seen = [], logs = [];
  const make = key => ({models:{generateContent: async request => {
    seen.push({key,request});
    if(key==='bad_key_12345678901234567890') throw Object.assign(new Error(`secret ${key}`),{status:403});
    return {text:JSON.stringify({subject:'english',method:'grammar',steps:['修正第三人稱'],answer:'She goes.',explanation:'She 是第三人稱單數，動詞加 s。'})};
  }}});
  const server = createApp({services:{aiService:make('shared'),createPersonalAiService:make},logger:{error:x=>logs.push(x)}}).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = key => fetch(base+'/api/solve',{method:'POST',headers:{'Content-Type':'application/json',...(key?{'x-gemini-api-key':key}:{})},body:JSON.stringify({question:'Correct: She go.'})});
  try {
    const key='personal_key_12345678901234567890';
    const responses = await Promise.all([post(key),post()]);
    for (const r of responses) assert.equal(r.status,200);
    assert.deepEqual(seen.map(r=>r.key).sort(),[key,'shared'].sort());
    assert.ok(seen.every(r=>!JSON.stringify(r.request).includes(key)));
    assert.ok(seen.every(r=>r.request.config.systemInstruction.includes('untrusted learner material')));
    assert.ok(seen.every(r=>r.request.contents.includes('Correct: She go.')));
    const failed=await post('bad_key_12345678901234567890');
    assert.equal(failed.status,403); const body=await failed.text();
    assert.match(body,/AI_AUTH_FAILED/); assert.doesNotMatch(body,/bad_key|secret/);
    assert.equal(seen.length,3); assert.doesNotMatch(JSON.stringify(logs),/bad_key|secret/);
    assert.equal((await post('bad key')).status,400); assert.equal(seen.length,3);
  } finally {await new Promise(resolve=>server.close(resolve));}
});

test('a personal key works without a website key and remains subject to the shared request limit', async () => {
  let calls=0;
    const server=createApp({services:{aiService:null,createPersonalAiService:()=>({models:{generateContent:async()=>{calls++;return{text:'{"subject":"general","method":"auto","steps":["請提供題目"],"answer":"需要題目內容"}'};}}})},logger:{error(){}}}).listen(0);
  try {
    const url=`http://127.0.0.1:${server.address().port}/api/solve`;
    const request={method:'POST',headers:{'Content-Type':'application/json','x-gemini-api-key':'test_only_12345678901234567890'},body:JSON.stringify({question:'請解釋題目'})};
    for(let i=0;i<30;i++) assert.equal((await fetch(url,request)).status,200);
    assert.equal((await fetch(url,request)).status,429); assert.equal(calls,30);
  }finally{await new Promise(resolve=>server.close(resolve));}
});

