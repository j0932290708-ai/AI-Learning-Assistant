import { escapeHtml } from './api.js';
import { formatStudyText } from './richText.js';
import { createDiscussionSession } from './discussionSession.js';
import { createDiscussionStore } from './discussionStore.js';

export function createDiscussionPanel(root, request, options = {}) {
  const btn = (action, label, disabled = false, value = '') => `<button type="button" class="btn gray" data-discussion-action="${action}" data-value="${escapeHtml(value)}" ${disabled ? 'disabled' : ''}>${escapeHtml(label)}</button>`;
  const field = (name, label, value, max = 1000) => `<label for="discussion-${name}">${label}</label><textarea id="discussion-${name}" data-discussion-field="${name}" maxlength="${max}">${escapeHtml(value || '')}</textarea>`;
  const chatMarkup = chat => chat.history.map(t => `<div class="learner-turn"><strong>你的提問</strong>${formatStudyText(t.question)}</div><div class="tutor-turn"><strong>AI 說明</strong>${formatStudyText(t.reply)}</div>`).join('');
  const imageMarkup = (image, rect) => {
    if (!image || !/^image\/(png|jpeg|webp)$/.test(image.mimeType) || !/^[A-Za-z0-9+/]*={0,2}$/.test(image.data)) return '';
    return `<div class="discussion-image"><img alt="此討論保存的原材料${rect ? '，黃框為旁支位置' : ''}" src="data:${image.mimeType};base64,${image.data}" />${rect ? `<span class="discussion-region" style="left:${Number(rect.x) * 100}%;top:${Number(rect.y) * 100}%;width:${Number(rect.width) * 100}%;height:${Number(rect.height) * 100}%"></span>` : ''}</div>`;
  };
  let renderedKey = '';
  function render({ record: r, selected, entries, notice, busy, reviewing }) {
    const key = `${r?.id || ''}:${selected}`, sameView = key === renderedKey;
    const focused = root.ownerDocument?.activeElement;
    const caret = sameView && root.contains?.(focused) && focused?.tagName === 'TEXTAREA'
      ? { id: focused.id, start: focused.selectionStart, end: focused.selectionEnd } : null;
    const opened = sameView ? [...(root.querySelectorAll?.('details[open]') || [])].map(d => d.querySelector('summary')?.textContent) : [];
    const savedChoice = root.querySelector?.('#discussion-saved')?.value;
    renderedKey = key;
    const branch = r?.branches.find(b => b.id === selected), chat = branch || r?.main;
    root.innerHTML = `<h2>🌿 主線與旁支討論</h2><p class="small">旁支只在你按「開啟旁支」時建立。題目、原圖與對話自動存在此瀏覽器，清除網站資料會遺失；匯出可保留可閱讀的 JSON 紀錄。此處不更新長期個人知識，也不判定是否學會。</p>
      <label for="discussion-saved">接續已保存的討論</label><div class="actions"><select id="discussion-saved"><option value="">選擇題目…</option>${entries.map(e => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.question.slice(0, 65))}</option>`).join('')}</select>${btn('resume', '開啟已保存討論')}</div>
      <p id="discussion-save-status" role="status">${escapeHtml(notice)}</p>
      ${!r ? '<p>先解一道題，再從題目文字、圖片位置或解題步驟開啟旁支。</p>' : `
      <div class="discussion-heading"><h3 id="discussion-title" tabindex="-1">${branch ? `旁支：${escapeHtml(branch.title)}` : `主線討論 · 解法第 ${r.revision} 版`}</h3>${btn('export', '匯出此題討論')}</div>
      <p class="small">${escapeHtml(r.question)}</p>
      <nav class="actions" aria-label="討論切換">${btn('main', branch ? '返回主線（保留旁支）' : '目前主線')}${r.branches.map(b => btn('branch', `${b.title} · ${b.history.length} 則`, false, b.id)).join('')}</nav>
      ${branch ? `<div class="discussion-anchor"><strong>綁定解法第 ${branch.revision} 版${branch.revision !== r.revision ? '（歷史版本，主解法已更新）' : ''}</strong><p>${escapeHtml(branch.source.kind === 'step' ? `第 ${branch.source.index + 1} 步` : branch.source.kind === 'text' ? `原題字元 ${branch.source.start + 1}–${branch.source.end}` : '原圖框選位置')}</p>${formatStudyText(branch.source.text)}${branch.source.kind === 'image' ? imageMarkup(r.image, branch.source.rect) : ''}</div><p class="small">此旁支帶入原題、選定位置、開啟時已展開步驟、最近最多 4 輪主線對話及已帶回筆記；不帶入其他旁支逐字稿。</p>` : `
      <details><summary>從原材料開啟旁支</summary><label for="discussion-material">選取要深入討論的題目文字</label><textarea id="discussion-material" readonly>${escapeHtml(r.question)}</textarea>${btn('text', '以選取文字開啟旁支')}${r.image ? imageMarkup(r.image) + btn('image', '圈選原圖開啟旁支') : ''}<p class="small">只選取文字或框選圖片不會送出 AI 請求；開啟旁支後還可補充問題。</p></details>
      ${r.transfers.length ? `<div class="discussion-notes"><h4>主線參考筆記（解法版本以修正紀錄為準）</h4>${r.transfers.map(t => `<p><strong>旁支第 ${t.fromRevision} 版 → 主線第 ${t.toRevision} 版</strong>${formatStudyText(t.text)}</p>`).join('')}${btn('review', reviewing ? '正在檢查…' : '檢查筆記並提出修正版', reviewing)}<p class="small">檢查會產生完整修訂提案；採用後才取代主解法。</p></div>` : ''}
      ${r.proposal ? `<div class="discussion-proposal"><h4>修訂提案 · 尚未採用</h4><strong>核對理由</strong>${formatStudyText(r.proposal.reason)}<strong>影響範圍</strong>${formatStudyText(r.proposal.affected)}<ol>${r.proposal.steps.map(s => `<li>${formatStudyText(s)}</li>`).join('')}</ol><strong>答案</strong>${formatStudyText(r.proposal.answer)}${btn('adopt', '採用修正版，保留舊版紀錄')}${btn('dismiss', '保留原解法')}</div>` : ''}
      ${r.revisions.length ? `<details><summary>舊解法與修正紀錄（已被取代）</summary>${r.revisions.map(v => `<section><h4>第 ${v.number} 版 · 已被取代</h4><p>原因：${escapeHtml(v.reason)}</p><p>影響：${escapeHtml(v.affected)}</p>${formatStudyText((v.lesson.steps || []).join('\n'))}<p>舊答案：${escapeHtml(v.lesson.answer)}</p>${chatMarkup(v.main)}</section>`).join('')}</details>` : ''}`}
      <details><summary>補充已學方法與草稿（選填）</summary>${field('background', '本題已學方法／相關背景（自述）', r.background)}${field('attempt', branch ? '此旁支的嘗試／草稿' : '主線的嘗試／草稿', chat.attempt, 2000)}</details>
      <div class="discussion-conversation">${chatMarkup(chat)}</div>
      ${field('draft', branch ? '在這個旁支繼續問' : '接著問主線', chat.draft)}${btn('ask', busy ? 'AI 回覆中…' : '送出問題', busy)}
      <p role="status">${escapeHtml(chat.status)}</p><p class="small">按送出／檢查時，原題、必要原圖、此對話與上述背景會送至本站及 Google Gemini。返回或切換不會送出請求。</p>
      ${branch ? `<details class="discussion-transfer"><summary>選擇要帶回主線的內容</summary><p>自行填寫或從上方複製需要的片段；未填寫的內容不會自動帶回。</p>${field('conclusion', '重要結論', branch.transfer.conclusion, 220)}${field('unresolved', '仍未釐清的問題', branch.transfer.unresolved, 220)}${field('evidence', '我的嘗試／證據', branch.transfer.evidence, 220)}${field('correction', '需要修正的地方、理由與影響範圍', branch.transfer.correction, 220)}${btn('transfer', '只帶回以上內容')}</details>` : ''}`}`;
    for (const detail of root.querySelectorAll?.('details') || []) if (opened.includes(detail.querySelector('summary')?.textContent)) detail.open = true;
    if (savedChoice) { const select = root.querySelector?.('#discussion-saved'); if (select) select.value = savedChoice; }
    if (caret) { const input = root.ownerDocument.getElementById(caret.id); if (input) { input.focus({ preventScroll: true }); input.setSelectionRange(caret.start, caret.end); } }
  }
  const session = createDiscussionSession({ request, store: options.store || createDiscussionStore(), onChange: render,
    onSaveStatus(message) { const status = root.querySelector?.('#discussion-save-status'); if (status) status.textContent = message; },
    onRestore: options.onRestore, onAdopt: options.onAdopt });
  root.addEventListener('input', event => {
    const fieldName = event.target.dataset?.discussionField;
    if (fieldName) session.edit(fieldName, event.target.value);
  });
  root.addEventListener('click', event => {
    const button = event.target.closest?.('[data-discussion-action]'); if (!button) return;
    const action = button.dataset.discussionAction;
    if (action === 'ask') void session.ask();
    else if (action === 'main') { const branch = session.view().record?.branches.find(b => b.id === session.view().selected); session.select(); options.onReturn?.(branch?.source); }
    else if (action === 'branch') session.select(button.dataset.value);
    else if (action === 'resume') { const value = root.querySelector('#discussion-saved').value; if (value) void session.resume(value); }
    else if (action === 'text') {
      const input = root.querySelector('#discussion-material');
      if (input.selectionEnd > input.selectionStart) session.open({ kind: 'text', start: input.selectionStart, end: input.selectionEnd, text: input.value.slice(input.selectionStart, input.selectionEnd) }, options.getReader?.());
      else { root.querySelector('#discussion-save-status').textContent = '請先在原題文字框中選取一段文字。'; }
    } else if (action === 'image') options.onSelectImage?.(session.view().record);
    else if (action === 'transfer') session.transfer();
    else if (action === 'review') void session.review();
    else if (action === 'adopt') session.adopt();
    else if (action === 'dismiss') session.dismissProposal();
    else if (action === 'export') {
      const blob = new Blob([session.export()], { type: 'application/json' }), url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = '學習討論紀錄.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  });
  void session.refresh();
  return session;
}

