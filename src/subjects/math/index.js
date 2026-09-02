import { createMathSolver } from './solver.js';

export const subjectId = 'math';

export { buildMathPrompt, mathMethodIds } from './prompt.js';
export { MathSolverError, createMathSolver } from './solver.js';

export function createSubjectModule() {
  return { subjectId, createMathSolver };
}
