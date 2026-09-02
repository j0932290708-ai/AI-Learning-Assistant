import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createMathSolver,
  createSubjectModule,
  subjectId
} from './index.js';

test('math module loads', () => {
  assert.equal(subjectId, 'math');
  assert.equal(createSubjectModule().subjectId, 'math');
  assert.equal(typeof createSubjectModule().createMathSolver, 'function');
});

function createFakeSolver(responseText) {
  let calls = 0;
  const solver = createMathSolver({
    aiService: {
      models: {
        async generateContent() {
          calls += 1;
          return { text: responseText };
        }
      }
    }
  });

  return {
    solver,
    get calls() {
      return calls;
    }
  };
}

function validResponse(method) {
  return JSON.stringify({
    subject: 'math',
    method,
    steps: ['Identify the operation', 'Compute the result'],
    answer: '42'
  });
}

for (const method of [
  'auto',
  'algebra',
  'calculus',
  'combinatorics',
  'arithmetic'
]) {
  test(`solves math with ${method}`, async () => {
    const fake = createFakeSolver(validResponse(method));
    const result = await fake.solver.solve({
      subject: 'math',
      method,
      question: 'What is the result?'
    });

    assert.equal(result.subject, 'math');
    assert.equal(result.method, method);
    assert.deepEqual(result.steps, [
      'Identify the operation',
      'Compute the result'
    ]);
    assert.equal(result.answer, '42');
    assert.equal(fake.calls, 1);
  });
}

test('rejects an empty math question before calling AI', async () => {
  const fake = createFakeSolver(validResponse('arithmetic'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'math',
      method: 'arithmetic',
      question: '   '
    }),
    (error) => error.code === 'MATH_QUESTION_REQUIRED'
  );
  assert.equal(fake.calls, 0);
});

test('rejects a non-math subject before calling AI', async () => {
  const fake = createFakeSolver(validResponse('auto'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'english',
      method: 'auto',
      question: 'A question'
    }),
    (error) => error.code === 'MATH_SUBJECT_REQUIRED'
  );
  assert.equal(fake.calls, 0);
});

test('handles malformed AI JSON predictably', async () => {
  const fake = createFakeSolver('{not-json');

  await assert.rejects(
    fake.solver.solve({
      subject: 'math',
      method: 'auto',
      question: 'A question'
    }),
    (error) => error.code === 'MATH_AI_INVALID_JSON'
  );
  assert.equal(fake.calls, 1);
});

test('rejects an AI result without steps', async () => {
  const fake = createFakeSolver(JSON.stringify({
    subject: 'math',
    method: 'algebra',
    answer: '42'
  }));

  await assert.rejects(
    fake.solver.solve({
      subject: 'math',
      method: 'algebra',
      question: 'Solve x + 1 = 2'
    }),
    (error) => error.code === 'MATH_AI_INVALID_RESULT'
  );
});

test('rejects an AI result without answer', async () => {
  const fake = createFakeSolver(JSON.stringify({
    subject: 'math',
    method: 'calculus',
    steps: ['Differentiate the expression']
  }));

  await assert.rejects(
    fake.solver.solve({
      subject: 'math',
      method: 'calculus',
      question: 'Find the derivative'
    }),
    (error) => error.code === 'MATH_AI_INVALID_RESULT'
  );
});
