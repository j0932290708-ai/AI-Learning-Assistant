import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createMicroprocessorSolver,
  createSubjectModule,
  subjectId
} from './index.js';

test('microprocessor module loads', () => {
  assert.equal(subjectId, 'microprocessor');
  assert.equal(createSubjectModule().subjectId, 'microprocessor');
  assert.equal(
    typeof createSubjectModule().createMicroprocessorSolver,
    'function'
  );
});

function createFakeSolver(responseText) {
  let calls = 0;
  const requests = [];
  const solver = createMicroprocessorSolver({
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
    subject: 'microprocessor',
    method,
    steps: ['Identify the instruction or component', 'Derive the result'],
    answer: 'The operation completes as specified.',
    explanation: 'The execution rules determine the final state.',
    ...overrides
  });
}

for (const method of [
  'auto',
  'instruction',
  'register',
  'memory',
  'assembly',
  'io',
  'architecture'
]) {
  test(`solves microprocessor with ${method}`, async () => {
    const actualMethod = method === 'auto' ? 'instruction' : method;
    const fake = createFakeSolver(validResponse(actualMethod));
    const result = await fake.solver.solve({
      subject: 'microprocessor',
      method,
      question: 'Explain this microprocessor question.'
    });

    assert.equal(result.subject, 'microprocessor');
    assert.equal(result.method, actualMethod);
    assert.equal(result.steps.length, 2);
    assert.equal(result.answer, 'The operation completes as specified.');
    assert.match(result.explanation, /execution/);
    assert.equal(fake.calls, 1);
    assert.match(fake.requests[0].contents, /Do not execute assembly/);
  });
}

test('preserves instruction fixture', async () => {
  const fake = createFakeSolver(validResponse('instruction', {
    steps: [
      'Instruction: MOV R1, R2',
      'Operands: source R2 and destination R1',
      'Execution: copy the data from R2 into R1; flags unchanged'
    ],
    answer: 'R1 receives the previous value of R2.',
    explanation: 'MOV transfers operand data without executing arbitrary code.',
    instructions: [{ opcode: 'MOV', operands: ['R1', 'R2'] }]
  }));
  const result = await fake.solver.solve({
    subject: 'microprocessor',
    method: 'instruction',
    question: 'Explain MOV R1, R2.'
  });

  assert.match(result.steps[0], /Instruction/);
  assert.match(result.steps[2], /Execution/);
  assert.deepEqual(result.instructions, [
    { opcode: 'MOV', operands: ['R1', 'R2'] }
  ]);
});

test('preserves register fixture', async () => {
  const fake = createFakeSolver(validResponse('register', {
    steps: [
      'Initial register: R0 = 3',
      'Operation: ADD R0, 2',
      'Final register: R0 = 5'
    ],
    registers: [{ name: 'R0', before: 3, after: 5 }]
  }));
  const result = await fake.solver.solve({
    subject: 'microprocessor',
    method: 'register',
    question: 'Trace the register after the addition.'
  });

  assert.match(result.steps[0], /Initial register/);
  assert.match(result.steps[2], /Final register/);
  assert.deepEqual(result.registers, [{ name: 'R0', before: 3, after: 5 }]);
});

test('preserves memory fixture', async () => {
  const fake = createFakeSolver(validResponse('memory', {
    steps: [
      'Address: 0x1000; data: 0x2A',
      'Operation: memory read at address 0x1000',
      'Result: returned data is 0x2A'
    ],
    memory: [{ address: '0x1000', data: '0x2A', operation: 'read' }]
  }));
  const result = await fake.solver.solve({
    subject: 'microprocessor',
    method: 'memory',
    question: 'Read the data at address 0x1000.'
  });

  assert.match(result.steps[0], /Address/);
  assert.match(result.steps[1], /memory read/);
  assert.deepEqual(result.memory, [
    { address: '0x1000', data: '0x2A', operation: 'read' }
  ]);
});

test('preserves assembly fixture without executing it', async () => {
  const fake = createFakeSolver(validResponse('assembly', {
    steps: [
      'Assembly: LOAD R1, [0x1000]',
      'Line explanation: read memory at 0x1000 into R1',
      'Final state: R1 contains the memory data'
    ],
    answer: 'R1 contains the value read from memory.',
    explanation: 'This is a static line-by-line explanation only.',
    instructions: ['LOAD R1, [0x1000]']
  }));
  const result = await fake.solver.solve({
    subject: 'microprocessor',
    method: 'assembly',
    question: 'Explain this assembly code line by line.'
  });

  assert.match(result.steps[1], /Line explanation/);
  assert.match(result.steps[2], /Final state/);
  assert.deepEqual(result.instructions, ['LOAD R1, [0x1000]']);
});

test('rejects an empty question before calling AI', async () => {
  const fake = createFakeSolver(validResponse('instruction'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'microprocessor',
      method: 'instruction',
      question: '   '
    }),
    (error) => error.code === 'MICROPROCESSOR_QUESTION_REQUIRED'
  );
  assert.equal(fake.calls, 0);
});

test('rejects a non-microprocessor subject before calling AI', async () => {
  const fake = createFakeSolver(validResponse('auto'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'programming',
      method: 'auto',
      question: 'A question'
    }),
    (error) => error.code === 'MICROPROCESSOR_SUBJECT_REQUIRED'
  );
  assert.equal(fake.calls, 0);
});

test('rejects an invalid method before calling AI', async () => {
  const fake = createFakeSolver(validResponse('instruction'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'microprocessor',
      method: 'kcl',
      question: 'A question'
    }),
    (error) => error.code === 'MICROPROCESSOR_METHOD_INVALID'
  );
  assert.equal(fake.calls, 0);
});

test('handles malformed AI JSON predictably', async () => {
  const fake = createFakeSolver('{not-json');

  await assert.rejects(
    fake.solver.solve({
      subject: 'microprocessor',
      method: 'auto',
      question: 'A question'
    }),
    (error) => error.code === 'MICROPROCESSOR_AI_INVALID_JSON'
  );
  assert.equal(fake.calls, 1);
});

for (const missingField of ['steps', 'answer', 'explanation']) {
  test(`rejects an AI result without ${missingField}`, async () => {
    const response = {
      subject: 'microprocessor',
      method: 'instruction',
      steps: ['Explain the instruction'],
      answer: 'The operation completes.',
      explanation: 'The instruction changes the state.'
    };
    delete response[missingField];
    const fake = createFakeSolver(JSON.stringify(response));

    await assert.rejects(
      fake.solver.solve({
        subject: 'microprocessor',
        method: 'instruction',
        question: 'Explain this instruction.'
      }),
      (error) => error.code === 'MICROPROCESSOR_AI_INVALID_RESULT'
    );
  });
}

test('rejects an AI result with an incorrect subject', async () => {
  const fake = createFakeSolver(validResponse('instruction', {
    subject: 'math'
  }));

  await assert.rejects(
    fake.solver.solve({
      subject: 'microprocessor',
      method: 'instruction',
      question: 'A question'
    }),
    (error) => error.code === 'MICROPROCESSOR_AI_INVALID_RESULT'
  );
});

test('rejects an AI result with an incorrect method', async () => {
  const fake = createFakeSolver(validResponse('register'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'microprocessor',
      method: 'instruction',
      question: 'A question'
    }),
    (error) => error.code === 'MICROPROCESSOR_AI_INVALID_RESULT'
  );
});

test('validation failure does not call AI', async () => {
  const fake = createFakeSolver(validResponse('instruction'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'microprocessor',
      method: 'invalid',
      question: ''
    })
  );
  assert.equal(fake.calls, 0);
});
