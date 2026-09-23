import { escapeHtml } from './api.js';
import { formatStudyText } from './richText.js';

// One in-memory discussion per solved problem; never persisted with credentials.
export function createStepTutor(root, request) {
  let lesson = null, visible = 1, history = [], drafts = {}, pending = null, status = '';
  const button = (action, label, index = '', disabled = false) => `<button type="button" class="btn gray" data-step-action="${action}" data-step="${index}" ${disabled ? 'disabled' : ''}>${label}</button>`;
  function render() {
    root.hidden = !lesson;
    if (!lesson) { root.innerHTML = ''; return; }
    const busy = Boolean(pending);
    root.innerHTML = `<div class="step-tutor">
      <div class="step-heading"><h3>一步一步看懂</h3><span>已展開 ${visible} / ${lesson.steps.length} 步</span></div>
      <p class="small">先看一小步，有疑問就問這一步。對話只保留在本次題目，換題或重新解題會清除。</p>
      ${lesson.steps.slice(0, visible).map((text, i) => `<section class="study-step" aria-labelledby="study-step-title-${i}">
        <h4 id="study-step-title-${i}" tabindex="-1">第 ${i + 1} 步</h4>
        <div class="step-content">${formatStudyText(text)}</div>
        <div class="actions">${button('why', '為什麼這樣做？', i, busy)}${button('simplify', '看不懂，換個方式說', i, busy)}</div>
        <div class="step-conversation">${history.filter(turn => turn.step === i).map(turn => `<div class="learner-turn"><strong>你的追問</strong><div>${formatStudyText(turn.question)}</div></div><div class="tutor-turn"><strong>這一步的說明</strong><div>${formatStudyText(turn.reply)}</div></div>`).join('')}</div>
        <label for="step-question-${i}">追問第 ${i + 1} 步</label>
        <textarea id="step-question-${i}" data-step-draft="${i}" maxlength="1000" placeholder="例如：為什麼兩邊都要減 3？" ${busy ? 'disabled' : ''}>${escapeHtml(drafts[i] || '')}</textarea>
        ${button('ask', '送出這一步的問題', i, busy)}
      </section>`).join('')}
      <p class="step-status" role="status">${escapeHtml(status)}</p>
      <div class="actions">${visible < lesson.steps.length ? button('next', '下一步 →', '', busy) + button('all', '查看完整解答', '', busy) : ''}</div>
      ${visible === lesson.steps.length ? `<div class="step-summary">${lesson.summary}</div>` : '<p class="small">最終答案會在最後一步顯示，也可以直接查看完整解答。</p>'}
    </div>`;
  }
  function reset() {
    pending?.abort(); pending = null; lesson = null; history = []; drafts = {}; status = ''; visible = 1; render();
  }
  function mount(data, question, summary) {
    reset();
    if (!Array.isArray(data.steps) || !data.steps.length) return;
    lesson = { steps: [...data.steps], subject: data.subject || 'general', question, summary };
    render();
  }
  function next(all = false) {
    if (!lesson || pending) return;
    visible = all ? lesson.steps.length : Math.min(visible + 1, lesson.steps.length);
    render(); root.querySelector?.(`#study-step-title-${visible - 1}`)?.focus();
  }
  async function ask(index, text) {
    if (!lesson || pending || !Number.isInteger(index) || index < 0 || index >= visible) return;
    const followUp = String(text || '').trim();
    if (!followUp || followUp.length > 1000) { status = '請輸入 1–1000 字的追問。'; render(); return; }
    if (history.length >= 30) { status = '本題已保留 30 次追問。請先複製需要的對話，再重新解題開始新一輪。'; render(); return; }
    const activeLesson = lesson, controller = new AbortController();
    pending = controller; drafts[index] = followUp; status = `正在說明第 ${index + 1} 步…`; render();
    try {
      const data = await request({ question: lesson.question, subject: lesson.subject,
        steps: lesson.steps.slice(0, visible), step: index, followUp, history: history.map(turn => ({ ...turn })) },
      { signal: controller.signal, onStatus(message) { if (pending === controller) { status = message; render(); } } });
      if (controller.signal.aborted || lesson !== activeLesson || pending !== controller) return;
      if (typeof data.reply !== 'string' || !data.reply.trim()) throw new Error('說明不完整，請再試一次。');
      history.push({ step: index, question: followUp, reply: data.reply });
      drafts[index] = ''; status = `第 ${index + 1} 步的說明已更新，可以接著追問或看下一步。`;
    } catch (error) {
      if (controller.signal.aborted || lesson !== activeLesson || pending !== controller) return;
      status = `${error.message} 原有步驟與對話仍保留，可以重試。`;
    } finally {
      if (pending === controller) { pending = null; render(); root.querySelector?.(`#step-question-${index}`)?.focus(); }
    }
  }
  root.addEventListener('input', event => {
    const index = event.target.dataset?.stepDraft;
    if (index !== undefined) drafts[index] = event.target.value;
  });
  root.addEventListener('click', event => {
    const target = event.target.closest?.('[data-step-action]');
    if (!target) return;
    const { stepAction: action, step } = target.dataset, index = Number(step);
    if (action === 'next' || action === 'all') next(action === 'all');
    else if (action === 'why') void ask(index, '為什麼這一步要這樣做？請解釋理由。');
    else if (action === 'simplify') void ask(index, '我看不懂這一步，請換個更簡單的方式說明。');
    else if (action === 'ask') void ask(index, drafts[index]);
  });
  return { mount, reset, next, ask };
}
