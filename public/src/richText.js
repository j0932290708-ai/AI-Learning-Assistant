import { escapeHtml } from './api.js';

export function formatStudyText(value, renderer = globalThis.katex) {
  const text = String(value ?? '');
  const tokens = [];
  // Protect code and formulas before Markdown formatting or HTML escaping.
  const protectedText = text.replace(/```[^\n]*\n[\s\S]*?```|`[^`\n]+`|\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|(?<![\\$])\$(?!\s)(?:\\.|[^$\n])+?\$(?!\d)/g, (token) => {
    let html;
    if (token.startsWith('```')) html = `<pre><code>${escapeHtml(token.replace(/^```[^\n]*\n|```$/g, ''))}</code></pre>`;
    else if (token.startsWith('`')) html = `<code>${escapeHtml(token.slice(1, -1))}</code>`;
    else {
      const displayMode = token.startsWith('$$') || token.startsWith('\\[');
      const delimiter = token.startsWith('\\') || token.startsWith('$$') ? 2 : 1;
      const formula = token.slice(delimiter, -delimiter);
      try {
        if (!renderer || formula.length > 2000 || tokens.length > 100) throw new Error('Formula unavailable');
        html = renderer.renderToString(formula, { displayMode, throwOnError: true,
          trust: false, strict: 'ignore', maxExpand: 100, maxSize: 10, macros: {}, output: 'htmlAndMathml' });
      } catch {
        html = `<code class="math-fallback" title="公式未能排版，保留原文供核對">${escapeHtml(token)}</code>`;
      }
    }
    tokens.push(html);
    return `\uE000${tokens.length - 1}\uE001`;
  });
  return escapeHtml(protectedText)
    .replace(/^#{2,3}\s+(.+)$/gm, '<strong class="section-title">$1</strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^[ \t]*[-*]\s+(.+)$/gm, '<div class="ai-bullet">• $1</div>')
    .replace(/\n/g, '<br>')
    .replace(/\uE000(\d+)\uE001/g, (match, index) => tokens[index] ?? match);
}

export function skeletonMarkup(message) {
  return `<div class="loading-note" role="status"><span class="chalk-spinner" aria-hidden="true"></span>${escapeHtml(message)}</div>
    <div class="skeleton" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <p class="small">題目已保留，請不用重複按按鈕。</p>`;
}
