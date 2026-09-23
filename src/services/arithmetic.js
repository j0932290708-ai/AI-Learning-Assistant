// Only a complete two-number arithmetic expression is accepted. No eval or code execution.
export function exactArithmetic(input) {
  if (!['auto', 'math'].includes(input.subject) || !['auto', 'arithmetic'].includes(input.method)
    || input.mode === 'guided' || input.feedback) return null;
  const text = input.question.normalize('NFKC').trim();
  const match = text.match(/^([+-]?\d{1,20}(?:\.\d{1,12})?)\s*([+−\-*×/÷])\s*([+-]?\d{1,20}(?:\.\d{1,12})?)\s*(?:=\s*\??|\?)?$/);
  if (!match) return null;
  const fraction = value => {
    const [whole, decimals = ''] = value.split('.');
    return [BigInt(whole + decimals), 10n ** BigInt(decimals.length)];
  };
  const [a, b] = fraction(match[1]), [c, d] = fraction(match[3]);
  const op = match[2];
  if (['/', '÷'].includes(op) && c === 0n) return { subject: 'math', method: 'arithmetic', mode: 'direct', steps: ['除數不能為 0。'], answer: '未定義（不能除以 0）' };
  let n, den;
  if (op === '+') { n = a*d + c*b; den = b*d; }
  else if (['-', '−'].includes(op)) { n = a*d - c*b; den = b*d; }
  else if (['*', '×'].includes(op)) { n = a*c; den = b*d; }
  else { n = a*d; den = b*c; }
  if (den < 0n) { n = -n; den = -den; }
  const gcd = (x, y) => { while (y) [x, y] = [y, x % y]; return x; };
  const divisor = gcd(n < 0n ? -n : n, den); n /= divisor; den /= divisor;
  let reduced = den, twos = 0, fives = 0;
  while (reduced % 2n === 0n) { reduced /= 2n; twos++; }
  while (reduced % 5n === 0n) { reduced /= 5n; fives++; }
  let answer = `${n}/${den}`;
  if (reduced === 1n) {
    const places = Math.max(twos, fives);
    const scaled = n * 10n ** BigInt(places) / den;
    const digits = String(scaled < 0n ? -scaled : scaled).padStart(places + 1, '0');
    answer = (scaled < 0n ? '-' : '') + (places ? `${digits.slice(0, -places)}.${digits.slice(-places)}` : digits);
  }
  return { subject: 'math', method: 'arithmetic', mode: 'direct', steps: [`計算 ${match[1]} ${op} ${match[3]} = ${answer}。`], answer, explanation: '以精確四則運算計算；等號後的問號代表待求結果。' };
}
