import { createChineseSolver } from './solver.js';

export const subjectId = 'chinese';

export {
  buildChinesePrompt,
  chineseMethodIds
} from './prompt.js';
export {
  ChineseSolverError,
  createChineseSolver
} from './solver.js';

export function createSubjectModule() {
  return { subjectId, createChineseSolver };
}
