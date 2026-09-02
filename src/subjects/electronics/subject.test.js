import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createElectronicsSolver,
  createSubjectModule,
  subjectId
} from './index.js';

test('electronics module loads', () => {
  assert.equal(subjectId, 'electronics');
  assert.equal(createSubjectModule().subjectId, 'electronics');
  assert.equal(
    typeof createSubjectModule().createElectronicsSolver,
    'function'
  );
});

function createFakeSolver(responseText) {
  let calls = 0;
  const requests = [];
  const solver = createElectronicsSolver({
    aiService: {
      models: {
        async generateContent(request) {
          calls += 1;
          requests.push(request);
          return { text: responseText };
        }
      }
    }
  });

  return {
    solver,
    requests,
    get calls() {
      return calls;
    }
  };
}

function validResponse(method, steps = ['Known: 5 V', 'Apply the model']) {
  return JSON.stringify({
    subject: 'electronics',
    method,
    steps,
    answer: '1 mA'
  });
}

for (const method of [
  'auto',
  'diode',
  'bjt',
  'fet',
  'op_amp',
  'amplifier'
]) {
  test(`solves electronics with ${method}`, async () => {
    const actualMethod = method === 'auto' ? 'diode' : method;
    const fake = createFakeSolver(validResponse(actualMethod));
    const result = await fake.solver.solve({
      subject: 'electronics',
      method,
      question: 'Analyze the component circuit.'
    });

    assert.equal(result.subject, 'electronics');
    assert.equal(result.method, actualMethod);
    assert.deepEqual(result.steps, ['Known: 5 V', 'Apply the model']);
    assert.equal(result.answer, '1 mA');
    assert.equal(fake.calls, 1);
    assert.match(fake.requests[0].contents, /Return only valid JSON/);
  });
}

test('preserves diode fixture conditions and result', async () => {
  const fake = createFakeSolver(validResponse('diode', [
    'Known: Vs = 5 V and R = 1 kohm',
    'Forward bias: use the constant-voltage diode model',
    'Formula: I = (Vs - Vf) / R = (5 - 0.7) / 1000',
    'Result: I = 4.3 mA'
  ]));
  const result = await fake.solver.solve({
    subject: 'electronics',
    method: 'diode',
    question: 'Find the forward current through the diode.'
  });

  assert.match(result.steps[0], /Known/);
  assert.match(result.steps[1], /Forward bias/);
  assert.match(result.steps[2], /Formula/);
  assert.equal(result.answer, '1 mA');
});

test('preserves BJT fixture region and calculations', async () => {
  const fake = createFakeSolver(validResponse('bjt', [
    'Known: beta = 100 and IB = 20 uA',
    'Operating region: active',
    'Formula: IC = beta * IB = 100 * 20 uA = 2 mA'
  ]));
  const result = await fake.solver.solve({
    subject: 'electronics',
    method: 'bjt',
    question: 'Determine the BJT operating region and collector current.'
  });

  assert.match(result.steps[1], /active/);
  assert.match(result.steps[2], /IC/);
  assert.equal(result.answer, '1 mA');
});

test('preserves OP Amp fixture assumptions and formula', async () => {
  const fake = createFakeSolver(validResponse('op_amp', [
    'Known: ideal op amp with negative feedback',
    'Assumptions: virtual short and virtual open',
    'Formula: Vout = -Rf / Rin * Vin'
  ]));
  const result = await fake.solver.solve({
    subject: 'electronics',
    method: 'op_amp',
    question: 'Find the output of the inverting amplifier.'
  });

  assert.match(result.steps[0], /Known/);
  assert.match(result.steps[1], /virtual/);
  assert.match(result.steps[2], /Vout/);
});

test('rejects an empty question before calling AI', async () => {
  const fake = createFakeSolver(validResponse('diode'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'electronics',
      method: 'diode',
      question: '   '
    }),
    (error) => error.code === 'ELECTRONICS_QUESTION_REQUIRED'
  );
  assert.equal(fake.calls, 0);
});

test('rejects a non-electronics subject before calling AI', async () => {
  const fake = createFakeSolver(validResponse('auto'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'math',
      method: 'auto',
      question: 'A question'
    }),
    (error) => error.code === 'ELECTRONICS_SUBJECT_REQUIRED'
  );
  assert.equal(fake.calls, 0);
});

test('rejects an invalid method before calling AI', async () => {
  const fake = createFakeSolver(validResponse('diode'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'electronics',
      method: 'kcl',
      question: 'A question'
    }),
    (error) => error.code === 'ELECTRONICS_METHOD_INVALID'
  );
  assert.equal(fake.calls, 0);
});

test('handles malformed AI JSON predictably', async () => {
  const fake = createFakeSolver('{not-json');

  await assert.rejects(
    fake.solver.solve({
      subject: 'electronics',
      method: 'auto',
      question: 'A question'
    }),
    (error) => error.code === 'ELECTRONICS_AI_INVALID_JSON'
  );
  assert.equal(fake.calls, 1);
});

for (const missingField of ['steps', 'answer']) {
  test(`rejects an AI result without ${missingField}`, async () => {
    const response = {
      subject: 'electronics',
      method: 'diode',
      steps: ['Use the diode model'],
      answer: '1 mA'
    };
    delete response[missingField];
    const fake = createFakeSolver(JSON.stringify(response));

    await assert.rejects(
      fake.solver.solve({
        subject: 'electronics',
        method: 'diode',
        question: 'A question'
      }),
      (error) => error.code === 'ELECTRONICS_AI_INVALID_RESULT'
    );
  });
}

test('rejects an AI result with an incorrect subject', async () => {
  const fake = createFakeSolver(JSON.stringify({
    subject: 'math',
    method: 'diode',
    steps: ['Use the diode model'],
    answer: '1 mA'
  }));

  await assert.rejects(
    fake.solver.solve({
      subject: 'electronics',
      method: 'diode',
      question: 'A question'
    }),
    (error) => error.code === 'ELECTRONICS_AI_INVALID_RESULT'
  );
});

test('rejects an AI result with an incorrect method', async () => {
  const fake = createFakeSolver(validResponse('bjt'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'electronics',
      method: 'diode',
      question: 'A question'
    }),
    (error) => error.code === 'ELECTRONICS_AI_INVALID_RESULT'
  );
});

test('validation failure does not call AI', async () => {
  const fake = createFakeSolver(validResponse('diode'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'electronics',
      method: 'invalid',
      question: ''
    })
  );
  assert.equal(fake.calls, 0);
});
