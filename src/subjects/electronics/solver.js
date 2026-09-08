import { buildElectronicsPrompt, electronicsMethodIds } from './prompt.js';
import { parseAiJson } from '../parseAiJson.js';

const electronicsMethodSet = new Set(electronicsMethodIds);

export class ElectronicsSolverError extends Error {
  constructor(code, message, statusCode = 502) {
    super(message);
    this.name = 'ElectronicsSolverError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function validateInput({ subject, method, question }) {
  if (subject !== 'electronics') {
    throw new ElectronicsSolverError(
      'ELECTRONICS_SUBJECT_REQUIRED',
      'Electronics solver only accepts subject electronics',
      400
    );
  }

  if (!electronicsMethodSet.has(method)) {
    throw new ElectronicsSolverError(
      'ELECTRONICS_METHOD_INVALID',
      'Electronics method is not supported',
      400
    );
  }

  if (typeof question !== 'string' || !question.trim()) {
    throw new ElectronicsSolverError(
      'ELECTRONICS_QUESTION_REQUIRED',
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
    throw new ElectronicsSolverError(
      'ELECTRONICS_AI_INVALID_JSON',
      'Electronics AI returned invalid JSON'
    );
  }

  const validMethod = electronicsMethodSet.has(result?.method);
  const validSteps = Array.isArray(result?.steps)
    && result.steps.length > 0
    && result.steps.every(
      (step) => typeof step === 'string' && step.trim()
    );
  const validAnswer = typeof result?.answer === 'string'
    && result.answer.trim();

  if (
    result?.subject !== 'electronics'
    || !validMethod
    || (requestedMethod !== 'auto' && result.method !== requestedMethod)
    || !validSteps
    || !validAnswer
  ) {
    throw new ElectronicsSolverError(
      'ELECTRONICS_AI_INVALID_RESULT',
      'Electronics AI returned an invalid result shape'
    );
  }

  return {
    subject: 'electronics',
    method: result.method,
    steps: result.steps,
    answer: result.answer
  };
}

export function createElectronicsSolver({ aiService }) {
  if (!aiService?.models?.generateContent) {
    throw new ElectronicsSolverError(
      'ELECTRONICS_AI_SERVICE_REQUIRED',
      'Electronics AI service is required',
      500
    );
  }

  return {
    async solve(input) {
      validateInput(input);
      const response = await aiService.models.generateContent({
        contents: buildElectronicsPrompt(input)
      });
      return parseResult(response?.text, input.method);
    }
  };
}
