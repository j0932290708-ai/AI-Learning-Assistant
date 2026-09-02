import { buildDigitalLogicPrompt, digitalLogicMethodIds } from './prompt.js';

const digitalLogicMethodSet = new Set(digitalLogicMethodIds);

export class DigitalLogicSolverError extends Error {
  constructor(code, message, statusCode = 502) {
    super(message);
    this.name = 'DigitalLogicSolverError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function validateInput({ subject, method, question }) {
  if (subject !== 'digital-logic') {
    throw new DigitalLogicSolverError(
      'DIGITAL_LOGIC_SUBJECT_REQUIRED',
      'Digital logic solver only accepts subject digital-logic',
      400
    );
  }

  if (!digitalLogicMethodSet.has(method)) {
    throw new DigitalLogicSolverError(
      'DIGITAL_LOGIC_METHOD_INVALID',
      'Digital logic method is not supported',
      400
    );
  }

  if (typeof question !== 'string' || !question.trim()) {
    throw new DigitalLogicSolverError(
      'DIGITAL_LOGIC_QUESTION_REQUIRED',
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
    throw new DigitalLogicSolverError(
      'DIGITAL_LOGIC_AI_INVALID_JSON',
      'Digital logic AI returned invalid JSON'
    );
  }

  const validMethod = digitalLogicMethodSet.has(result?.method);
  const validSteps = Array.isArray(result?.steps)
    && result.steps.length > 0
    && result.steps.every(
      (step) => typeof step === 'string' && step.trim()
    );
  const validAnswer = typeof result?.answer === 'string'
    && result.answer.trim();
  const validTable = result?.table === undefined
    || (result.table !== null && typeof result.table === 'object');

  if (
    result?.subject !== 'digital-logic'
    || !validMethod
    || (requestedMethod !== 'auto' && result.method !== requestedMethod)
    || !validSteps
    || !validAnswer
    || !validTable
  ) {
    throw new DigitalLogicSolverError(
      'DIGITAL_LOGIC_AI_INVALID_RESULT',
      'Digital logic AI returned an invalid result shape'
    );
  }

  return {
    subject: 'digital-logic',
    method: result.method,
    steps: result.steps,
    answer: result.answer,
    ...(result.table === undefined ? {} : { table: result.table })
  };
}

export function createDigitalLogicSolver({ aiService }) {
  if (!aiService?.models?.generateContent) {
    throw new DigitalLogicSolverError(
      'DIGITAL_LOGIC_AI_SERVICE_REQUIRED',
      'Digital logic AI service is required',
      500
    );
  }

  return {
    async solve(input) {
      validateInput(input);
      const response = await aiService.models.generateContent({
        contents: buildDigitalLogicPrompt(input)
      });
      return parseResult(response?.text, input.method);
    }
  };
}
