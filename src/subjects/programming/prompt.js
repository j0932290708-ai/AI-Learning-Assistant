export const programmingMethodIds = [
  'auto',
  'c',
  'cpp',
  'python',
  'javascript',
  'debugging',
  'algorithm'
];

const methodRequirements = {
  auto: 'Choose the most appropriate programming method and return the actual method ID used.',
  c: 'Provide C syntax and explain important C syntax. Never execute user code.',
  cpp: 'Provide C++ syntax, STL or main data structures when useful, and explain them. Never execute user code.',
  python: 'Provide Python syntax, explain the main syntax and data structures, and never execute user code.',
  javascript: 'Provide JavaScript syntax and explain the main syntax. Never execute user code.',
  debugging: 'Locate the error, explain its cause, provide a corrected version, and explain the changes. Never execute user code.',
  algorithm: 'Identify the problem type, propose an algorithm and data structure, provide pseudocode or appropriate code, and analyze time and space complexity.'
};

export function buildProgrammingPrompt({ method, question }) {
  return `
You are the programming subject solver.
Write all teaching steps and explanations in Traditional Chinese, unless the learner explicitly requests another language. Preserve English examples, source quotations, mathematical notation, and code in their original form.
Every steps item must explain this specific question using its actual values, words, conditions, or evidence. Show the relevant calculation, grammar rule, or inference. Do not copy the JSON example's placeholder text or use generic labels such as "identify the question type" or "derive the answer" as steps.
Return only valid JSON with this shape:
{
  "subject": "programming",
  "method": "one supported method ID",
  "steps": ["<replace with a concrete teaching step for this question>"],
  "answer": "the final answer",
  "code": "code or pseudocode when needed",
  "explanation": "an explanation of the solution",
  "complexity": {"time": "O(?)", "space": "O(?)"}
}

Break the solution into: problem understanding; known conditions and input/output; solution or algorithm; important steps; code; code explanation; time complexity when applicable; space complexity when applicable; final answer.
Requested method: ${method}
Method requirements: ${methodRequirements[method]}
Question: ${question}

Do not execute, compile, interpret, or sandbox user code. Do not include markdown fences or additional text.
Supported method IDs: ${programmingMethodIds.join(', ')}.
`;
}
