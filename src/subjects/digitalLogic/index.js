import { createDigitalLogicSolver } from './solver.js';

export const subjectId = 'digital-logic';

export {
  buildDigitalLogicPrompt,
  digitalLogicMethodIds
} from './prompt.js';
export {
  DigitalLogicSolverError,
  createDigitalLogicSolver
} from './solver.js';

export function createSubjectModule() {
  return { subjectId, createDigitalLogicSolver };
}
