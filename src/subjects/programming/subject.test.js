import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createProgrammingSolver,
  createSubjectModule,
  subjectId
} from './index.js';

test('programming module loads', () => {
  assert.equal(subjectId, 'programming');
  assert.equal(createSubjectModule().subjectId, 'programming');
  assert.equal(
    typeof createSubjectModule().createProgrammingSolver,
    'function'
  );
});

function createFakeSolver(responseText) {
  let calls = 0;
  const requests = [];
  const solver = createProgrammingSolver({
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

function validResponse(method, overrides = {}) {
  return JSON.stringify({
    subject: 'programming',
    method,
    steps: ['Understand input and output', 'Build the solution'],
    answer: 'The program produces the required result.',
    code: 'print("answer")',
    explanation: 'The code follows the solution steps.',
    complexity: { time: 'O(n)', space: 'O(1)' },
    ...overrides
  });
}

for (const method of [
  'auto',
  'c',
  'cpp',
  'python',
  'javascript',
  'debugging',
  'algorithm'
]) {
  test(`solves programming with ${method}`, async () => {
    const actualMethod = method === 'auto' ? 'algorithm' : method;
    const fake = createFakeSolver(validResponse(actualMethod));
    const result = await fake.solver.solve({
      subject: 'programming',
      method,
      question: 'Write code to solve this problem.'
    });

    assert.equal(result.subject, 'programming');
    assert.equal(result.method, actualMethod);
    assert.equal(result.steps.length, 2);
    assert.equal(result.answer, 'The program produces the required result.');
    assert.equal(result.code, 'print("answer")');
    assert.match(result.explanation, /code/);
    assert.deepEqual(result.complexity, { time: 'O(n)', space: 'O(1)' });
    assert.equal(fake.calls, 1);
    assert.match(fake.requests[0].contents, /Do not execute/);
  });
}

test('preserves Python algorithm fixture', async () => {
  const fake = createFakeSolver(validResponse('python', {
    steps: [
      'Input: an array of values',
      'Algorithm: scan once while tracking the best value',
      'Output: return the best value'
    ],
    code: 'def solve(values):\n    return max(values)',
    explanation: 'The scan uses a Python list and returns the maximum.',
    complexity: { time: 'O(n)', space: 'O(1)' }
  }));
  const result = await fake.solver.solve({
    subject: 'programming',
    method: 'python',
    question: 'Write Python code to find the maximum value.'
  });

  assert.match(result.steps[1], /Algorithm/);
  assert.match(result.code, /def solve/);
  assert.deepEqual(result.complexity, { time: 'O(n)', space: 'O(1)' });
});

test('preserves C fixture code and explanation', async () => {
  const fake = createFakeSolver(validResponse('c', {
    code: '#include <stdio.h>\nint main(void) { return 0; }',
    explanation: 'stdio.h provides the C input and output declarations.'
  }));
  const result = await fake.solver.solve({
    subject: 'programming',
    method: 'c',
    question: 'Write C code for this program.'
  });

  assert.match(result.code, /#include <stdio.h>/);
  assert.match(result.explanation, /stdio/);
});

test('preserves debugging fixture', async () => {
  const fake = createFakeSolver(validResponse('debugging', {
    steps: [
      'Buggy code: loop condition uses i <= values.length',
      'Cause: the final index is outside the array',
      'Fix: change the condition to i < values.length'
    ],
    code: 'for (let i = 0; i < values.length; i += 1) { process(values[i]); }',
    explanation: 'The corrected bound prevents an out-of-range access.'
  }));
  const result = await fake.solver.solve({
    subject: 'programming',
    method: 'debugging',
    question: 'Debug this code and provide a corrected version.'
  });

  assert.match(result.steps[0], /Buggy code/);
  assert.match(result.steps[1], /Cause/);
  assert.match(result.steps[2], /Fix/);
  assert.match(result.code, /i < values.length/);
});

test('preserves algorithm fixture and complexity', async () => {
  const fake = createFakeSolver(validResponse('algorithm', {
    steps: [
      'Input/output: receive a sorted array and a target, return its index',
      'Algorithm: binary search',
      'Pseudocode: compare the middle value and discard half the range',
      'Complexity: time O(log n), space O(1)'
    ],
    code: 'while left <= right: inspect the middle element',
    explanation: 'Binary search uses the sorted invariant to halve the range.',
    complexity: { time: 'O(log n)', space: 'O(1)' }
  }));
  const result = await fake.solver.solve({
    subject: 'programming',
    method: 'algorithm',
    question: 'Propose an algorithm and pseudocode for search.'
  });

  assert.match(result.steps[1], /binary search/);
  assert.match(result.steps[2], /Pseudocode/);
  assert.deepEqual(result.complexity, { time: 'O(log n)', space: 'O(1)' });
});

test('rejects an empty question before calling AI', async () => {
  const fake = createFakeSolver(validResponse('python'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'programming',
      method: 'python',
      question: '   '
    }),
    (error) => error.code === 'PROGRAMMING_QUESTION_REQUIRED'
  );
  assert.equal(fake.calls, 0);
});

test('rejects a non-programming subject before calling AI', async () => {
  const fake = createFakeSolver(validResponse('auto'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'math',
      method: 'auto',
      question: 'A question'
    }),
    (error) => error.code === 'PROGRAMMING_SUBJECT_REQUIRED'
  );
  assert.equal(fake.calls, 0);
});

test('rejects an invalid method before calling AI', async () => {
  const fake = createFakeSolver(validResponse('python'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'programming',
      method: 'kcl',
      question: 'A question'
    }),
    (error) => error.code === 'PROGRAMMING_METHOD_INVALID'
  );
  assert.equal(fake.calls, 0);
});

test('handles malformed AI JSON predictably', async () => {
  const fake = createFakeSolver('{not-json');

  await assert.rejects(
    fake.solver.solve({
      subject: 'programming',
      method: 'auto',
      question: 'A question'
    }),
    (error) => error.code === 'PROGRAMMING_AI_INVALID_JSON'
  );
  assert.equal(fake.calls, 1);
});

for (const missingField of ['steps', 'answer']) {
  test(`rejects an AI result without ${missingField}`, async () => {
    const response = {
      subject: 'programming',
      method: 'python',
      steps: ['Explain the approach'],
      answer: 'The result is correct.',
      code: 'print("answer")',
      explanation: 'This explains the code.'
    };
    delete response[missingField];
    const fake = createFakeSolver(JSON.stringify(response));

    await assert.rejects(
      fake.solver.solve({
        subject: 'programming',
        method: 'python',
        question: 'Explain this code.'
      }),
      (error) => error.code === 'PROGRAMMING_AI_INVALID_RESULT'
    );
  });
}

test('rejects a code request without code', async () => {
  const fake = createFakeSolver(validResponse('python', { code: '' }));

  await assert.rejects(
    fake.solver.solve({
      subject: 'programming',
      method: 'python',
      question: 'Write code to solve this problem.'
    }),
    (error) => error.code === 'PROGRAMMING_AI_INVALID_RESULT'
  );
});

test('rejects an AI result with an incorrect subject', async () => {
  const fake = createFakeSolver(validResponse('python', {
    subject: 'math'
  }));

  await assert.rejects(
    fake.solver.solve({
      subject: 'programming',
      method: 'python',
      question: 'A question'
    }),
    (error) => error.code === 'PROGRAMMING_AI_INVALID_RESULT'
  );
});

test('rejects an AI result with an incorrect method', async () => {
  const fake = createFakeSolver(validResponse('cpp'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'programming',
      method: 'python',
      question: 'A question'
    }),
    (error) => error.code === 'PROGRAMMING_AI_INVALID_RESULT'
  );
});

test('validation failure does not call AI', async () => {
  const fake = createFakeSolver(validResponse('python'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'programming',
      method: 'invalid',
      question: ''
    })
  );
  assert.equal(fake.calls, 0);
});
