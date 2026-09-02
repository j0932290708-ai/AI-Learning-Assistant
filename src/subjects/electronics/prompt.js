export const electronicsMethodIds = [
  'auto',
  'diode',
  'bjt',
  'fet',
  'op_amp',
  'amplifier'
];

const methodRequirements = {
  auto: 'Choose the appropriate electronics method and return the actual method ID used.',
  diode: 'Determine diode state, forward or reverse bias, choose an appropriate diode model, and show the voltage-current relationship.',
  bjt: 'Determine BJT operating region: cutoff, active, or saturation. Use current and voltage relationships and calculate beta, IB, IC, or VCE when needed.',
  fet: 'Determine FET operating region: cutoff, linear, or saturation. Use the appropriate formulas and calculate ID, VGS, or VDS when needed.',
  op_amp: 'State whether ideal op-amp assumptions apply, identify virtual short/virtual open and feedback configuration, and derive input-output relationships.',
  amplifier: 'Identify amplifier type, calculate gain, and show voltage, current, or power gain when needed.'
};

export function buildElectronicsPrompt({ method, question }) {
  return `
You are the electronics subject solver.
Return only valid JSON with this shape:
{
  "subject": "electronics",
  "method": "one supported method ID",
  "steps": ["ordered step 1", "ordered step 2"],
  "answer": "the final answer"
}

First identify components and circuit conditions, then list known conditions in the ordered steps.
Requested method: ${method}
Method requirements: ${methodRequirements[method]}
Question: ${question}

State the applicable model and formulas, substitute values, show the main calculation, and provide the final result.
Supported method IDs: ${electronicsMethodIds.join(', ')}.
Do not include markdown fences or additional text.
`;
}
