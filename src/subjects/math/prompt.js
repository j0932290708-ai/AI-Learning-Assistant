export const mathMethodIds = [
  'auto',
  'algebra',
  'calculus',
  'combinatorics',
  'arithmetic'
];

export function buildMathPrompt({ method, question }) {
  return `
You are the mathematics subject solver.
Return only valid JSON with this shape:
{
  "subject": "math",
  "method": "one supported method id",
  "steps": ["ordered step 1", "ordered step 2"],
  "answer": "the final answer"
}

The requested method is: ${method}
The question is: ${question}

Supported method IDs: ${mathMethodIds.join(', ')}.
If the requested method is auto, choose the most appropriate supported method and return that method ID.
Do not include markdown fences or additional text.
`;
}
