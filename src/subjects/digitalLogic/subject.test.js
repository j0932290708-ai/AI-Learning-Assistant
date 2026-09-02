import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createDigitalLogicSolver,
  createSubjectModule,
  subjectId
} from './index.js';

test('digital logic module loads', () => {
  assert.equal(subjectId, 'digital-logic');
  assert.equal(createSubjectModule().subjectId, 'digital-logic');
  assert.equal(
    typeof createSubjectModule().createDigitalLogicSolver,
    'function'
  );
});

function createFakeSolver(responseText) {
  let calls = 0;
  const requests = [];
  const solver = createDigitalLogicSolver({
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

function validResponse(method, steps = ['Known inputs: A and B', 'Apply logic rule']) {
  return JSON.stringify({
    subject: 'digital-logic',
    method,
    steps,
    answer: 'Y = A AND B'
  });
}

for (const method of [
  'auto',
  'boolean',
  'logic_gate',
  'truth_table',
  'karnaugh_map',
  'flip_flop'
]) {
  test(`solves digital logic with ${method}`, async () => {
    const actualMethod = method === 'auto' ? 'boolean' : method;
    const fake = createFakeSolver(validResponse(actualMethod));
    const result = await fake.solver.solve({
      subject: 'digital-logic',
      method,
      question: 'Analyze the digital logic expression.'
    });

    assert.equal(result.subject, 'digital-logic');
    assert.equal(result.method, actualMethod);
    assert.deepEqual(result.steps, [
      'Known inputs: A and B',
      'Apply logic rule'
    ]);
    assert.equal(result.answer, 'Y = A AND B');
    assert.equal(fake.calls, 1);
    assert.match(fake.requests[0].contents, /Return only valid JSON/);
  });
}

test('preserves Boolean algebra fixture', async () => {
  const fake = createFakeSolver(validResponse('boolean', [
    'Expression: Y = A(B + C)',
    'Distribute: Y = AB + AC',
    'Simplify with Boolean algebra: Y = AB + AC'
  ]));
  const result = await fake.solver.solve({
    subject: 'digital-logic',
    method: 'boolean',
    question: 'Simplify Y = A(B + C).'
  });

  assert.match(result.steps[0], /Expression/);
  assert.match(result.steps[1], /Distribute/);
  assert.match(result.steps[2], /Simplify/);
  assert.equal(result.answer, 'Y = A AND B');
});

test('preserves truth table fixture structure', async () => {
  const table = {
    inputs: ['A', 'B'],
    rows: [
      { A: 0, B: 0, Y: 0 },
      { A: 0, B: 1, Y: 0 },
      { A: 1, B: 0, Y: 0 },
      { A: 1, B: 1, Y: 1 }
    ]
  };
  const response = JSON.parse(validResponse('truth_table', [
    'Known inputs: A, B in stable order',
    'Calculate Y for all four input combinations',
    'Output the complete truth table'
  ]));
  response.table = table;
  const fake = createFakeSolver(JSON.stringify(response));
  const result = await fake.solver.solve({
    subject: 'digital-logic',
    method: 'truth_table',
    question: 'Build the truth table for Y = A AND B.'
  });

  assert.deepEqual(result.table, table);
  assert.equal(result.table.rows.length, 4);
  assert.equal(result.table.rows[3].Y, 1);
});

test('preserves Karnaugh map fixture grouping', async () => {
  const fake = createFakeSolver(validResponse('karnaugh_map', [
    'Minterms: m(1, 3, 5, 7)',
    'Grouping: combine the four adjacent minterms',
    'Simplified expression: Y = C'
  ]));
  const result = await fake.solver.solve({
    subject: 'digital-logic',
    method: 'karnaugh_map',
    question: 'Simplify F(A,B,C) = sum m(1,3,5,7).'
  });

  assert.match(result.steps[0], /Minterms/);
  assert.match(result.steps[1], /Grouping/);
  assert.match(result.steps[2], /Simplified expression/);
});

test('rejects an empty question before calling AI', async () => {
  const fake = createFakeSolver(validResponse('boolean'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'digital-logic',
      method: 'boolean',
      question: '   '
    }),
    (error) => error.code === 'DIGITAL_LOGIC_QUESTION_REQUIRED'
  );
  assert.equal(fake.calls, 0);
});

test('rejects a non-digital-logic subject before calling AI', async () => {
  const fake = createFakeSolver(validResponse('auto'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'math',
      method: 'auto',
      question: 'A question'
    }),
    (error) => error.code === 'DIGITAL_LOGIC_SUBJECT_REQUIRED'
  );
  assert.equal(fake.calls, 0);
});

test('rejects an invalid method before calling AI', async () => {
  const fake = createFakeSolver(validResponse('boolean'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'digital-logic',
      method: 'kcl',
      question: 'A question'
    }),
    (error) => error.code === 'DIGITAL_LOGIC_METHOD_INVALID'
  );
  assert.equal(fake.calls, 0);
});

test('handles malformed AI JSON predictably', async () => {
  const fake = createFakeSolver('{not-json');

  await assert.rejects(
    fake.solver.solve({
      subject: 'digital-logic',
      method: 'auto',
      question: 'A question'
    }),
    (error) => error.code === 'DIGITAL_LOGIC_AI_INVALID_JSON'
  );
  assert.equal(fake.calls, 1);
});

for (const missingField of ['steps', 'answer']) {
  test(`rejects an AI result without ${missingField}`, async () => {
    const response = {
      subject: 'digital-logic',
      method: 'boolean',
      steps: ['Apply Boolean algebra'],
      answer: 'Y = A'
    };
    delete response[missingField];
    const fake = createFakeSolver(JSON.stringify(response));

    await assert.rejects(
      fake.solver.solve({
        subject: 'digital-logic',
        method: 'boolean',
        question: 'A question'
      }),
      (error) => error.code === 'DIGITAL_LOGIC_AI_INVALID_RESULT'
    );
  });
}

test('rejects an AI result with an incorrect subject', async () => {
  const fake = createFakeSolver(JSON.stringify({
    subject: 'math',
    method: 'boolean',
    steps: ['Apply Boolean algebra'],
    answer: 'Y = A'
  }));

  await assert.rejects(
    fake.solver.solve({
      subject: 'digital-logic',
      method: 'boolean',
      question: 'A question'
    }),
    (error) => error.code === 'DIGITAL_LOGIC_AI_INVALID_RESULT'
  );
});

test('rejects an AI result with an incorrect method', async () => {
  const fake = createFakeSolver(validResponse('truth_table'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'digital-logic',
      method: 'boolean',
      question: 'A question'
    }),
    (error) => error.code === 'DIGITAL_LOGIC_AI_INVALID_RESULT'
  );
});

test('validation failure does not call AI', async () => {
  const fake = createFakeSolver(validResponse('boolean'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'digital-logic',
      method: 'invalid',
      question: ''
    })
  );
  assert.equal(fake.calls, 0);
});
