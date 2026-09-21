import assert from 'node:assert/strict';
import { test } from 'node:test';
import katex from 'katex';
import { formatStudyText, skeletonMarkup } from '../../public/src/richText.js';

test('KaTeX renders inline, display and multiline math including fractions and roots', () => {
  for (const text of [String.raw`$\frac{1}{2}$`, String.raw`\(x^2+y^2=r^2\)`, String.raw`\[\sqrt{9}\]`, '$$x^2\n+1$$']) {
    const html = formatStudyText(text, katex);
    assert.match(html, /class="katex/);
    assert.match(html, /<math/);
    assert.doesNotMatch(html, /math-fallback/);
  }
});

test('code is preserved and user HTML and LaTeX links cannot become executable content', () => {
  const html = formatStudyText('```js\nconst s = "$x^2$";\n<script>alert(1)</script>\n```', katex);
  assert.match(html, /<pre><code>/);
  assert.match(html, /\$x\^2\$/);
  assert.doesNotMatch(html, /class="katex|<script>/);
  const untrusted = formatStudyText(String.raw`<img src=x onerror=alert(1)> $\href{javascript:alert(1)}{x}$ $\includegraphics{https://example.com/a}$`, katex);
  assert.doesNotMatch(untrusted, /<img|<a |href="javascript|src="https/);
  assert.match(untrusted, /&lt;img/);
});

test('broken formulas and excessive macros retain escaped source without breaking the answer', () => {
  const html = formatStudyText(String.raw`前文 $\frac{1}{$ 後文 $\def\a{\a}\a$`, katex);
  assert.match(html, /math-fallback/);
  assert.match(html, /後文/);
  assert.match(formatStudyText('$x^2$', null), /math-fallback/);
  assert.equal(formatStudyText('價格 $50 與 $60', katex), '價格 $50 與 $60');
});

test('skeleton separates decorative animation from readable progress text', () => {
  const html = skeletonMarkup('<script>loading</script>');
  assert.match(html, /role="status"/); assert.match(html, /aria-hidden="true"/);
  assert.doesNotMatch(html, /<script>/);
});
