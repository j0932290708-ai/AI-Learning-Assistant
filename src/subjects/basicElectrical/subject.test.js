import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createElectricalSolver,
  createSubjectModule,
  subjectId
} from './index.js';

test('basic electrical module loads', () => {
  assert.equal(subjectId, 'basic-electrical');
  assert.equal(createSubjectModule().subjectId, 'basic-electrical');
  assert.equal(
    typeof createSubjectModule().createElectricalSolver,
    'function'
  );
});

function createFakeSolver(responseText) {
  let calls = 0;
  const requests = [];
  const solver = createElectricalSolver({
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

function validResponse(method, steps = ['Known: 12 V', 'Apply the formula']) {
  return JSON.stringify({
    subject: 'basic-electrical',
    method,
    steps,
    answer: '2 A'
  });
}

for (const method of [
  'auto',
  'kcl',
  'kvl',
  'node_voltage',
  'mesh_current',
  'series_parallel'
]) {
  test(`solves basic electrical with ${method}`, async () => {
    const actualMethod = method === 'auto' ? 'kcl' : method;
    const fake = createFakeSolver(validResponse(actualMethod));
    const result = await fake.solver.solve({
      subject: 'basic-electrical',
      method,
      question: 'A 12 V source is connected to a resistor.'
    });

    assert.equal(result.subject, 'basic-electrical');
    assert.equal(result.method, actualMethod);
    assert.deepEqual(result.steps, ['Known: 12 V', 'Apply the formula']);
    assert.equal(result.answer, '2 A');
    assert.equal(fake.calls, 1);
    assert.match(fake.requests[0].contents, /Return only valid JSON/);
  });
}

test('preserves node voltage fixture formulas and answer', async () => {
  const fake = createFakeSolver(validResponse('node_voltage', [
    'Ground node: reference is 0 V',
    'Equation: (V - 12) / 6 = 0',
    'Result: V = 12 V'
  ]));
  const result = await fake.solver.solve({
    subject: 'basic-electrical',
    method: 'node_voltage',
    question: 'Find the node voltage across a 6 ohm branch.'
  });

  assert.deepEqual(result.steps, [
    'Ground node: reference is 0 V',
    'Equation: (V - 12) / 6 = 0',
    'Result: V = 12 V'
  ]);
  assert.equal(result.answer, '2 A');
});

test('preserves KCL and KVL fixture formulas', async () => {
  for (const method of ['kcl', 'kvl']) {
    const fake = createFakeSolver(validResponse(method, [
      `${method.toUpperCase()} equation: I1 + I2 = I3`,
      'Substitute values: 2 A + 1 A = 3 A'
    ]));
    const result = await fake.solver.solve({
      subject: 'basic-electrical',
      method,
      question: 'Determine the current in the circuit.'
    });

    assert.match(result.steps[0], /equation/i);
    assert.match(result.steps[1], /Substitute values/);
    assert.equal(result.answer, '2 A');
  }
});

test('rejects an empty question before calling AI', async () => {
  const fake = createFakeSolver(validResponse('kcl'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'basic-electrical',
      method: 'kcl',
      question: '   '
    }),
    (error) => error.code === 'ELECTRICAL_QUESTION_REQUIRED'
  );
  assert.equal(fake.calls, 0);
});

test('rejects a non-basic-electrical subject before calling AI', async () => {
  const fake = createFakeSolver(validResponse('auto'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'math',
      method: 'auto',
      question: 'A question'
    }),
    (error) => error.code === 'ELECTRICAL_SUBJECT_REQUIRED'
  );
  assert.equal(fake.calls, 0);
});

test('rejects an invalid method before calling AI', async () => {
  const fake = createFakeSolver(validResponse('kcl'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'basic-electrical',
      method: 'algebra',
      question: 'A question'
    }),
    (error) => error.code === 'ELECTRICAL_METHOD_INVALID'
  );
  assert.equal(fake.calls, 0);
});

test('handles malformed AI JSON predictably', async () => {
  const fake = createFakeSolver('{not-json');

  await assert.rejects(
    fake.solver.solve({
      subject: 'basic-electrical',
      method: 'auto',
      question: 'A question'
    }),
    (error) => error.code === 'ELECTRICAL_AI_INVALID_JSON'
  );
  assert.equal(fake.calls, 1);
});

for (const missingField of ['steps', 'answer']) {
  test(`rejects an AI result without ${missingField}`, async () => {
    const response = {
      subject: 'basic-electrical',
      method: 'kcl',
      steps: ['Use KCL'],
      answer: '2 A'
    };
    delete response[missingField];
    const fake = createFakeSolver(JSON.stringify(response));

    await assert.rejects(
      fake.solver.solve({
        subject: 'basic-electrical',
        method: 'kcl',
        question: 'A question'
      }),
      (error) => error.code === 'ELECTRICAL_AI_INVALID_RESULT'
    );
  });
}

test('rejects an AI result with an incorrect subject', async () => {
  const fake = createFakeSolver(JSON.stringify({
    subject: 'math',
    method: 'kcl',
    steps: ['Use KCL'],
    answer: '2 A'
  }));

  await assert.rejects(
    fake.solver.solve({
      subject: 'basic-electrical',
      method: 'kcl',
      question: 'A question'
    }),
    (error) => error.code === 'ELECTRICAL_AI_INVALID_RESULT'
  );
});

test('rejects an AI result with an incorrect method', async () => {
  const fake = createFakeSolver(validResponse('kvl'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'basic-electrical',
      method: 'kcl',
      question: 'A question'
    }),
    (error) => error.code === 'ELECTRICAL_AI_INVALID_RESULT'
  );
});

test('validation failure does not call AI', async () => {
  const fake = createFakeSolver(validResponse('kcl'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'basic-electrical',
      method: 'invalid',
      question: ''
    })
  );
  assert.equal(fake.calls, 0);
});
