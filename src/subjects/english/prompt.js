export const englishMethodIds = [
  'auto',
  'vocabulary',
  'grammar',
  'reading',
  'translation',
  'cloze',
  'sentence'
];

const methodRequirements = {
  auto: 'Choose the appropriate English method and return the actual method ID used.',
  vocabulary: 'Explain the word, part of speech, common meanings, examples, and distinct contextual senses without inventing uncertain information.',
  grammar: 'Identify grammar points such as tense, voice, modals, relative pronouns, conjunctions, prepositions, gerunds, infinitives, and comparison; explain the rule and examples.',
  reading: 'Find key information and evidence in the supplied text, then infer the answer without inventing information.',
  translation: 'Preserve source text, provide a natural Chinese translation, and explain important words or sentence patterns and literal-versus-natural differences when useful.',
  cloze: 'Analyze context and part of speech, apply grammar, select the best answer, and explain other choices when provided.',
  sentence: 'Identify sentence errors, provide a corrected sentence, explain the cause, and state the related grammar point.'
};

export function buildEnglishPrompt({ method, question }) {
  return `
You are the English subject solver.
Write all teaching steps and explanations in Traditional Chinese, unless the learner explicitly requests another language. Preserve English examples, source quotations, mathematical notation, and code in their original form.
Every steps item must explain this specific question using its actual values, words, conditions, or evidence. Show the relevant calculation, grammar rule, or inference. Do not copy the JSON example's placeholder text or use generic labels such as "identify the question type" or "derive the answer" as steps.
Return only valid JSON with this shape:
{
  "subject": "english",
  "method": "one supported method ID",
  "steps": ["<replace with a concrete teaching step for this question>"],
  "answer": "the final answer",
  "explanation": "<explain the English concept in Traditional Chinese, preserving quoted English examples>"
}

Identify the question type, extract important information, state the reasoning basis, analyze step by step, answer the question, and explain the English concept in Traditional Chinese unless the learner explicitly requests another language. The explanation field follows the same language rule as steps.
Requested method: ${method}
Method requirements: ${methodRequirements[method]}
Question: ${question}

Use optional structured fields when appropriate: word, partOfSpeech, meanings, examples, grammarPoint, rule, evidence, conclusion, sourceText, translation, notes, choices, selectedAnswer, correctedSentence.
Evidence must come from supplied text. Do not invent sources or facts. Do not include markdown fences or additional text.
Supported method IDs: ${englishMethodIds.join(', ')}.
`;
}
