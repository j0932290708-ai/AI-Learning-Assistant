import { createMicroprocessorSolver } from './solver.js';

export const subjectId = 'microprocessor';

export {
  buildMicroprocessorPrompt,
  microprocessorMethodIds
} from './prompt.js';
export {
  MicroprocessorSolverError,
  createMicroprocessorSolver
} from './solver.js';

export function createSubjectModule() {
  return { subjectId, createMicroprocessorSolver };
}
