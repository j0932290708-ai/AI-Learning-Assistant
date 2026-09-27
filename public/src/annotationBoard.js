import { escapeHtml } from './api.js';
import { clamp, pointOnImage, selectionBox, translateMark, commitAnnotation, undoAnnotation, sheetForImage } from './annotationModel.js';

const uid=()=>crypto.randomUUID();
const cleanMark=m=>Object.fromEntries(Object.entries(m).filter(([k])=>['type','x','y','x2','y2','text','points'].includes(k)));
export function createAnnotationBoard(root, { current, save, request }) {
  let sheet, owner, tool='select', gesture=null, aspect=1, key='', selectedId='', draft=null, ready=false;
  const pending=new Set();
  root.innerHTML=`<h2>圖上筆記</h2><p class="small">原圖、我的筆跡、AI 建議分層保存。只圈選或書寫不會送出 AI 請求。</p>
    <div class="ink-toolbar" role="group" aria-label="圖上工具">${[['select','圈選'],['pen','手寫'],['highlight','高亮'],['ellipse','圈記'],['arrow','箭頭'],['text','文字'],['move','移動筆跡'],['pan','拖動畫面']].map(([t,l])=>`<button type="button" class="btn gray" data-ink-tool="${t}" aria-pressed="false">${l}</button>`).join('')}</div>
    <div class="ink-settings"><label>筆跡顏色<select data-ink-color aria-label="筆跡顏色"><option value="#b04735">赭紅</option><option value="#23543b">深綠</option><option value="#28558a">藍色</option></select></label><label>粗細<select data-ink-width aria-label="筆跡粗細"><option value="3">細</option><option value="6" selected>中</option><option value="10">粗</option></select></label><label class="ink-text">文字註記<input data-ink-text aria-label="文字註記" maxlength="120" placeholder="先輸入文字，再點圖片" /></label></div>
    <div class="actions"><button type="button" class="btn gray" data-ink-action="undo">撤銷</button><button type="button" class="btn gray" data-ink-action="redo">重做</button><button type="button" class="btn gray" data-ink-action="erase">移除選中筆跡</button><button type="button" class="btn gray" data-ink-action="minus" aria-label="縮小圖片">−</button><output data-ink-zoom>100%</output><button type="button" class="btn gray" data-ink-action="plus" aria-label="放大圖片">＋</button><button type="button" class="btn gray" data-ink-action="fit">適合寬度</button></div>
    <div class="ink-layers"><span>原圖：唯讀</span><label><input type="checkbox" data-ink-layer="showStudent" checked />我的筆跡（赭紅／綠／藍）</label><label><input type="checkbox" data-ink-layer="showAi" checked />AI 建議（紫色）</label></div>
    <div class="ink-viewport" tabindex="0" aria-label="圖片標註畫布"><svg class="ink-surface" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="原圖與分層筆跡"><image data-ink-original x="0" y="0" width="1000" preserveAspectRatio="none"/><g data-ink-student></g><g data-ink-ai></g><g data-ink-draft></g><g data-ink-selection></g></svg></div>
    <p class="small">圈選後可請 AI 標註。手寫／圈記時按住拖曳；文字工具點一下放置；移動筆跡只改自己的筆記。拖動畫面只平移，滾輪仍捲頁；縮放用 ＋／−。不支援壓感的滑鼠也可書寫。Esc 取消當前筆畫，Ctrl／⌘+Z 撤銷。</p>
    <label>希望 AI 標註什麼？<input data-ink-prompt aria-label="標註需求" maxlength="1000" placeholder="例如：指出這個式子的已知條件" /></label><div class="actions"><button type="button" class="btn primary" data-ink-action="ai">請 AI 標註圈選處</button><button type="button" class="btn gray" data-ink-action="clearAi">撤下 AI 標註</button></div>
    <p class="small">按「請 AI 標註」才把目前原圖、圈選範圍、我的筆跡及需求送至本站與 Google Gemini。一般解題／主導師仍讀原圖，不自動讀這些筆跡。AI 座標可能不準，請核對；可關閉或撤下，原圖不會被改寫。</p><p data-ink-status role="status" aria-live="polite"></p><p data-ink-explanation></p>`;
  const $=s=>root.querySelector(s), svg=$('svg'), viewport=$('.ink-viewport'), original=$('[data-ink-original]');
  function notify(text) {$('[data-ink-status]').textContent=text;}
  function persist() { if(sheet) save(owner); }
  function markSvg(m, ai=false) {
    const color=ai?'#7950a3':(['#b04735','#23543b','#28558a'].includes(m.color)?m.color:'#b04735'), sw=clamp(m.width||6,2,12), y=n=>n*aspect;
    const attr=`data-ink-id="${escapeHtml(m.id)}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`;
    if(m.type==='pen') return `<polyline ${attr} points="${m.points.map(p=>`${p.x},${y(p.y)}`).join(' ')}"/>`;
    if(m.type==='text') return `<text data-ink-id="${escapeHtml(m.id)}" x="${m.x}" y="${y(m.y)}" fill="${color}" font-size="25" font-family="sans-serif" dominant-baseline="hanging">${escapeHtml(m.text)}</text>`;
    if(m.type==='arrow') {const ax=m.x2-m.x,ay=y(m.y2-m.y),angle=Math.atan2(ay,ax),length=20;return `<g data-ink-id="${escapeHtml(m.id)}"><path ${attr} d="M ${m.x} ${y(m.y)} L ${m.x2} ${y(m.y2)} M ${m.x2-length*Math.cos(angle-.45)} ${y(m.y2)-length*Math.sin(angle-.45)} L ${m.x2} ${y(m.y2)} L ${m.x2-length*Math.cos(angle+.45)} ${y(m.y2)-length*Math.sin(angle+.45)}"/></g>`;}
    const b=selectionBox({x:m.x,y:m.y},{x:m.x2,y:m.y2});
    if(m.type==='highlight') return `<rect data-ink-id="${escapeHtml(m.id)}" x="${b.x}" y="${y(b.y)}" width="${b.w}" height="${y(b.h)}" fill="${ai?'#ad8ece':'#e7b742'}" fill-opacity=".3"/>`;
    return `<ellipse ${attr} cx="${b.x+b.w/2}" cy="${y(b.y+b.h/2)}" rx="${b.w/2}" ry="${y(b.h/2)}"/>`;
  }
  function paint() {
    if(!sheet) return;
    const s=sheet.state;
    $('[data-ink-student]').innerHTML=s.showStudent?s.student.filter(m=>!(gesture?.kind==='move' && m.id===selectedId)).map(m=>markSvg(m)).join(''):'';
    $('[data-ink-ai]').innerHTML=s.showAi?s.ai.map(m=>markSvg(m,true)).join(''):'';
    $('[data-ink-draft]').innerHTML=draft?markSvg(draft):'';
    const r=gesture?.kind==='select'?selectionBox(gesture.start,gesture.end):s.selection;
    $('[data-ink-selection]').innerHTML=r?`<rect x="${r.x}" y="${r.y*aspect}" width="${r.w}" height="${r.h*aspect}" fill="none" stroke="#28558a" stroke-width="3" stroke-dasharray="10 6" pointer-events="none"/>`:'';
    svg.style.width=`${s.view.zoom*100}%`;svg.style.height='auto';
    $('[data-ink-zoom]').textContent=`${Math.round(s.view.zoom*100)}%`;
    for(const b of root.querySelectorAll('[data-ink-tool]')) b.setAttribute('aria-pressed',String(b.dataset.inkTool===tool));
    svg.style.cursor=tool==='pan'?'grab':tool==='move'?'move':'crosshair';
    for(const layer of root.querySelectorAll('[data-ink-layer]')) layer.checked=s[layer.dataset.inkLayer];
    $('[data-ink-action="undo"]').disabled=!s.undo.length;
    $('[data-ink-action="redo"]').disabled=!s.redo.length;
    $('[data-ink-action="erase"]').disabled=!selectedId;
    $('[data-ink-action="ai"]').disabled=!s.selection || pending.has(sheet.id);
    $('[data-ink-action="clearAi"]').disabled=!s.ai.length;
    $('[data-ink-explanation]').textContent=s.aiExplanation ? `最近一次 AI 回覆（圖上建議可另行隱藏或撤銷）：${s.aiExplanation}` : '';
  }
  function cancel() {gesture=null;draft=null;paint();}
  function commit(layer,before,after) {try {commitAnnotation(sheet.state,layer,before,after);persist();paint();} catch(e){notify(e.message);}}
  function rememberView() {if(sheet){sheet.state.view.x=viewport.scrollLeft/Math.max(1,viewport.scrollWidth);sheet.state.view.y=viewport.scrollTop/Math.max(1,viewport.scrollHeight);persist();}}
  function restoreView() {if(sheet){viewport.scrollLeft=sheet.state.view.x*viewport.scrollWidth;viewport.scrollTop=sheet.state.view.y*viewport.scrollHeight;}}
  function sync() {
    const c=current(), m=c?.material, next=m?.image?`${c.owner.id}:${m.id}:${m.image.data}`:'';
    if(key===next) return;
    cancel();key=next;owner=c?.owner;sheet=sheetForImage(m);selectedId='';ready=false;original.removeAttribute('href');root.hidden=!sheet;
    if(!sheet) return;
    const captured=sheet;
    notify(m.annotationSheets.length>1?'此圖片版本有獨立筆記；裁切／換圖前的筆記仍隨原版本保留於匯出檔。':'圈選、書寫與拖曳都只改筆記圖層。');
    const image=new Image(); image.onload=()=>{if(sheet!==captured)return;aspect=image.naturalHeight/image.naturalWidth;svg.setAttribute('viewBox',`0 0 1000 ${1000*aspect}`);original.setAttribute('height',1000*aspect);original.setAttribute('href',image.src);ready=true;paint();requestAnimationFrame(restoreView);};
    image.onerror=()=>notify('無法載入圖片，筆記仍保留。');image.src=`data:${m.image.mimeType};base64,${m.image.data}`;
    $('[data-ink-prompt]').value=sheet.state.prompt||'';paint();
  }
  svg.addEventListener('pointerdown',e=>{
    if(!sheet || !ready || gesture || !e.isPrimary || e.button!==0)return;e.preventDefault();svg.setPointerCapture(e.pointerId);
    const p=pointOnImage(e.clientX,e.clientY,svg.getBoundingClientRect());
    if(tool==='pan'){gesture={kind:'pan',pointer:e.pointerId,x:e.clientX,y:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};return;}
    if(tool==='select'){gesture={kind:'select',pointer:e.pointerId,start:p,end:p};paint();return;}
    if(!sheet.state.showStudent){notify('請先顯示「我的筆跡」再編輯。');return;}
    if(tool==='move'){const id=e.target.closest('[data-ink-id]')?.dataset.inkId, found=sheet.state.student.find(m=>m.id===id);selectedId=found?.id||'';if(found){gesture={kind:'move',pointer:e.pointerId,start:p,original:found};draft=structuredClone(found);}paint();return;}
    const m={id:uid(),type:tool,color:$('[data-ink-color]').value,width:Number($('[data-ink-width]').value)};
    if(tool==='text'){const text=$('[data-ink-text]').value.trim();if(!text){notify('先輸入文字註記，再點圖片放置。');return;}commit('student',[],[{...m,x:p.x,y:p.y,text}]);return;}
    draft=tool==='pen'?{...m,points:[p]}:{...m,x:p.x,y:p.y,x2:p.x,y2:p.y};gesture={kind:'draw',pointer:e.pointerId};paint();
  });
  svg.addEventListener('pointermove',e=>{
    if(!gesture || gesture.pointer!==e.pointerId)return;e.preventDefault();
    if(gesture.kind==='pan'){viewport.scrollLeft=gesture.left-e.clientX+gesture.x;viewport.scrollTop=gesture.top-e.clientY+gesture.y;return;}
    const p=pointOnImage(e.clientX,e.clientY,svg.getBoundingClientRect());
    if(gesture.kind==='select')gesture.end=p;
    else if(gesture.kind==='move')draft=translateMark(gesture.original,p.x-gesture.start.x,p.y-gesture.start.y);
    else if(draft.type==='pen'){const last=draft.points.at(-1);if(Math.hypot(last.x-p.x,last.y-p.y)>.5){if(draft.points.length<512)draft.points.push(p);else notify('單筆長度已達上限，請放開後接著寫下一筆。');}}
    else {draft.x2=p.x;draft.y2=p.y;}paint();
  });
  svg.addEventListener('pointerup',e=>{
    if(!gesture || gesture.pointer!==e.pointerId)return;
    const g=gesture,m=draft;gesture=null;draft=null;
    if(g.kind==='select'){const r=selectionBox(g.start,pointOnImage(e.clientX,e.clientY,svg.getBoundingClientRect()));sheet.state.selection=r.w>=2&&r.h>=2?r:null;persist();}
    else if(g.kind==='pan')rememberView();
    else if(m){if(m.type==='pen'&&m.points.length===1)m.points.push({...m.points[0],x:clamp(m.points[0].x+.1)});commit('student',g.kind==='move'?[g.original]:[],[m]);}
    if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);paint();
  });
  svg.addEventListener('pointercancel',cancel);svg.addEventListener('lostpointercapture',()=>{if(gesture)cancel();});
  viewport.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();cancel();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();cancel();undoAnnotation(sheet.state,e.shiftKey);persist();paint();}});
  viewport.addEventListener('scroll',rememberView,{passive:true});
  root.addEventListener('change',e=>{if(e.target.dataset.inkLayer){sheet.state[e.target.dataset.inkLayer]=e.target.checked;cancel();persist();paint();}});
  $('[data-ink-prompt]').addEventListener('input',()=>{if(sheet){sheet.state.prompt=$('[data-ink-prompt]').value;persist();}});
  async function askAi() {
    const targetSheet=sheet,targetOwner=owner, s=targetSheet.state, instruction=$('[data-ink-prompt]').value.trim();
    if(!instruction){notify('請先寫下希望 AI 標註的內容。');return;}
    if(!s.selection || pending.has(targetSheet.id))return;
    const prompt=s.prompt, input={image:targetSheet.image,selection:structuredClone(s.selection),instruction,student:s.student.map(cleanMark)};
    pending.add(targetSheet.id);notify('AI 正在核對圈選位置；你可以繼續書寫。');paint();
    try {
      const result=await request(input), response=result.annotation;
      if(!response || !Array.isArray(response.marks))throw new Error('標註格式不完整');
      if(response.marks.length){commitAnnotation(s,'ai',s.ai,response.marks.map(m=>({...m,id:uid()})));s.showAi=true;}
      s.aiExplanation=response.explanation;s.lastAiRequest={selection:input.selection,instruction,student:input.student};
      if(s.prompt===prompt)s.prompt='';save(targetOwner);
      if(sheet===targetSheet){$('[data-ink-prompt]').value=s.prompt||'';notify(response.marks.length?'已加入紫色 AI 建議，請核對位置與內容。':'AI 無法確認標註位置；請依下方說明補充。');}
    } catch(e){if(sheet===targetSheet)notify(`${e.message} 筆跡與需求仍保留。`);}
    finally{pending.delete(targetSheet.id);if(sheet===targetSheet)paint();}
  }
  root.addEventListener('click',e=>{
    const t=e.target.closest('[data-ink-tool]');if(t){cancel();tool=t.dataset.inkTool;paint();return;}
    const a=e.target.closest('[data-ink-action]')?.dataset.inkAction;if(!a||!sheet)return;
    cancel();const s=sheet.state;
    if(a==='ai'){void askAi();return;}
    if(a==='undo'||a==='redo'){undoAnnotation(s,a==='redo');selectedId='';}
    if(a==='erase'){const m=s.student.find(m=>m.id===selectedId);if(m)commit('student',[m],[]);selectedId='';}
    if(a==='clearAi')commit('ai',s.ai,[]);
    if(['plus','minus','fit'].includes(a)){const cx=(viewport.scrollLeft+viewport.clientWidth/2)/Math.max(1,svg.clientWidth),cy=(viewport.scrollTop+viewport.clientHeight/2)/Math.max(1,svg.clientHeight);s.view.zoom=a==='fit'?1:clamp(s.view.zoom*(a==='plus'?1.25:.8),1,4);paint();viewport.scrollLeft=a==='fit'?0:cx*svg.clientWidth-viewport.clientWidth/2;viewport.scrollTop=a==='fit'?0:cy*svg.clientHeight-viewport.clientHeight/2;rememberView();}
    persist();paint();
  });
  return {sync};
}
