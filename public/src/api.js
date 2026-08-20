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

export function saveQuestionToBank(question, subject, method, answer) {
  const storageKey = 'ai-learning-bank';
  const current = JSON.parse(localStorage.getItem(storageKey) || '[]');
  const entry = {
    question,
    subject,
    method,
    answer,
    createdAt: new Date().toISOString()
  };
  const next = [entry, ...current].slice(0, 20);
  localStorage.setItem(storageKey, JSON.stringify(next));
  return next;
}

export function loadQuestionBank() {
  try {
    return JSON.parse(localStorage.getItem('ai-learning-bank') || '[]');
  } catch {
    return [];
  }
}
