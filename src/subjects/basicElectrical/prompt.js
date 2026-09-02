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
Return only valid JSON with this shape:
{
  "subject": "basic-electrical",
  "method": "one supported method ID",
  "steps": ["ordered step 1", "ordered step 2"],
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
