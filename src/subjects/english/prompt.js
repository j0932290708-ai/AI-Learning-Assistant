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
Return only valid JSON with this shape:
{
  "subject": "english",
  "method": "one supported method ID",
  "steps": ["identify the question type", "extract important English information", "derive the answer"],
  "answer": "the final answer",
  "explanation": "the English explanation"
}

Identify the question type, extract important information, state the reasoning basis, analyze step by step, answer the question, and provide necessary English explanation.
Requested method: ${method}
Method requirements: ${methodRequirements[method]}
Question: ${question}

Use optional structured fields when appropriate: word, partOfSpeech, meanings, examples, grammarPoint, rule, evidence, conclusion, sourceText, translation, notes, choices, selectedAnswer, correctedSentence.
Evidence must come from supplied text. Do not invent sources or facts. Do not include markdown fences or additional text.
Supported method IDs: ${englishMethodIds.join(', ')}.
`;
}
