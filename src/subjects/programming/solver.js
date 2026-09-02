import { buildProgrammingPrompt, programmingMethodIds } from './prompt.js';

const programmingMethodSet = new Set(programmingMethodIds);
const codeRequestPattern = /\b(code|program|implement|write|function|class|pseudocode)\b|程式|實作|程式碼/i;

export class ProgrammingSolverError extends Error {
  constructor(code, message, statusCode = 502) {
    super(message);
    this.name = 'ProgrammingSolverError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function validateInput({ subject, method, question }) {
  if (subject !== 'programming') {
    throw new ProgrammingSolverError(
      'PROGRAMMING_SUBJECT_REQUIRED',
      'Programming solver only accepts subject programming',
      400
    );
  }

  if (!programmingMethodSet.has(method)) {
    throw new ProgrammingSolverError(
      'PROGRAMMING_METHOD_INVALID',
      'Programming method is not supported',
      400
    );
  }

  if (typeof question !== 'string' || !question.trim()) {
    throw new ProgrammingSolverError(
      'PROGRAMMING_QUESTION_REQUIRED',
      'Question is required',
      400
    );
  }
}

function parseResult(text, requestedMethod, question) {
  let result;

  try {
    result = JSON.parse(text);
  } catch {
    throw new ProgrammingSolverError(
      'PROGRAMMING_AI_INVALID_JSON',
      'Programming AI returned invalid JSON'
    );
  }

  const validMethod = programmingMethodSet.has(result?.method);
  const validSteps = Array.isArray(result?.steps)
    && result.steps.length > 0
    && result.steps.every(
      (step) => typeof step === 'string' && step.trim()
    );
  const validAnswer = typeof result?.answer === 'string'
    && result.answer.trim();
  const validExplanation = typeof result?.explanation === 'string'
    && result.explanation.trim();
  const needsCode = codeRequestPattern.test(question);
  const validCode = !needsCode
    || (typeof result?.code === 'string' && result.code.trim());
  const validComplexity = result?.complexity === undefined
    || (
      result.complexity !== null
      && typeof result.complexity === 'object'
      && typeof result.complexity.time === 'string'
      && typeof result.complexity.space === 'string'
    );

  if (
    result?.subject !== 'programming'
    || !validMethod
    || (requestedMethod !== 'auto' && result.method !== requestedMethod)
    || !validSteps
    || !validAnswer
    || !validExplanation
    || !validCode
    || !validComplexity
  ) {
    throw new ProgrammingSolverError(
      'PROGRAMMING_AI_INVALID_RESULT',
      'Programming AI returned an invalid result shape'
    );
  }

  return {
    subject: 'programming',
    method: result.method,
    steps: result.steps,
    answer: result.answer,
    ...(result.code === undefined ? {} : { code: result.code }),
    explanation: result.explanation,
    ...(result.complexity === undefined ? {} : { complexity: result.complexity })
  };
}

export function createProgrammingSolver({ aiService }) {
  if (!aiService?.models?.generateContent) {
    throw new ProgrammingSolverError(
      'PROGRAMMING_AI_SERVICE_REQUIRED',
      'Programming AI service is required',
      500
    );
  }

  return {
    async solve(input) {
      validateInput(input);
      const response = await aiService.models.generateContent({
        contents: buildProgrammingPrompt(input)
      });
      return parseResult(response?.text, input.method, input.question);
    }
  };
}
