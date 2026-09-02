import { createElectricalSolver } from './solver.js';

export const subjectId = 'basic-electrical';

export { buildElectricalPrompt, electricalMethodIds } from './prompt.js';
export {
  ElectricalSolverError,
  createElectricalSolver
} from './solver.js';

export function createSubjectModule() {
  return { subjectId, createElectricalSolver };
}
