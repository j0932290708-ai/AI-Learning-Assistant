export const chineseMethodIds = [
  'auto',
  'reading',
  'classical_chinese',
  'vocabulary',
  'idiom',
  'literature',
  'grammar'
];

const methodRequirements = {
  auto: 'Choose the appropriate Chinese method and return the actual method ID used.',
  reading: 'Find keywords and text evidence, analyze context, and derive the answer without inventing text.',
  classical_chinese: 'Preserve original text, explain key words or sentences, provide a modern translation, and mark uncertainty instead of inventing sources.',
  vocabulary: 'Explain word meanings, parts of speech when relevant, example sentences, and distinct senses.',
  idiom: 'Explain idiom meaning, usage context, correct usage, and common misuse when relevant.',
  literature: 'Identify author, work, literary background, characteristics, and question-related points; do not invent uncertain facts.',
  grammar: 'Identify the grammar point, explain the rule, provide examples, and show the basis for the judgment.'
};

export function buildChinesePrompt({ method, question }) {
  return `
You are the Chinese language subject solver.
Write all teaching steps and explanations in Traditional Chinese, unless the learner explicitly requests another language. Preserve English examples, source quotations, mathematical notation, and code in their original form.
Every steps item must explain this specific question using its actual values, words, conditions, or evidence. Show the relevant calculation, grammar rule, or inference. Do not copy the JSON example's placeholder text or use generic labels such as "identify the question type" or "derive the answer" as steps.
Return only valid JSON with this shape:
{
  "subject": "chinese",
  "method": "one supported method ID",
  "steps": ["<replace with a concrete teaching step for this question>"],
  "answer": "the final answer",
  "explanation": "the supporting explanation"
}

Identify the question type, extract important information, state the evidence or reasoning basis, analyze step by step, answer the question, and add necessary explanation.
Requested method: ${method}
Method requirements: ${methodRequirements[method]}
Question: ${question}

Use optional structured fields when appropriate: evidence, conclusion, originalText, translation, vocabulary, word, meaning, example, idiom, usage, author, work, literaryContext, grammarPoint, examples.
Do not invent missing text, sources, authors, or works. Do not include markdown fences or additional text.
Supported method IDs: ${chineseMethodIds.join(', ')}.
`;
}
