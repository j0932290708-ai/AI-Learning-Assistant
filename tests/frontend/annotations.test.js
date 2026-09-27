import assert from 'node:assert/strict';
import {test} from 'node:test';
import {pointOnImage,selectionBox,translateMark,emptyAnnotations,commitAnnotation,undoAnnotation,sheetForImage} from '../../public/src/annotationModel.js';
import {createWorkspaceSession} from '../../public/src/workspaceSession.js';
test('image coordinates survive viewport scale and scroll; marks stay within original bounds',()=>{
  assert.deepEqual(pointOnImage(150,300,{left:50,top:100,width:400,height:800}),{x:250,y:250});
  assert.deepEqual(pointOnImage(200,400,{left:0,top:0,width:800,height:1600}),{x:250,y:250});
  assert.deepEqual(selectionBox({x:600,y:500},{x:200,y:100}),{x:200,y:100,w:400,h:400});
  assert.deepEqual(translateMark({type:'arrow',x:200,y:200,x2:900,y2:800},500,-500),{type:'arrow',x:300,y:0,x2:1000,y2:600});
  assert.deepEqual(translateMark({points:[{x:10,y:30},{x:20,y:50}]},-100,980).points,[{x:0,y:980},{x:10,y:1000}]);
});
test('undo/redo and AI removal keep immutable image and separate student marks',()=>{
  const state=emptyAnnotations(),pen={id:'pen',type:'pen',points:[{x:1,y:2},{x:3,y:4}]}, ai={id:'ai',type:'text',x:4,y:5,text:'核對'};
  commitAnnotation(state,'student',[],[pen]);commitAnnotation(state,'ai',[],[ai]);
  commitAnnotation(state,'ai',state.ai,[]);assert.equal(state.student.length,1);assert.equal(state.ai.length,0);
  undoAnnotation(state);assert.deepEqual(state.ai,[ai]);undoAnnotation(state);assert.equal(state.ai.length,0);assert.deepEqual(state.student,[pen]);
  undoAnnotation(state,true);assert.deepEqual(state.ai,[ai]);
  commitAnnotation(state,'student',[pen],[translateMark(pen,100,100)]);assert.equal(state.redo.length,0);undoAnnotation(state);assert.deepEqual(state.student,[pen]);
});
test('replacement and crop get independent layers; returning to identical original restores ink',()=>{
  const m={image:{mimeType:'image/png',data:'ORIGINAL'}}, a=sheetForImage(m);commitAnnotation(a.state,'student',[],[{id:'p',type:'text',x:1,y:2,text:'保留'}]);
  m.image={mimeType:'image/png',data:'CROP'};const b=sheetForImage(m);assert.notEqual(a.id,b.id);assert.equal(b.state.student.length,0);
  m.image={mimeType:'image/png',data:'ORIGINAL'};assert.equal(sheetForImage(m).id,a.id);assert.equal(sheetForImage(m).state.student[0].text,'保留');
  m.image=null;assert.equal(sheetForImage(m),null);assert.equal(m.annotationSheets.length,2);
});
test('late annotation save is scoped to origin material and survives workspace reload',async()=>{
  const data=new Map(),store={put:async(w,v)=>{data.set(w.id,structuredClone({...w,version:v+1}));return v+1;},get:async id=>structuredClone(data.get(id)),list:async()=>[]};
  const s=createWorkspaceSession({store,request:async()=>{throw new Error('must not call AI on drawing');}}),a=s.create('A');s.capture({image:{mimeType:'image/png',data:'A'}});const sheet=sheetForImage(s.material());
  s.saveAnnotations(a);const b=s.create('B');s.capture({text:'B'});commitAnnotation(sheet.state,'ai',[],[{id:'late',type:'text',x:2,y:3,text:'A only'}]);s.saveAnnotations(a);await s.flush();
  assert.equal(s.view().current.id,b.id);assert.equal(s.material().annotationSheets,undefined);
  const restored=createWorkspaceSession({store});await restored.open(a.id);assert.equal(sheetForImage(restored.material()).state.ai[0].text,'A only');await restored.flush();
});
test('stroke budget failure leaves original layer and undo state unchanged',()=>{
  const s=emptyAnnotations();s.student=Array.from({length:200},(_,i)=>({id:String(i),type:'text',x:1,y:2,text:'x'}));
  assert.throws(()=>commitAnnotation(s,'student',[],[{id:'too-many'}]),/上限/);assert.equal(s.student.length,200);assert.equal(s.undo.length,0);
});
