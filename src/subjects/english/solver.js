import { buildEnglishPrompt, englishMethodIds } from './prompt.js';
import { parseAiJson } from '../parseAiJson.js';

const englishMethodSet = new Set(englishMethodIds);
const optionalFields = [
  'word',
  'partOfSpeech',
  'meanings',
  'examples',
  'grammarPoint',
  'rule',
  'evidence',
  'conclusion',
  'sourceText',
  'translation',
  'notes',
  'choices',
  'selectedAnswer',
  'correctedSentence'
];

export class EnglishSolverError extends Error {
  constructor(code, message, statusCode = 502) {
    super(message);
    this.name = 'EnglishSolverError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function validateInput({ subject, method, question }) {
  if (subject !== 'english') {
    throw new EnglishSolverError(
      'ENGLISH_SUBJECT_REQUIRED',
      'English solver only accepts subject english',
      400
    );
  }

  if (!englishMethodSet.has(method)) {
    throw new EnglishSolverError(
      'ENGLISH_METHOD_INVALID',
      'English method is not supported',
      400
    );
  }

  if (typeof question !== 'string' || !question.trim()) {
    throw new EnglishSolverError(
      'ENGLISH_QUESTION_REQUIRED',
      'Question is required',
      400
    );
  }
}

function parseResult(text, requestedMethod) {
  let result;

  try {
    result = parseAiJson(text);
  } catch {
    throw new EnglishSolverError(
      'ENGLISH_AI_INVALID_JSON',
      'English AI returned invalid JSON'
    );
  }

  const validMethod = englishMethodSet.has(result?.method);
  const validSteps = Array.isArray(result?.steps)
    && result.steps.length > 0
    && result.steps.every(
      (step) => typeof step === 'string' && step.trim()
    );
  const validAnswer = typeof result?.answer === 'string'
    && result.answer.trim();
  const validExplanation = typeof result?.explanation === 'string'
    && result.explanation.trim();
  const validOptionalFields = optionalFields.every(
    (field) => result?.[field] === undefined
      || ['string', 'object'].includes(typeof result[field])
  );

  if (
    result?.subject !== 'english'
    || !validMethod
    || (requestedMethod !== 'auto' && result.method !== requestedMethod)
    || !validSteps
    || !validAnswer
    || !validExplanation
    || !validOptionalFields
  ) {
    throw new EnglishSolverError(
      'ENGLISH_AI_INVALID_RESULT',
      'English AI returned an invalid result shape'
    );
  }

  return {
    subject: 'english',
    method: result.method,
    steps: result.steps,
    answer: result.answer,
    explanation: result.explanation,
    ...Object.fromEntries(
      optionalFields
        .filter((field) => result[field] !== undefined)
        .map((field) => [field, result[field]])
    )
  };
}

export function createEnglishSolver({ aiService }) {
  if (!aiService?.models?.generateContent) {
    throw new EnglishSolverError(
      'ENGLISH_AI_SERVICE_REQUIRED',
      'English AI service is required',
      500
    );
  }

  return {
    async solve(input) {
      validateInput(input);
      const response = await aiService.models.generateContent({
        contents: buildEnglishPrompt(input)
      });
      return parseResult(response?.text, input.method);
    }
  };
}
