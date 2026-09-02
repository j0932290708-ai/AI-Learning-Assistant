import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { createApp } from '../../src/app.js';

const autoMethods = {
  math: 'algebra',
  'basic-electrical': 'kcl',
  electronics: 'diode',
  'digital-logic': 'boolean',
  programming: 'python',
  microprocessor: 'instruction',
  chinese: 'reading',
  english: 'grammar'
};

function createFakeAiService() {
  return {
    models: {
      async generateContent(request) {
        const prompt = request.contents;
        const subject = prompt.match(/"subject":\s*"([^"]+)"/)?.[1];
        const requestedMethod = prompt.match(
          /requested method(?: is)?:\s*(\w+)/i
        )?.[1]
          || 'auto';
        const method = requestedMethod === 'auto'
          ? autoMethods[subject]
          : requestedMethod;

        return {
          text: JSON.stringify({
            subject,
            method,
            steps: ['Identify the question type', 'Explain the key idea'],
            answer: 'This is a fake answer used by the integration test.',
            explanation: 'The response is structured and contains no real API call.'
          })
        };
      }
    }
  };
}

const app = createApp({
  services: { aiService: createFakeAiService() },
  logger: { log() {}, error() {} }
});
let server;
let baseUrl;

before(() => {
  server = app.listen(0);
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

async function postSolve(body) {
  const response = await fetch(`${baseUrl}/api/solve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  return {
    response,
    body: await response.json()
  };
}

for (const subject of [
  'math',
  'basic_electricity',
  'electronics',
  'digital_logic',
  'programming',
  'microprocessor',
  'chinese',
  'english'
]) {
  test(`POST /api/solve routes ${subject} to its subject solver`, async () => {
    const result = await postSolve({
      subject,
      method: 'auto',
      question: 'Explain this topic.'
    });

    assert.equal(result.response.status, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.subject, subject);
    assert.ok(result.body.method);
    assert.deepEqual(result.body.steps, [
      'Identify the question type',
      'Explain the key idea'
    ]);
    assert.match(result.body.answer, /fake answer/);
  });
}

test('POST /api/solve rejects an empty question', async () => {
  const result = await postSolve({
    subject: 'english',
    method: 'grammar',
    question: '   '
  });

  assert.equal(result.response.status, 400);
  assert.equal(result.body.error.code, 'VALIDATION_ERROR');
  assert.ok(result.body.error.fields.question);
});

test('POST /api/solve defaults to auto when method is omitted', async () => {
  const result = await postSolve({
    subject: 'math',
    question: 'Explain this topic.'
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.body.subject, 'math');
  assert.equal(result.body.method, 'algebra');
});

test('POST /api/solve keeps a supported requested method', async () => {
  const result = await postSolve({
    subject: 'english',
    method: 'grammar',
    question: 'Explain this sentence.'
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.body.subject, 'english');
  assert.equal(result.body.method, 'grammar');
});

test('POST /api/solve rejects a method from another subject', async () => {
  const result = await postSolve({
    subject: 'math',
    method: 'grammar',
    question: 'What is 1 + 1?'
  });

  assert.equal(result.response.status, 400);
  assert.equal(result.body.error.code, 'METHOD_NOT_SUPPORTED');
});

test('POST /api/solve reports a missing AI service safely', async () => {
  const appWithoutAi = createApp({
    logger: { log() {}, error() {} }
  });
  const localServer = appWithoutAi.listen(0);
  const address = localServer.address();

  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/solve`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: 'math',
          method: 'auto',
          question: 'What is 1 + 1?'
        })
      }
    );
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(body.error.code, 'AI_SERVICE_UNAVAILABLE');
    assert.equal(body.error.message, 'AI service is not configured');
  } finally {
    await new Promise((resolve, reject) => {
      localServer.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
