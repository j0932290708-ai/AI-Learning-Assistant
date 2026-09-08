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
