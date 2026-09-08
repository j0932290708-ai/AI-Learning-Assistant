import { buildMathPrompt, mathMethodIds } from './prompt.js';
import { parseAiJson } from '../parseAiJson.js';

const mathMethodSet = new Set(mathMethodIds);

export class MathSolverError extends Error {
  constructor(code, message, statusCode = 502) {
    super(message);
    this.name = 'MathSolverError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function validateInput({ subject, method, question }) {
  if (subject !== 'math') {
    throw new MathSolverError(
      'MATH_SUBJECT_REQUIRED',
      'Math solver only accepts subject math',
      400
    );
  }

  if (!mathMethodSet.has(method)) {
    throw new MathSolverError(
      'MATH_METHOD_INVALID',
      'Math method is not supported',
      400
    );
  }

  if (typeof question !== 'string' || !question.trim()) {
    throw new MathSolverError(
      'MATH_QUESTION_REQUIRED',
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
    throw new MathSolverError(
      'MATH_AI_INVALID_JSON',
      'Math AI returned invalid JSON'
    );
  }

  const validMethod = mathMethodSet.has(result?.method);
  const validSteps = Array.isArray(result?.steps)
    && result.steps.length > 0
    && result.steps.every(
      (step) => typeof step === 'string' && step.trim()
    );
  const validAnswer = typeof result?.answer === 'string'
    && result.answer.trim();

  if (
    result?.subject !== 'math'
    || !validMethod
    || (requestedMethod !== 'auto' && result.method !== requestedMethod)
    || !validSteps
    || !validAnswer
  ) {
    throw new MathSolverError(
      'MATH_AI_INVALID_RESULT',
      'Math AI returned an invalid result shape'
    );
  }

  return {
    subject: 'math',
    method: result.method,
    steps: result.steps,
    answer: result.answer
  };
}

export function createMathSolver({ aiService }) {
  if (!aiService?.models?.generateContent) {
    throw new MathSolverError(
      'MATH_AI_SERVICE_REQUIRED',
      'Math AI service is required',
      500
    );
  }

  return {
    async solve(input) {
      validateInput(input);
      const response = await aiService.models.generateContent({
        contents: buildMathPrompt(input)
      });
      return parseResult(response?.text, input.method);
    }
  };
}
