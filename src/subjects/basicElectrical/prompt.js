export const electricalMethodIds = [
  'auto',
  'kcl',
  'kvl',
  'node_voltage',
  'mesh_current',
  'series_parallel'
];

const methodRequirements = {
  auto: 'Choose the most appropriate method and return the actual method ID used.',
  kcl: 'Describe nodes and current directions, establish KCL equations, and solve unknowns.',
  kvl: 'Describe the loop and traversal direction, establish KVL equations, and solve unknowns.',
  node_voltage: 'Choose a reference/ground node, establish node-voltage equations, and solve node voltages and branch currents when needed.',
  mesh_current: 'Establish mesh currents and directions, write mesh equations, and solve mesh currents.',
  series_parallel: 'Identify series and parallel elements, simplify equivalent resistance, and calculate total current and branch voltages/currents when needed.'
};

export function buildElectricalPrompt({ method, question }) {
  return `
You are the basic electrical subject solver.
Write all teaching steps and explanations in Traditional Chinese, unless the learner explicitly requests another language. Preserve English examples, source quotations, mathematical notation, and code in their original form.
Every steps item must explain this specific question using its actual values, words, conditions, or evidence. Show the relevant calculation, grammar rule, or inference. Do not copy the JSON example's placeholder text or use generic labels such as "identify the question type" or "derive the answer" as steps.
Return only valid JSON with this shape:
{
  "subject": "basic-electrical",
  "method": "one supported method ID",
  "steps": ["<replace with a concrete teaching step for this question>"],
  "answer": "the final answer"
}

First assess the available circuit information and list known conditions in the ordered steps.
Requested method: ${method}
Method requirements: ${methodRequirements[method]}
Question: ${question}

Show relevant formulas and substitute values in the steps. Return the actual method used when the requested method is auto.
Supported method IDs: ${electricalMethodIds.join(', ')}.
Do not include markdown fences or additional text.
`;
}
