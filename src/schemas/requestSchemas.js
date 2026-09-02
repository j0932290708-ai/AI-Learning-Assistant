import { z } from 'zod';

import { subjectIds } from '../subjects/registry.js';

export const solveRequestSchema = z.object({
  subject: z.enum(subjectIds),
  method: z.string().trim().min(1).default('auto'),
  question: z
    .string()
    .trim()
    .min(1, 'question is required')
    .max(12000, 'question is too long')
}).strict();
