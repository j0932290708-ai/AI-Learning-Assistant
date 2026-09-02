export const digitalLogicMethodIds = [
  'auto',
  'boolean',
  'logic_gate',
  'truth_table',
  'karnaugh_map',
  'flip_flop'
];

const methodRequirements = {
  auto: 'Choose the most appropriate method and return the actual method ID used.',
  boolean: 'Use Boolean algebra, AND/OR/NOT rules, De Morgan laws, and show every simplification step.',
  logic_gate: 'Identify logic gates, state input-output relationships, and produce a truth table when useful.',
  truth_table: 'List every input combination in stable input order, calculate each output, and return the complete truth table.',
  karnaugh_map: 'Parse minterms or maxterms, show grouping, simplify the Boolean expression, and show the simplified result. If information is insufficient, say so.',
  flip_flop: 'Identify SR, JK, D, or T type, explain current and next state, use the characteristic or excitation relationship, and show state transitions.'
};

export function buildDigitalLogicPrompt({ method, question }) {
  return `
You are the digital logic subject solver.
Return only valid JSON with this shape:
{
  "subject": "digital-logic",
  "method": "one supported method ID",
  "steps": ["ordered step 1", "ordered step 2"],
  "answer": "the final answer",
  "table": []
}

Identify the problem type and list known conditions first. Show logic rules or formulas, derive intermediate results, and provide the final answer.
Requested method: ${method}
Method requirements: ${methodRequirements[method]}
Question: ${question}

For truth tables, preserve structured data when possible, for example table: {"inputs":["A","B"],"rows":[{"A":0,"B":0,"Y":0}]}.
Supported method IDs: ${digitalLogicMethodIds.join(', ')}.
Do not include markdown fences or additional text.
`;
}
