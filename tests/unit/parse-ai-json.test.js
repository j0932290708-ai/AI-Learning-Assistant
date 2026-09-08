import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseAiJson } from '../../src/subjects/parseAiJson.js';

test('parses plain and fenced AI JSON', () => {
  assert.deepEqual(parseAiJson('{"answer":"ok"}'), { answer: 'ok' });
  assert.deepEqual(
    parseAiJson('```json\n{"answer":"ok"}\n```'),
    { answer: 'ok' }
  );
});

test('rejects non-text or malformed AI output', () => {
  assert.throws(() => parseAiJson(null), SyntaxError);
  assert.throws(() => parseAiJson('not json'), SyntaxError);
});
