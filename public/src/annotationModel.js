const copy = v => JSON.parse(JSON.stringify(v));
export const clamp = (n, lo = 0, hi = 1000) => Math.min(hi, Math.max(lo, n));
export const pointOnImage = (x, y, rect) => ({ x: clamp((x - rect.left) / rect.width * 1000), y: clamp((y - rect.top) / rect.height * 1000) });
export function selectionBox(a, b) { return { x: Math.min(a.x,b.x), y: Math.min(a.y,b.y), w: Math.abs(a.x-b.x), h: Math.abs(a.y-b.y) }; }
export function emptyAnnotations() { return { student: [], ai: [], undo: [], redo: [], showStudent: true, showAi: true, selection: null, view: { zoom: 1, x: 0, y: 0 } }; }
export function translateMark(mark, dx, dy) {
  const points = mark.points || [{x:mark.x,y:mark.y}, {x:mark.x2 ?? mark.x,y:mark.y2 ?? mark.y}];
  dx = clamp(dx, -Math.min(...points.map(p=>p.x)), 1000-Math.max(...points.map(p=>p.x)));
  dy = clamp(dy, -Math.min(...points.map(p=>p.y)), 1000-Math.max(...points.map(p=>p.y)));
  return mark.points ? {...mark, points:mark.points.map(p=>({...p,x:p.x+dx,y:p.y+dy}))} : {...mark,x:mark.x+dx,y:mark.y+dy,...(mark.x2 === undefined ? {} : {x2:mark.x2+dx,y2:mark.y2+dy})};
}
export function commitAnnotation(state, layer, before, after) {
  if (!['student','ai'].includes(layer)) throw new Error('無效圖層');
  const ids = new Set(before.map(m=>m.id)), next = state[layer].filter(m=>!ids.has(m.id)).concat(copy(after));
  if (next.length > 200 || next.reduce((n,m)=>n+(m.points?.length || 2),0) > 6000) throw new Error('本圖筆跡已達上限，請新增材料繼續書寫。');
  state[layer] = next; state.undo.push({layer,before:copy(before),after:copy(after)}); state.undo = state.undo.slice(-50); state.redo = [];
}
export function undoAnnotation(state, redo = false) {
  const source = redo ? state.redo : state.undo, target = redo ? state.undo : state.redo, change = source.pop();
  if (!change) return false;
  const remove = redo ? change.before : change.after, add = redo ? change.after : change.before, ids = new Set(remove.map(m=>m.id));
  state[change.layer] = state[change.layer].filter(m=>!ids.has(m.id)).concat(copy(add)); target.push(change); return true;
}
// Exact image identity prevents annotations from silently moving onto a crop or replacement.
export function sheetForImage(material, create = true) {
  if (!material?.image) return null;
  material.annotationSheets ||= [];
  let sheet = material.annotationSheets.find(s=>s.image.mimeType === material.image.mimeType && s.image.data === material.image.data);
  if (!sheet && create) { sheet = { id: crypto.randomUUID(), image: copy(material.image), state: emptyAnnotations() }; material.annotationSheets.push(sheet); }
  return sheet;
}
