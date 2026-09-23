import { z } from 'zod';

import { subjectIds } from '../subjects/registry.js';

export const solveRequestSchema = z.object({
  subject: z.enum(['auto', ...subjectIds]).default('auto'),
  method: z.string().trim().min(1).default('auto'),
  mode: z.enum(['direct', 'guided']).default('direct'),
  feedback: z.string().trim().max(1000).default(''),
  previousAnswer: z.string().max(4000).default(''),
  question: z
    .string()
    .trim()
    .min(1, 'question is required')
    .max(5000, 'question is too long')
}).strict();
