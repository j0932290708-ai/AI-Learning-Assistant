import { buildMicroprocessorPrompt, microprocessorMethodIds } from './prompt.js';
import { parseAiJson } from '../parseAiJson.js';

const microprocessorMethodSet = new Set(microprocessorMethodIds);
const optionalFields = ['registers', 'memory', 'instructions'];

export class MicroprocessorSolverError extends Error {
  constructor(code, message, statusCode = 502) {
    super(message);
    this.name = 'MicroprocessorSolverError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function validateInput({ subject, method, question }) {
  if (subject !== 'microprocessor') {
    throw new MicroprocessorSolverError(
      'MICROPROCESSOR_SUBJECT_REQUIRED',
      'Microprocessor solver only accepts subject microprocessor',
      400
    );
  }

  if (!microprocessorMethodSet.has(method)) {
    throw new MicroprocessorSolverError(
      'MICROPROCESSOR_METHOD_INVALID',
      'Microprocessor method is not supported',
      400
    );
  }

  if (typeof question !== 'string' || !question.trim()) {
    throw new MicroprocessorSolverError(
      'MICROPROCESSOR_QUESTION_REQUIRED',
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
    throw new MicroprocessorSolverError(
      'MICROPROCESSOR_AI_INVALID_JSON',
      'Microprocessor AI returned invalid JSON'
    );
  }

  const validMethod = microprocessorMethodSet.has(result?.method);
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
    (field) => result?.[field] === undefined || Array.isArray(result[field])
  );

  if (
    result?.subject !== 'microprocessor'
    || !validMethod
    || (requestedMethod !== 'auto' && result.method !== requestedMethod)
    || !validSteps
    || !validAnswer
    || !validExplanation
    || !validOptionalFields
  ) {
    throw new MicroprocessorSolverError(
      'MICROPROCESSOR_AI_INVALID_RESULT',
      'Microprocessor AI returned an invalid result shape'
    );
  }

  return {
    subject: 'microprocessor',
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

export function createMicroprocessorSolver({ aiService }) {
  if (!aiService?.models?.generateContent) {
    throw new MicroprocessorSolverError(
      'MICROPROCESSOR_AI_SERVICE_REQUIRED',
      'Microprocessor AI service is required',
      500
    );
  }

  return {
    async solve(input) {
      validateInput(input);
      const response = await aiService.models.generateContent({
        contents: buildMicroprocessorPrompt(input)
      });
      return parseResult(response?.text, input.method);
    }
  };
}
