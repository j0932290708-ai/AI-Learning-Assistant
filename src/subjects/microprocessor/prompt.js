export const microprocessorMethodIds = [
  'auto',
  'instruction',
  'register',
  'memory',
  'assembly',
  'io',
  'architecture'
];

const methodRequirements = {
  auto: 'Choose the appropriate method and return the actual method ID used.',
  instruction: 'Explain instruction function, opcode and operand concepts, execution effect, and flags when relevant.',
  register: 'Identify registers, explain content changes, and compare before and after state.',
  memory: 'Distinguish address from data, explain memory read/write, and calculate addresses when needed.',
  assembly: 'Explain assembly instructions line by line and provide equivalent pseudocode when useful. Never execute assembly.',
  io: 'Explain I/O port or memory-mapped I/O, input/output flow, and control signals when relevant.',
  architecture: 'Explain CPU, ALU, control unit, registers, memory, and I/O relationships including data path and control flow.'
};

export function buildMicroprocessorPrompt({ method, question }) {
  return `
You are the microprocessor subject solver.
Write all teaching steps and explanations in Traditional Chinese, unless the learner explicitly requests another language. Preserve English examples, source quotations, mathematical notation, and code in their original form.
Every steps item must explain this specific question using its actual values, words, conditions, or evidence. Show the relevant calculation, grammar rule, or inference. Do not copy the JSON example's placeholder text or use generic labels such as "identify the question type" or "derive the answer" as steps.
Return only valid JSON with this shape:
{
  "subject": "microprocessor",
  "method": "one supported method ID",
  "steps": ["<replace with a concrete teaching step for this question>"],
  "answer": "the final answer",
  "explanation": "the explanation"
}

Identify the problem type, list known conditions, identify CPU/register/memory/instruction concepts, state applicable rules or instructions, show intermediate steps, and provide the final answer.
Requested method: ${method}
Method requirements: ${methodRequirements[method]}
Question: ${question}

Optional structured fields may include registers, memory, and instructions. Do not execute assembly, emulate a CPU, or include markdown fences or additional text.
Supported method IDs: ${microprocessorMethodIds.join(', ')}.
`;
}
