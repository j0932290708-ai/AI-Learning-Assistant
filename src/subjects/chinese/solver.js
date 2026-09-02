import { buildChinesePrompt, chineseMethodIds } from './prompt.js';

const chineseMethodSet = new Set(chineseMethodIds);
const optionalFields = [
  'evidence',
  'conclusion',
  'originalText',
  'translation',
  'vocabulary',
  'word',
  'meaning',
  'example',
  'idiom',
  'usage',
  'author',
  'work',
  'literaryContext',
  'grammarPoint',
  'examples'
];

export class ChineseSolverError extends Error {
  constructor(code, message, statusCode = 502) {
    super(message);
    this.name = 'ChineseSolverError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function validateInput({ subject, method, question }) {
  if (subject !== 'chinese') {
    throw new ChineseSolverError(
      'CHINESE_SUBJECT_REQUIRED',
      'Chinese solver only accepts subject chinese',
      400
    );
  }

  if (!chineseMethodSet.has(method)) {
    throw new ChineseSolverError(
      'CHINESE_METHOD_INVALID',
      'Chinese method is not supported',
      400
    );
  }

  if (typeof question !== 'string' || !question.trim()) {
    throw new ChineseSolverError(
      'CHINESE_QUESTION_REQUIRED',
      'Question is required',
      400
    );
  }
}

function parseResult(text, requestedMethod) {
  let result;

  try {
    result = JSON.parse(text);
  } catch {
    throw new ChineseSolverError(
      'CHINESE_AI_INVALID_JSON',
      'Chinese AI returned invalid JSON'
    );
  }

  const validMethod = chineseMethodSet.has(result?.method);
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
    result?.subject !== 'chinese'
    || !validMethod
    || (requestedMethod !== 'auto' && result.method !== requestedMethod)
    || !validSteps
    || !validAnswer
    || !validExplanation
    || !validOptionalFields
  ) {
    throw new ChineseSolverError(
      'CHINESE_AI_INVALID_RESULT',
      'Chinese AI returned an invalid result shape'
    );
  }

  return {
    subject: 'chinese',
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

export function createChineseSolver({ aiService }) {
  if (!aiService?.models?.generateContent) {
    throw new ChineseSolverError(
      'CHINESE_AI_SERVICE_REQUIRED',
      'Chinese AI service is required',
      500
    );
  }

  return {
    async solve(input) {
      validateInput(input);
      const response = await aiService.models.generateContent({
        contents: buildChinesePrompt(input)
      });
      return parseResult(response?.text, input.method);
    }
  };
}
