import {
  createMathSolver,
  mathMethodIds
} from './math/index.js';
import { guidedLesson, withLearnerFeedback } from '../services/teachingMode.js';
import { automaticLesson } from '../services/automaticLesson.js';
import { exactArithmetic } from '../services/arithmetic.js';
import {
  createElectricalSolver,
  electricalMethodIds
} from './basicElectrical/index.js';
import {
  createElectronicsSolver,
  electronicsMethodIds
} from './electronics/index.js';
import {
  createDigitalLogicSolver,
  digitalLogicMethodIds
} from './digitalLogic/index.js';
import {
  createProgrammingSolver,
  programmingMethodIds
} from './programming/index.js';
import {
  createMicroprocessorSolver,
  microprocessorMethodIds
} from './microprocessor/index.js';
import {
  createChineseSolver,
  chineseMethodIds
} from './chinese/index.js';
import {
  createEnglishSolver,
  englishMethodIds
} from './english/index.js';

const subjectDefinitions = {
  math: {
    localSubject: 'math',
    methods: mathMethodIds,
    createSolver: createMathSolver
  },
  basic_electricity: {
    localSubject: 'basic-electrical',
    methods: electricalMethodIds,
    createSolver: createElectricalSolver
  },
  electronics: {
    localSubject: 'electronics',
    methods: electronicsMethodIds,
    createSolver: createElectronicsSolver
  },
  digital_logic: {
    localSubject: 'digital-logic',
    methods: digitalLogicMethodIds,
    createSolver: createDigitalLogicSolver
  },
  programming: {
    localSubject: 'programming',
    methods: programmingMethodIds,
    createSolver: createProgrammingSolver
  },
  microprocessor: {
    localSubject: 'microprocessor',
    methods: microprocessorMethodIds,
    createSolver: createMicroprocessorSolver
  },
  chinese: {
    localSubject: 'chinese',
    methods: chineseMethodIds,
    createSolver: createChineseSolver
  },
  english: {
    localSubject: 'english',
    methods: englishMethodIds,
    createSolver: createEnglishSolver
  }
};

export const subjectIds = Object.keys(subjectDefinitions);

export class SubjectRegistryError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = 'SubjectRegistryError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function getSubjectMethods(subject) {
  return subjectDefinitions[subject]?.methods ?? [];
}

export async function solveSubject(input, aiService) {
  const arithmetic = exactArithmetic(input);
  if (arithmetic) return arithmetic;
  if (input.subject === 'auto') {
    if (input.method !== 'auto') throw new SubjectRegistryError('METHOD_NOT_SUPPORTED', 'Automatic subjects require automatic methods');
    return automaticLesson(input, aiService, Object.fromEntries(Object.entries(subjectDefinitions).map(([id, value]) => [id, value.methods])));
  }
  const definition = subjectDefinitions[input.subject];

  if (!definition) {
    throw new SubjectRegistryError(
      'SUBJECT_NOT_SUPPORTED',
      'Subject is not supported'
    );
  }

  if (!definition.methods.includes(input.method)) {
    throw new SubjectRegistryError(
      'METHOD_NOT_SUPPORTED',
      'Method is not supported for this subject'
    );
  }

  if (input.mode === 'guided') return guidedLesson(input, aiService);
  const solver = definition.createSolver({ aiService: withLearnerFeedback(input, aiService) });
  const result = await solver.solve({
    subject: definition.localSubject,
    method: input.method,
    question: input.question
  });

  return {
    ...result,
    mode: 'direct',
    subject: input.subject
  };
}
