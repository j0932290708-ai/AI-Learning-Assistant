import { createEnglishSolver } from './solver.js';

export const subjectId = 'english';

export {
  buildEnglishPrompt,
  englishMethodIds
} from './prompt.js';
export {
  EnglishSolverError,
  createEnglishSolver
} from './solver.js';

export function createSubjectModule() {
  return { subjectId, createEnglishSolver };
}
