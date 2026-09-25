const copy = value => JSON.parse(JSON.stringify(value));
const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const channel = () => ({ history: [], draft: '', attempt: '', status: '' });

export function createDiscussionSession({ request, store, onChange = () => {}, onSaveStatus = () => {}, onRestore = () => {}, onAdopt = () => {} }) {
  let current = null, selected = 'main', entries = [], notice = '', restoreSequence = 0;
  const saves = new Map(), versions = new Map(), pending = new Map(), live = new Map(), timers = new Map();
  function view() { return { record: current, selected, entries, notice, busy: Boolean(current && pending.has(`${current.id}:${selected}`)), reviewing: Boolean(current && pending.has(`${current.id}:review`)) }; }
  function emit() { onChange(view()); }
  async function refresh() {
    try { entries = (await store.list()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
    catch { notice = '本機保存目前不可用；討論仍可使用，離開前請匯出。'; }
    emit();
  }
  function save(record) {
    clearTimeout(timers.get(record.id)); timers.delete(record.id);
    record.updatedAt = new Date().toISOString();
    const snapshot = copy(record);
    const work = (saves.get(record.id) || Promise.resolve()).catch(() => {}).then(async () => {
      const version = await store.put(snapshot, versions.get(record.id) || 0);
      versions.set(record.id, version);
      entries = [{ id: record.id, question: record.question, updatedAt: snapshot.updatedAt }, ...entries.filter(e => e.id !== record.id)];
      if (current === record) { notice = '已保存於此瀏覽器。'; onSaveStatus(notice); }
    }).catch(error => { if (current === record) { notice = `尚未保存：${error.message}。請先匯出備份。`; onSaveStatus(notice); } });
    saves.set(record.id, work); return work;
  }
  function saveSoon(record) {
    if (current === record) { notice = '正在保存…'; onSaveStatus(notice); }
    clearTimeout(timers.get(record.id)); timers.set(record.id, setTimeout(() => { void save(record); }, 250));
  }
  function start(lesson, question, image, reader) {
    restoreSequence++;
    current = { id: id(), question, subject: lesson.subject || 'general', mode: lesson.mode || 'direct',
      lesson: copy(lesson), image: image ? copy(image) : null, reader: reader || null, revision: 1,
      branches: [], main: channel(), transfers: [], revisions: [], background: '', proposal: null };
    live.set(current.id, current);
    selected = 'main'; notice = '正在保存…'; void save(current).then(emit); emit(); return current.id;
  }
  function detach() { restoreSequence++; current = null; selected = 'main'; emit(); }
  async function resume(recordId) {
    const seq = ++restoreSequence;
    try {
      await saves.get(recordId);
      const record = live.get(recordId) || await store.get(recordId);
      if (seq !== restoreSequence) return;
      if (!record || !Array.isArray(record.branches) || !record.main || typeof record.question !== 'string') throw new Error('找不到可恢復的討論');
      current = record; if (!live.has(record.id)) versions.set(record.id, record.version || 0);
      live.set(record.id, record); selected = 'main'; notice = '已恢復保存的討論；沒有自動送出 AI 請求。';
      // A request cannot survive a page reload. Keep its draft for explicit retry.
      for (const chat of [record.main, ...record.branches]) chat.status = '';
      onRestore(copy(record)); emit();
    } catch (error) { notice = error.message; emit(); }
  }
  function updateReader(reader) { if (current) { current.reader = copy(reader); saveSoon(current); } }
  function open(source, reader) {
    if (!current) return;
    if (current.branches.length >= 20) { notice = '本題已開啟 20 個旁支，請續用現有旁支。'; emit(); return; }
    if (reader) current.reader = copy(reader);
    const branch = { ...channel(), id: id(), source: copy(source), revision: current.revision,
      steps: copy(current.reader?.steps || current.lesson.steps || []),
      mainContext: copy(current.main.history.slice(-4)),
      notes: current.transfers.map(t => t.text), title: source.kind === 'step' ? `第 ${source.index + 1} 步` : source.kind === 'image' ? '圖片圈選' : source.text.slice(0, 32),
      transfer: { conclusion: '', unresolved: '', evidence: '', correction: '' } };
    current.branches.push(branch); selected = branch.id;
    void save(current).then(emit); emit(); return branch.id;
  }
  function select(branchId = 'main') {
    if (current && (branchId === 'main' || current.branches.some(b => b.id === branchId))) { selected = branchId; emit(); }
  }
  function currentChannel() { return selected === 'main' ? current?.main : current?.branches.find(b => b.id === selected); }
  function edit(field, value) {
    if (!current) return;
    const chat = currentChannel();
    if (field === 'background') current.background = String(value).slice(0, 1000);
    else if (field === 'draft' || field === 'attempt') chat[field] = String(value).slice(0, field === 'draft' ? 1000 : 2000);
    else if (chat.transfer && ['conclusion', 'unresolved', 'evidence', 'correction'].includes(field)) chat.transfer[field] = String(value).slice(0, 220);
    saveSoon(current); // Do not replace the focused textarea while typing.
  }
  function payload(record, chat, followUp, action = 'chat') {
    const branch = chat !== record.main;
    return { action, channel: branch ? 'branch' : 'main', question: record.question, subject: record.subject, mode: record.mode,
      revision: branch ? chat.revision : record.revision,
      steps: branch ? chat.steps : action === 'review' ? record.lesson.steps || [] : record.reader?.steps || record.lesson.steps || [],
      ...(branch ? { source: chat.source } : {}), ...(record.image ? { image: record.image } : {}),
      followUp, history: copy(chat.history), mainContext: branch ? chat.mainContext : [],
      notes: branch ? chat.notes : record.transfers.map(t => t.text), background: record.background, draft: chat.attempt };
  }
  async function ask(text) {
    if (!current) return;
    const record = current, chat = currentChannel(), key = `${record.id}:${selected}`;
    if (pending.has(key)) return;
    const question = String(text ?? chat.draft).trim();
    if (!question || question.length > 1000) { chat.status = '請輸入 1–1000 字的問題。'; emit(); return; }
    if (chat.history.length >= 30) { chat.status = '此對話已保留 30 次問答。請匯出後開啟新的旁支，舊內容仍保留。'; emit(); return; }
    const controller = new AbortController(); pending.set(key, controller); chat.draft = question; chat.status = '正在整理說明…'; emit();
    void save(record);
    try {
      const response = await request(payload(record, chat, question), { signal: controller.signal });
      if (!response.reply?.trim()) throw new Error('回應不完整');
      chat.history.push({ question, reply: response.reply }); if (chat.draft === question) chat.draft = ''; chat.status = '說明已更新；這不代表已判定你掌握此概念。';
    } catch (error) { chat.status = `${error.message}。原有內容已保留，可重試。`; }
    finally { pending.delete(key); await save(record); emit(); }
  }
  function transfer() {
    const branch = currentChannel(); if (!current || branch === current.main) return;
    if (current.transfers.length >= 20) { notice = '已保存 20 筆帶回筆記，請先匯出並整理。'; emit(); return; }
    const labels = { conclusion: '結論', unresolved: '未釐清', evidence: '我的嘗試／證據', correction: '修正理由／影響' };
    const text = Object.entries(labels).filter(([key]) => branch.transfer[key].trim()).map(([key, label]) => `${label}：${branch.transfer[key].trim()}`).join('\n');
    if (!text) { branch.status = '請先填寫要帶回的內容，可以只帶回仍未釐清的問題。'; emit(); return; }
    current.transfers.push({ id: id(), branchId: branch.id, fromRevision: branch.revision, toRevision: current.revision, text, needsReview: Boolean(branch.transfer.correction.trim()) });
    selected = 'main'; current.proposal = null;
    current.main.status = '已帶回選定筆記，尚未更改主解法。可以接著問主線，或檢查修正建議。';
    void save(current).then(emit); emit();
  }
  async function review() {
    if (!current || !current.transfers.length) return;
    const record = current, revision = record.revision, notesVersion = JSON.stringify(record.transfers), key = `${record.id}:review`;
    if (pending.has(key)) return;
    const controller = new AbortController(); pending.set(key, controller); record.main.status = '正在核對原題與帶回筆記…'; emit();
    try {
      const response = await request(payload(record, record.main, '請核對帶回的筆記與原題，提出一致的主解法修訂；不正確的修正建議請指出。', 'review'), { signal: controller.signal });
      if (!response.proposal?.steps?.length || !response.proposal.answer) throw new Error('修訂內容不完整');
      if (record.revision === revision && JSON.stringify(record.transfers) === notesVersion) { record.proposal = { ...response.proposal, baseRevision: revision }; record.main.status = '修訂提案已準備好，閱讀後自行決定是否採用。'; }
      else record.main.status = '檢查期間筆記或解法已更新，未套用舊提案，請重新檢查。';
    } catch (error) { record.main.status = `${error.message}。原解法未變更，可重試。`; }
    finally { pending.delete(key); await save(record); emit(); }
  }
  function adopt() {
    if (!current?.proposal || current.proposal.baseRevision !== current.revision) return;
    const p = current.proposal;
    current.revisions.push({ number: current.revision, lesson: current.lesson, reader: current.reader, main: current.main, reason: p.reason, affected: p.affected });
    current.lesson = { subject: current.subject, method: current.lesson.method, mode: 'direct', steps: p.steps, answer: p.answer, explanation: p.explanation };
    current.mode = 'direct'; current.revision++; current.main = channel(); current.proposal = null;
    current.reader = null;
    onAdopt(copy(current)); void save(current).then(emit); emit();
  }
  return { view, refresh, start, detach, resume, open, select, edit, ask, transfer, review, adopt, updateReader,
    export: () => current ? JSON.stringify({ format: 'ai-learning-discussion', version: 1, record: current }, null, 2) : '',
    flush: async () => { for (const recordId of timers.keys()) { void save(live.get(recordId)); } await Promise.all([...saves.values()]); },
    dismissProposal() { if (current) { current.proposal = null; void save(current); emit(); } } };
}
