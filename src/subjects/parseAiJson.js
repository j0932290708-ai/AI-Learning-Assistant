export function parseAiJson(text) {
  if (typeof text !== 'string') {
    throw new SyntaxError('AI response must be text');
  }

  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');

  return JSON.parse(cleaned);
}
