const clone = v => JSON.parse(JSON.stringify(v));
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const makeMaterial = (title = '材料 1') => ({ id: uid(), title, text: '', image: null, attempt: '', completed: false, version: 1, editor: {}, discussionIds: [] });

// Workspace progress is learner-controlled; it is never a mastery score.
export function createWorkspaceSession({ store, request, onChange = () => {}, onStatus = () => {} }) {
  let current = null, entries = [], status = '', sequence = 0;
  const live = new Map(), versions = new Map(), queues = new Map(), timers = new Map(), pending = new Set();
  const view = () => ({ current, entries, status, busy: Boolean(current && pending.has(current.id)) });
  const emit = () => onChange(view());
  const notify = text => { status = text; onStatus(text); };
  function save(record) {
    clearTimeout(timers.get(record.id)); timers.delete(record.id);
    record.updatedAt = new Date().toISOString();
    entries = [{ id: record.id, name: record.name, materialCount: record.materials.length, updatedAt: record.updatedAt }, ...entries.filter(e => e.id !== record.id)];
    const snapshot = clone(record);
    const queue = (queues.get(record.id) || Promise.resolve()).catch(() => {}).then(async () => {
      const version = await store.put(snapshot, versions.get(record.id) || 0); versions.set(record.id, version);
      if (current === record) notify('已保存於此瀏覽器。');
    }).catch(error => { if (current === record) notify(`尚未保存：${error.message}。請匯出工作區備份。`); });
    queues.set(record.id, queue); return queue;
  }
  function soon() {
    if (!current) return;
    const record = current; notify('正在保存…'); clearTimeout(timers.get(record.id));
    timers.set(record.id, setTimeout(() => void save(record), 250));
  }
  function material() { return current?.materials.find(m => m.id === current.activeMaterialId); }
  async function refresh() {
    try { entries = (await store.list()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
    catch { notify('本機保存不可用；請使用匯出保留工作。'); } emit();
  }
  function create(name) {
    sequence++; const first = makeMaterial();
    current = { id: uid(), name: String(name || '未命名工作區').trim().slice(0, 80), materials: [first], activeMaterialId: first.id,
      layout: 'material', goal: '', prompt: '', history: [], updatedAt: new Date().toISOString() };
    live.set(current.id, current); void save(current); emit(); return current;
  }
  async function open(id) {
    const seq = ++sequence;
    await flush();
    try {
      const record = live.get(id) || await store.get(id);
      if (seq !== sequence) return false;
      if (!record || !Array.isArray(record.materials) || !record.materials.length) throw new Error('找不到工作區');
      if (!live.has(id)) versions.set(id, record.version || 0);
      current = record; live.set(id, record); notify('已恢復工作區，未送出 AI 請求。'); emit(); return true;
    } catch (error) { notify(error.message); emit(); return false; }
  }
  function home() { sequence++; current = null; emit(); }
  function edit(field, value) {
    if (!current) return;
    if (field === 'name') current.name = String(value).trim().slice(0, 80) || '未命名工作區';
    else if (field === 'goal' || field === 'prompt') current[field] = String(value).slice(0, 1000);
    else if (field === 'layout') current.layout = value === 'conversation' ? value : 'material';
    else if (field === 'attempt') material().attempt = String(value).slice(0, 2000);
    else if (field === 'title') material().title = String(value).slice(0, 80) || '未命名材料';
    else if (field === 'completed') material().completed = Boolean(value);
    soon();
  }
  function capture(editor) {
    const m = material(); if (!m) return;
    const image = editor.image || null, text = String(editor.text || '').slice(0, 5000);
    if (m.text !== text || JSON.stringify(m.image) !== JSON.stringify(image)) m.version++;
    m.text = text; m.image = clone(image); m.editor = clone(editor);
    if (editor.discussionId && !m.discussionIds.includes(editor.discussionId)) m.discussionIds.push(editor.discussionId);
    soon();
  }
  function addMaterial() {
    if (!current) return;
    if (current.materials.length >= 12) { notify('每區最多 12 份材料，請建立另一個工作區。'); return; }
    const m = makeMaterial(`材料 ${current.materials.length + 1}`); current.materials.push(m); current.activeMaterialId = m.id;
    void save(current); emit(); return m;
  }
  function select(id) { if (current?.materials.some(m => m.id === id)) { current.activeMaterialId = id; void save(current); emit(); return material(); } }
  function linkDiscussion(id) { if (material() && !material().discussionIds.includes(id)) { material().discussionIds.push(id); material().editor.discussionId = id; soon(); } }
  async function coach(intent = 'hint') {
    if (!current || pending.has(current.id)) return;
    const record = current, focus = material();
    const materials = record.materials.filter(m => m.text.trim() || m.image).map(m => ({ id: m.id, title: m.title, text: m.text, attempt: m.attempt, version: m.version }));
    if (!materials.length) { notify('請先輸入文字或加入圖片材料。'); return; }
    if (!materials.some(m => m.id === focus.id)) { notify('目前材料是空白的，請先加入內容或切換到其他材料。'); return; }
    if (record.history.length >= 30) { notify('本區已保留 30 次主導師問答，請匯出並開啟新工作區。'); return; }
    const draftPrompt = record.prompt, prompt = draftPrompt.trim();
    const payload = { intent, goal: record.goal, followUp: prompt, focusId: focus.id, materials,
      ...(focus.image ? { image: focus.image } : {}),
      history: record.history.slice(-8).map(t => ({ question: t.question, reply: [t.response.explanation, t.response.nextAction].join('\n') })) };
    pending.add(record.id); record.coachStatus = '主導師正在整理一個可做的下一步…'; emit(); void save(record);
    try {
      const response = await request(payload);
      if (!response.coaching?.nextAction) throw new Error('回應缺少下一步');
      record.history.push({ id: uid(), question: prompt || ({ overview: '整理內容關係', hint: '我不知道怎麼開始', example: '示範一小步', check: '檢查我的嘗試', answer: '直接說明這個問題' })[intent],
        intent, focusId: focus.id, sources: materials.map(m => ({ id: m.id, version: m.version, title: m.title })), response: response.coaching, createdAt: new Date().toISOString() });
      if (record.prompt === draftPrompt) record.prompt = '';
      record.coachStatus = '已收到下一步；閱讀或標記完成不代表已掌握。';
    } catch (error) { record.coachStatus = `${error.message}。材料與草稿仍保留，可以重試。`; }
    finally { pending.delete(record.id); await save(record); emit(); }
  }
  async function flush() { for (const id of [...timers.keys()]) void save(live.get(id)); await Promise.all([...queues.values()]); }
  return { view, refresh, create, open, home, edit, capture, addMaterial, select, material, linkDiscussion, coach, flush,
    export: () => current ? clone(current) : null };
}
