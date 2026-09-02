import { createElectronicsSolver } from './solver.js';

export const subjectId = 'electronics';

export {
  buildElectronicsPrompt,
  electronicsMethodIds
} from './prompt.js';
export {
  ElectronicsSolverError,
  createElectronicsSolver
} from './solver.js';

export function createSubjectModule() {
  return { subjectId, createElectronicsSolver };
}
