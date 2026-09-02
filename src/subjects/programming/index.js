import { createProgrammingSolver } from './solver.js';

export const subjectId = 'programming';

export {
  buildProgrammingPrompt,
  programmingMethodIds
} from './prompt.js';
export {
  ProgrammingSolverError,
  createProgrammingSolver
} from './solver.js';

export function createSubjectModule() {
  return { subjectId, createProgrammingSolver };
}
