const { z } = require('zod')

const electricalSubjects = new Set([
  'basic_electricity',
  'electronics',
  'digital_logic'
])

const electricalMethods = new Set([
  'node_voltage',
  'mesh_current',
  'kcl',
  'kvl',
  'thevenin'
])

const solveRequestSchema = z.object({
  subject: z.enum([
    'math',
    'basic_electricity',
    'electronics',
    'digital_logic',
    'programming',
    'microprocessor',
    'chinese',
    'english'
  ]),

  question: z
    .string()
    .trim()
    .min(1, 'question is required')
    .max(5000, 'question is too long'),

  method: z
    .enum([
      'normal',
      'node_voltage',
      'mesh_current',
      'kcl',
      'kvl',
      'thevenin'
    ])
    .optional(),

  word: z
    .string()
    .trim()
    .max(200, 'word is too long')
    .optional()
}).strict().superRefine((data, ctx) => {
  if (
    data.method &&
    electricalMethods.has(data.method) &&
    !electricalSubjects.has(data.subject)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['method'],
      message: 'This method is only available for electrical subjects'
    })
  }
})

module.exports = {
  solveRequestSchema,
  electricalSubjects,
  electricalMethods
}