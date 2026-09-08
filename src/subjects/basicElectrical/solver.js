import { buildElectricalPrompt, electricalMethodIds } from './prompt.js';
import { parseAiJson } from '../parseAiJson.js';

const electricalMethodSet = new Set(electricalMethodIds);

export class ElectricalSolverError extends Error {
  constructor(code, message, statusCode = 502) {
    super(message);
    this.name = 'ElectricalSolverError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function validateInput({ subject, method, question }) {
  if (subject !== 'basic-electrical') {
    throw new ElectricalSolverError(
      'ELECTRICAL_SUBJECT_REQUIRED',
      'Basic electrical solver only accepts subject basic-electrical',
      400
    );
  }

  if (!electricalMethodSet.has(method)) {
    throw new ElectricalSolverError(
      'ELECTRICAL_METHOD_INVALID',
      'Basic electrical method is not supported',
      400
    );
  }

  if (typeof question !== 'string' || !question.trim()) {
    throw new ElectricalSolverError(
      'ELECTRICAL_QUESTION_REQUIRED',
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
    throw new ElectricalSolverError(
      'ELECTRICAL_AI_INVALID_JSON',
      'Basic electrical AI returned invalid JSON'
    );
  }

  const validMethod = electricalMethodSet.has(result?.method);
  const validSteps = Array.isArray(result?.steps)
    && result.steps.length > 0
    && result.steps.every(
      (step) => typeof step === 'string' && step.trim()
    );
  const validAnswer = typeof result?.answer === 'string'
    && result.answer.trim();

  if (
    result?.subject !== 'basic-electrical'
    || !validMethod
    || (requestedMethod !== 'auto' && result.method !== requestedMethod)
    || !validSteps
    || !validAnswer
  ) {
    throw new ElectricalSolverError(
      'ELECTRICAL_AI_INVALID_RESULT',
      'Basic electrical AI returned an invalid result shape'
    );
  }

  return {
    subject: 'basic-electrical',
    method: result.method,
    steps: result.steps,
    answer: result.answer
  };
}

export function createElectricalSolver({ aiService }) {
  if (!aiService?.models?.generateContent) {
    throw new ElectricalSolverError(
      'ELECTRICAL_AI_SERVICE_REQUIRED',
      'Basic electrical AI service is required',
      500
    );
  }

  return {
    async solve(input) {
      validateInput(input);
      const response = await aiService.models.generateContent({
        contents: buildElectricalPrompt(input)
      });
      return parseResult(response?.text, input.method);
    }
  };
}
