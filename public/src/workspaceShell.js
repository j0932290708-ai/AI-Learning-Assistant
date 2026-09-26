import { escapeHtml } from './api.js';
import { formatStudyText, skeletonMarkup } from './richText.js';
import { createDiscussionStore } from './discussionStore.js';
import { createWorkspaceSession } from './workspaceSession.js';

export function createWorkspaceShell(options) {
  const $ = id => document.getElementById(id);
  const home = $('workspace-home'), toolbar = $('workspace-toolbar'), navigator = $('workspace-navigation'), coachRoot = $('workspace-coach');
  const study = $('workspace-study'), discussionStore = createDiscussionStore();
  let query = '', legacy = [], activeKey = '', navigation = 0, changing = false;
  const button = (action, text, value = '', disabled = false) => `<button type="button" class="btn gray" data-workspace-action="${action}" data-value="${escapeHtml(value)}" ${disabled ? 'disabled' : ''}>${escapeHtml(text)}</button>`;
  const field = (id, label, value, max = 1000) => `<label for="workspace-${id}">${label}</label><textarea id="workspace-${id}" data-workspace-field="${id}" maxlength="${max}">${escapeHtml(value || '')}</textarea>`;
  function renderHome(entries) {
    const search = $('workspace-search'); if (search) query = search.value;
    home.innerHTML = `<div class="home-heading"><div><p class="section-kicker">自己的學習步調</p><h1>我的學習工作區</h1><p>把材料、嘗試與討論放在一起，下次從這裡繼續。</p></div></div>
      <form id="workspace-create"><label for="workspace-new-name">新工作區名稱</label><div class="actions"><input id="workspace-new-name" maxlength="80" placeholder="例如：第一次段考檢討" required /><button class="btn primary" type="submit">＋ 建立工作區</button></div></form>
      <label for="workspace-search">搜尋工作區</label><input id="workspace-search" type="search" value="${escapeHtml(query)}" placeholder="輸入名稱" />
      <div class="workspace-grid">${entries.map(e => `<article class="workspace-tile" data-workspace-name="${escapeHtml(e.name || '')}" ${String(e.name).toLowerCase().includes(query.toLowerCase()) ? '' : 'hidden'}><span class="notebook-mark" aria-hidden="true">▤</span><h2>${escapeHtml(e.name || '未命名工作區')}</h2><p>${e.materialCount || 1} 份材料 · ${escapeHtml(new Date(e.updatedAt).toLocaleDateString('zh-TW'))}</p>${button('open', '接續學習 →', e.id)}</article>`).join('')}</div>
      <p id="workspace-empty" ${entries.some(e => String(e.name).toLowerCase().includes(query.toLowerCase())) ? 'hidden' : ''}>${entries.length ? '沒有符合名稱的工作區。' : '先建立一本工作區，再加入文字、題目或圖片。'}</p>
      ${legacy.length ? `<details class="legacy-discussions"><summary>舊版已保存討論（${legacy.length}）</summary><p>可接續到工作區，原有旁支與解法仍保留。</p>${legacy.map(e => button('legacy', e.question.slice(0, 60), e.id)).join('')}</details>` : ''}
      <p class="storage-note">工作區保存在此瀏覽器，不跨裝置同步。可匯出備份；清除網站資料會遺失。材料目前支援文字及 PNG／JPEG／WebP 圖片。</p>`;
  }
  function render({ current: w, entries, status, busy }) {
    home.hidden = Boolean(w); study.hidden = !w; toolbar.hidden = !w; navigator.hidden = !w;
    $('workspace-status').textContent = status;
    if (!w) { renderHome(entries); return; }
    document.body.dataset.learningView = w.layout;
    const m = session.material(), key = `${w.id}:${m.id}`;
    const focused = document.activeElement;
    const caret = key === activeKey && (coachRoot.contains(focused) || toolbar.contains(focused)) && ['TEXTAREA', 'INPUT'].includes(focused.tagName)
      ? { id: focused.id, start: focused.selectionStart, end: focused.selectionEnd } : null;
    const openDetails = [...coachRoot.querySelectorAll('details[open]')].map(d => d.dataset.section);
    activeKey = key;
    toolbar.innerHTML = `<div class="workspace-location">${button('home', '← 工作區')}<label class="sr-only" for="workspace-name">工作區名稱</label><input id="workspace-name" data-workspace-field="name" maxlength="80" value="${escapeHtml(w.name)}" /></div><div class="view-controls" aria-label="學習檢視"><button class="btn ${w.layout === 'material' ? 'primary' : 'gray'}" type="button" data-workspace-action="layout" data-value="material" aria-pressed="${w.layout === 'material'}">材料為主</button><button class="btn ${w.layout === 'conversation' ? 'primary' : 'gray'}" type="button" data-workspace-action="layout" data-value="conversation" aria-pressed="${w.layout === 'conversation'}">對話為主</button>${button('export', '匯出工作區')}</div>`;
    navigator.innerHTML = `<div class="material-nav-heading"><h2>材料</h2>${button('add', '＋ 新增材料')}</div><nav aria-label="工作區材料">${w.materials.map(item => `<button class="material-tab ${item.id === m.id ? 'active' : ''}" type="button" data-workspace-action="material" data-value="${escapeHtml(item.id)}" aria-current="${item.id === m.id ? 'page' : 'false'}">${escapeHtml(item.title)}<small>${item.completed ? '自己標記完成' : '進行中'}${item.image ? ' · 圖片' : ''}</small></button>`).join('')}</nav><p class="small">每區最多 12 份材料。完成標記與閱讀進度不代表已學會。</p>`;
    $('material-title').value = m.title; $('material-completed').checked = m.completed;
    const history = w.history.map((t, i) => {
      const stale = t.sources.some(s => w.materials.find(a => a.id === s.id)?.version !== s.version);
      const response = t.response;
      return `<article class="coach-turn"><h3>${escapeHtml(t.question)}</h3><p class="small">${escapeHtml(t.sources.find(s => s.id === t.focusId)?.title || '')}${stale ? ' · 材料已更新，此為先前版本的討論' : ''}</p>
        ${response.overview.length ? `<details data-section="outline-${i}" ${i === w.history.length - 1 && t.intent === 'overview' ? 'open' : ''}><summary>內容目錄與關係</summary><ol>${response.overview.map(o => `<li><strong>${escapeHtml(o.title)}</strong>${formatStudyText(o.relation)}<div class="actions">${o.materialIds.map(id => button('material', `回到 ${w.materials.find(s => s.id === id)?.title || '材料'}`, id)).join('')}</div></li>`).join('')}</ol></details>` : ''}
        <details data-section="evidence-${i}"><summary>${response.observation.basis === 'attempt' ? '本次作答依據（可核對）' : '尚未觀察作答'}</summary>${formatStudyText(response.observation.detail)}${response.observation.quote ? `<blockquote>${escapeHtml(response.observation.quote)}</blockquote>` : ''}<p class="small">這是本次討論的有限觀察，不是能力評分。</p></details>
        <div class="coach-explanation">${formatStudyText(response.explanation)}</div><div class="next-action"><span>現在可以做的一小步</span>${formatStudyText(response.nextAction)}<p class="small">怎麼核對</p>${formatStudyText(response.checkFor)}</div></article>`;
    }).join('');
    coachRoot.innerHTML = `<div class="coach-heading"><span class="section-kicker">接著做得到的一步</span><h2>主導師</h2><p class="small">看方向、問原因，或拿你的方法一起試。旁支仍由你手動開啟。</p></div>
      <details data-section="goal"><summary>這次想學什麼？（選填）</summary>${field('goal', '學習目標／已學方法（自述）', w.goal)}</details>
      <div class="coach-history">${history || '<p class="coach-empty">先放入材料。若還不會開始，按「給我起點」，先做一小步就好。</p>'}</div>
      ${busy ? skeletonMarkup('主導師正在整理下一步…') : ''}
      <div class="coach-composer">${field('attempt', '我的嘗試（目前材料）', m.attempt, 2000)}${field('prompt', '想問主導師什麼？', w.prompt)}<div class="actions">${button('coach', '整理內容關係', 'overview', busy)}${button('coach', '給我起點', 'hint', busy)}${button('coach', '示範一小步', 'example', busy)}${button('coach', '檢查我的嘗試', 'check', busy)}${button('coach', '直接說明', 'answer', busy)}</div><p class="coach-status" role="status">${escapeHtml(w.coachStatus || '')}</p><p class="small">按以上按鈕才送出：本區文字、嘗試與目前這張圖片會交給本站及 Google Gemini。其他圖片請逐份切換；空白作答不視為不會。</p></div>`;
    for (const detail of coachRoot.querySelectorAll('details')) if (openDetails.includes(detail.dataset.section)) detail.open = true;
    if (caret) { const input = $(caret.id); input?.focus({ preventScroll: true }); input?.setSelectionRange(caret.start, caret.end); }
    options.onWorkspace?.(w, m);
  }
  const session = createWorkspaceSession({ store: createDiscussionStore(undefined, 'learning-workspaces'), request: options.request, onChange: render,
    onStatus(text) { $('workspace-status').textContent = text; } });
  function capture() { if (!changing && session.view().current) session.capture(options.getEditor()); }
  async function displayMaterial(m) {
    const seq = ++navigation; changing = true;
    try { await options.setEditor(m.editor || {}, () => seq === navigation); }
    finally { if (seq === navigation) changing = false; }
  }
  async function switchMaterial(id) { capture(); await options.flush(); const m = session.select(id); if (m) await displayMaterial(m); }
  async function open(id) { capture(); await options.flush(); if (await session.open(id)) await displayMaterial(session.material()); }
  async function exportWorkspace() {
    capture(); await Promise.all([session.flush(), options.flush()]);
    const workspace = session.export(); if (!workspace) return;
    const ids = [...new Set(workspace.materials.flatMap(m => m.discussionIds))];
    const discussions = (await Promise.all(ids.map(id => discussionStore.get(id)))).filter(Boolean);
    const blob = new Blob([JSON.stringify({ format: 'ai-learning-workspace', version: 1, workspace, discussions }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `${workspace.name.replace(/[\\/:*?"<>|]/g, '_')}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('workspace-status').textContent = '已匯出可閱讀的工作區與討論紀錄；目前尚無工作區匯入入口。';
  }
  async function action(event) {
    const target = event.target.closest('[data-workspace-action]'); if (!target) return;
    const { workspaceAction: action, value } = target.dataset;
    try {
      if (action === 'open') await open(value);
      else if (action === 'home') { capture(); await Promise.all([session.flush(), options.flush()]); session.home(); await displayMaterial({ editor: {} }); }
      else if (action === 'add') { capture(); await options.flush(); const m = session.addMaterial(); if (m) await displayMaterial(m); }
      else if (action === 'material') await switchMaterial(value);
      else if (action === 'layout') { capture(); session.edit('layout', value); render(session.view()); }
      else if (action === 'coach') { capture(); await session.coach(value); }
      else if (action === 'export') await exportWorkspace();
      else if (action === 'legacy') {
        const record = await discussionStore.get(value); if (!record) throw new Error('舊討論不存在');
        // Reuse an already imported workspace rather than duplicating it.
        const workspaceStore = createDiscussionStore(undefined, 'learning-workspaces');
        for (const entry of session.view().entries) { const w = await workspaceStore.get(entry.id); if (w?.materials.some(m => m.discussionIds.includes(value))) { await open(w.id); return; } }
        session.create(record.question.slice(0, 40)); session.capture({ text: record.question, image: record.image, discussionId: value, mode: record.mode });
        await displayMaterial(session.material());
      }
    } catch (error) { $('workspace-status').textContent = `${error.message}。目前內容仍保留。`; }
  }
  document.addEventListener('click', event => { void action(event); });
  document.addEventListener('submit', event => {
    if (event.target.id !== 'workspace-create') return;
    event.preventDefault(); session.create($('workspace-new-name').value); void displayMaterial(session.material());
  });
  document.addEventListener('input', event => {
    if (event.target.id === 'workspace-search') {
      query = event.target.value; let count = 0;
      for (const tile of home.querySelectorAll('[data-workspace-name]')) { tile.hidden = !tile.dataset.workspaceName.toLowerCase().includes(query.toLowerCase()); if (!tile.hidden) count++; }
      $('workspace-empty').hidden = Boolean(count);
    }
    const field = event.target.dataset.workspaceField;
    if (field) session.edit(field, event.target.type === 'checkbox' ? event.target.checked : event.target.value);
  });
  // Draft changes are saved without re-rendering or replacing active inputs.
  study.addEventListener('input', capture);
  addEventListener('pagehide', () => { capture(); void session.flush(); });
  void discussionStore.list().then(items => { legacy = items.filter(e => !e.workspaceId); if (!session.view().current) renderHome(session.view().entries); }).catch(() => {});
  void session.refresh();
  return { capture, linkDiscussion: id => { session.linkDiscussion(id); capture(); },
    context: () => ({ workspaceId: session.view().current?.id, materialId: session.material()?.id }),
    allowedDiscussion: entry => entry.workspaceId === session.view().current?.id && entry.materialId === session.material()?.id || session.material()?.discussionIds.includes(entry.id),
    flush: () => { capture(); return session.flush(); } };
}
