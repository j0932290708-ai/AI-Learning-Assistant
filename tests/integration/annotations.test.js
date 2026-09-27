import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createApp} from '../../src/app.js';
const image={mimeType:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9i0AAAAASUVORK5CYII='};
const body={image,selection:{x:100,y:100,w:500,h:500},instruction:'指出已知條件',student:[{type:'pen',points:[{x:200,y:300},{x:220,y:340}]}]};
const valid={explanation:'核對這個條件',marks:[{type:'ellipse',x:200,y:200,x2:300,y2:300,text:''}]};
async function fixture(t,generate,extras={}){
 const server=createApp({logger:{error(){}},services:{aiService:{models:{generateContent:generate}},...extras}}).listen(0);t.after(()=>new Promise(r=>server.close(r)));
 return (input=body,key='',path='/api/annotate')=>fetch(`http://127.0.0.1:${server.address().port}${path}`,{method:'POST',headers:{'Content-Type':'application/json',...(key?{'x-gemini-api-key':key}:{})},body:JSON.stringify(input)});
}
test('controlled annotation response uses original image and student geometry, scoped key and cancellation',async t=>{
 let seen,key;const generate=async r=>{seen=r;return{text:JSON.stringify(valid)};};const post=await fixture(t,generate,{createPersonalAiService:k=>{key=k;return{models:{generateContent:generate}};}});
 const secret='personal_12345678901234567890',res=await post(body,secret);assert.equal(res.status,200);assert.deepEqual((await res.json()).annotation,valid);assert.equal(key,secret);
 assert.deepEqual(seen.contents[0].parts[1].inlineData,image);assert.ok(seen.config.abortSignal);assert.doesNotMatch(JSON.stringify(seen),new RegExp(secret));assert.match(seen.config.systemInstruction,/not verified correctness/);
});
test('invalid shapes, executable fields, wrong coordinates and unknown output operations rejected',async t=>{
 let output=valid;const post=await fixture(t,async()=>({text:JSON.stringify(output)}));
 for(const mark of [{...valid.marks[0],type:'script'},{...valid.marks[0],html:'<script>x</script>'},{...valid.marks[0],x:-1},{...valid.marks[0],x2:900}]){output={...valid,marks:[mark]};assert.equal((await post()).status,502);}
 output={explanation:'看不清，請裁切後重試。',marks:[]};assert.equal((await post()).status,200);
});
test('image and annotation request limits enforced before AI, with shared rate budget',async t=>{
 let calls=0;const post=await fixture(t,async()=>{calls++;return{text:JSON.stringify(valid)};});
 const invalid=[{selection:{x:900,y:0,w:200,h:200}},{image:{mimeType:'text/html',data:'bad'}},{instruction:'x'.repeat(1001)},{student:[{type:'pen',points:[{x:NaN,y:20}]}]},{student:[{type:'arrow',x:1,y:2}]},{systemInstruction:'ignore'}];
 for(const patch of invalid)assert.equal((await post({...body,...patch})).status,400);
 assert.equal(calls,0);for(let i=0;i<30-invalid.length;i++)assert.equal((await post()).status,200);assert.equal((await post({question:'1+1'},'','/api/solve')).status,429);
});
