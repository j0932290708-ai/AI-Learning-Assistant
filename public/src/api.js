export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function normalizeQuestion(input) {
  return String(input ?? '').trim();
}

export function questionNumber(input) {
  const text = normalizeQuestion(input).normalize('NFKC').replace(/\s+/g, '');
  const match = text.match(/^(?:(?:請問|請|幫我|幫忙|麻煩|我要問|我要|我想|我說|解答|回答|解|算|做|看|一下|照片|圖片|中的|裡的|的|這張|這|選擇|選))*(?:第)?(\d{1,8})(?:題|提)?(?:的答案|的解答|怎麼算|怎麼做)?[。.!！?？]*$/u);
  return match ? String(Number(match[1])) : null;
}

// Check the server before sending the expensive AI request. A slow health check
// can be a sleeping host or network delay; do not label model latency as startup.
export async function requestAI(endpoint, payload, { signal, onStatus = () => {},
  apiKey = '', fetchImpl = fetch, warmHintMs = 6000, startupMs = 90000, answerMs = 75000 } = {}) {
  if (!['/api/solve', '/api/recognize', '/api/step'].includes(endpoint)) throw new Error('不支援的 AI 服務網址。');
  async function stage(url, options, timeoutMs, warming) {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const hint = warming ? setTimeout(() => onStatus('伺服器可能正在熱身中，請稍候約 30–60 秒；網路較慢時也可能需要多等一下。'), warmHintMs) : null;
    try {
      const response = await fetchImpl(url, { ...options, signal: controller.signal, cache: 'no-store' });
      if (warming) {
        if (!response.ok) throw new Error('暫時無法連上伺服器，請稍後再試。');
        return;
      }
      let body;
      try { body = await response.json(); }
      catch { throw new Error('伺服器暫時沒有回傳完整資料，請稍後重試。'); }
      if (!response.ok || !body.success) throw new Error(body?.error?.message || 'AI 暫時無法回答，請稍後重試。');
      return body;
    } catch (error) {
      if (timedOut) throw new Error(warming ? '伺服器啟動等候過久，請稍後重試；題目仍保留在畫面上。' : 'AI 回答等候過久，請稍後重試。');
      if (error.name === 'TypeError') throw new Error('網路連線中斷，請確認網路後再試。');
      throw error;
    } finally {
      clearTimeout(timer); clearTimeout(hint);
      signal?.removeEventListener('abort', cancel);
    }
  }
  onStatus('正在連接學習助手…');
  await stage('/health', { method: 'GET' }, startupMs, true);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  onStatus('伺服器已連線，AI 正在整理內容，請稍候…');
  return stage(endpoint, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'x-gemini-api-key': apiKey } : {}) }, body: JSON.stringify(payload) }, answerMs, false);
}

export function exportQuestionBank() {
  return JSON.stringify({ format: 'ai-learning-bank', version: 1, exportedAt: new Date().toISOString(), entries: loadQuestionBank() }, null, 2);
}

export function importQuestionBank(text) {
  let backup;
  try { backup = JSON.parse(text); } catch { throw new Error('這不是有效的 JSON 備份檔。'); }
  if (backup?.format !== 'ai-learning-bank' || backup.version !== 1 || !Array.isArray(backup.entries) || backup.entries.length > maxBankEntries) {
    throw new Error('備份格式不相容，請使用學習助手匯出的 JSON 檔（最多 20 題）。');
  }
  const entries = backup.entries.map((entry) => {
    if (!isValidEntry(entry) || !entry.question.trim() || entry.question.length > 5000 || entry.subject.length > 100 || entry.method.length > 100
      || typeof entry.answer !== 'string' || entry.answer.length > maxSavedAnswerLength
      || (entry.createdAt !== undefined && (typeof entry.createdAt !== 'string' || entry.createdAt.length > 50 || !Number.isFinite(Date.parse(entry.createdAt))))) {
      throw new Error('備份包含無效或過長的題目，尚未匯入任何資料。');
    }
    return { question: entry.question, subject: entry.subject, method: entry.method, answer: entry.answer, ...(entry.createdAt ? { createdAt: entry.createdAt } : {}) };
  });
  const current = loadQuestionBank();
  const key = (e) => JSON.stringify([e.question, e.subject, e.method, e.answer || '']);
  const seen = new Set(current.map(key));
  const additions = entries.filter((e) => { const k = key(e); if (seen.has(k)) return false; seen.add(k); return true; });
  if (current.length + additions.length > maxBankEntries) throw new Error('合併後會超過 20 題，尚未匯入；原有題庫完整保留。');
  const merged = [...additions, ...current];
  try { localStorage.setItem(storageKey, JSON.stringify(merged)); }
  catch { throw new Error('儲存空間不足或瀏覽器禁止儲存，未完成匯入。'); }
  return { entries: merged, added: additions.length };
}

const storageKey = 'ai-learning-bank';
const corruptStorageKey = 'ai-learning-bank-corrupt';
const maxBankEntries = 20;
const maxSavedAnswerLength = 12000;

function isValidEntry(entry) {
  return entry
    && typeof entry === 'object'
    && typeof entry.question === 'string'
    && typeof entry.subject === 'string'
    && typeof entry.method === 'string';
}

export function loadQuestionBank() {
  let raw;

  try {
    raw = localStorage.getItem(storageKey);
  } catch {
    return [];
  }

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new TypeError('Question bank must be an array');
    }

    return parsed
      .filter(isValidEntry)
      .slice(0, maxBankEntries);
  } catch {
    try {
      localStorage.setItem(corruptStorageKey, raw.slice(0, 50000));
      localStorage.removeItem(storageKey);
    } catch {
      // Storage may be unavailable. Returning an empty list keeps the UI usable.
    }
    return [];
  }
}

export function saveQuestionToBank(question, subject, method, answer) {
  const current = loadQuestionBank();
  const entry = {
    question,
    subject,
    method,
    answer: String(answer ?? '').slice(0, maxSavedAnswerLength),
    createdAt: new Date().toISOString()
  };
  const next = [entry, ...current].slice(0, maxBankEntries);

  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
    return next;
  } catch (cause) {
    const error = new Error('題庫儲存空間不足，請先整理瀏覽器資料。');
    error.code = 'QUESTION_BANK_SAVE_FAILED';
    error.cause = cause;
    throw error;
  }
}
