import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createEnglishSolver,
  createSubjectModule,
  subjectId
} from './index.js';

test('english module loads', () => {
  assert.equal(subjectId, 'english');
  assert.equal(createSubjectModule().subjectId, 'english');
  assert.equal(typeof createSubjectModule().createEnglishSolver, 'function');
});

function createFakeSolver(responseText) {
  let calls = 0;
  const requests = [];
  const solver = createEnglishSolver({
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
    subject: 'english',
    method,
    steps: ['Identify the question type', 'Analyze the evidence'],
    answer: 'The answer follows from the supplied English.',
    explanation: 'The explanation uses the supplied context.',
    ...overrides
  });
}

for (const method of [
  'auto',
  'vocabulary',
  'grammar',
  'reading',
  'translation',
  'cloze',
  'sentence'
]) {
  test(`solves English with ${method}`, async () => {
    const actualMethod = method === 'auto' ? 'reading' : method;
    const fake = createFakeSolver(validResponse(actualMethod));
    const result = await fake.solver.solve({
      subject: 'english',
      method,
      question: 'Analyze this English question.'
    });

    assert.equal(result.subject, 'english');
    assert.equal(result.method, actualMethod);
    assert.equal(result.steps.length, 2);
    assert.equal(result.answer, 'The answer follows from the supplied English.');
    assert.match(result.explanation, /supplied context/);
    assert.equal(fake.calls, 1);
    assert.match(fake.requests[0].contents, /Return only valid JSON/);
  });
}

test('preserves vocabulary fixture', async () => {
  const fake = createFakeSolver(validResponse('vocabulary', {
    word: 'adapt',
    partOfSpeech: 'verb',
    meanings: ['to adjust to a new condition'],
    examples: ['Plants adapt to their environment.']
  }));
  const result = await fake.solver.solve({
    subject: 'english',
    method: 'vocabulary',
    question: 'Explain the word adapt.'
  });

  assert.equal(result.word, 'adapt');
  assert.equal(result.partOfSpeech, 'verb');
  assert.deepEqual(result.meanings, ['to adjust to a new condition']);
  assert.match(result.examples[0], /environment/);
});

test('preserves grammar fixture', async () => {
  const fake = createFakeSolver(validResponse('grammar', {
    grammarPoint: 'present perfect',
    rule: 'Use have or has with the past participle for a past action connected to the present.',
    examples: ['She has finished her work.']
  }));
  const result = await fake.solver.solve({
    subject: 'english',
    method: 'grammar',
    question: 'Explain the tense in this sentence.'
  });

  assert.equal(result.grammarPoint, 'present perfect');
  assert.match(result.rule, /past participle/);
  assert.deepEqual(result.examples, ['She has finished her work.']);
});

test('preserves reading fixture evidence and conclusion', async () => {
  const fake = createFakeSolver(validResponse('reading', {
    evidence: ['The passage states that the speaker practiced every day.'],
    conclusion: 'The speaker improved through regular practice.'
  }));
  const result = await fake.solver.solve({
    subject: 'english',
    method: 'reading',
    question: 'What caused the improvement in the supplied passage?'
  });

  assert.deepEqual(result.evidence, [
    'The passage states that the speaker practiced every day.'
  ]);
  assert.equal(result.conclusion, 'The speaker improved through regular practice.');
});

test('preserves translation and cloze fixture fields', async () => {
  const translation = createFakeSolver(validResponse('translation', {
    sourceText: 'Knowledge grows when it is shared.',
    translation: '知識在分享時增長。',
    notes: ['Natural Chinese phrasing is preferred.']
  }));
  const translationResult = await translation.solver.solve({
    subject: 'english',
    method: 'translation',
    question: 'Translate the supplied sentence.'
  });
  assert.equal(translationResult.sourceText, 'Knowledge grows when it is shared.');
  assert.equal(translationResult.translation, '知識在分享時增長。');

  const cloze = createFakeSolver(validResponse('cloze', {
    choices: ['go', 'goes', 'going'],
    selectedAnswer: 'goes'
  }));
  const clozeResult = await cloze.solver.solve({
    subject: 'english',
    method: 'cloze',
    question: 'She ___ to school every day.'
  });
  assert.deepEqual(clozeResult.choices, ['go', 'goes', 'going']);
  assert.equal(clozeResult.selectedAnswer, 'goes');
});

test('preserves sentence correction fixture', async () => {
  const fake = createFakeSolver(validResponse('sentence', {
    correctedSentence: 'She goes to school every day.',
    grammarPoint: 'subject-verb agreement'
  }));
  const result = await fake.solver.solve({
    subject: 'english',
    method: 'sentence',
    question: 'Correct: She go to school every day.'
  });

  assert.equal(result.correctedSentence, 'She goes to school every day.');
  assert.equal(result.grammarPoint, 'subject-verb agreement');
});

test('rejects an empty question before calling AI', async () => {
  const fake = createFakeSolver(validResponse('grammar'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'english',
      method: 'grammar',
      question: '   '
    }),
    (error) => error.code === 'ENGLISH_QUESTION_REQUIRED'
  );
  assert.equal(fake.calls, 0);
});

test('rejects a non-English subject before calling AI', async () => {
  const fake = createFakeSolver(validResponse('auto'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'chinese',
      method: 'auto',
      question: 'A question'
    }),
    (error) => error.code === 'ENGLISH_SUBJECT_REQUIRED'
  );
  assert.equal(fake.calls, 0);
});

test('rejects an invalid method before calling AI', async () => {
  const fake = createFakeSolver(validResponse('grammar'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'english',
      method: 'kcl',
      question: 'A question'
    }),
    (error) => error.code === 'ENGLISH_METHOD_INVALID'
  );
  assert.equal(fake.calls, 0);
});

test('handles malformed AI JSON predictably', async () => {
  const fake = createFakeSolver('{not-json');

  await assert.rejects(
    fake.solver.solve({
      subject: 'english',
      method: 'auto',
      question: 'A question'
    }),
    (error) => error.code === 'ENGLISH_AI_INVALID_JSON'
  );
  assert.equal(fake.calls, 1);
});

for (const missingField of ['steps', 'answer', 'explanation']) {
  test(`rejects an AI result without ${missingField}`, async () => {
    const response = {
      subject: 'english',
      method: 'grammar',
      steps: ['Analyze the sentence'],
      answer: 'The corrected form is valid.',
      explanation: 'The rule supports the correction.'
    };
    delete response[missingField];
    const fake = createFakeSolver(JSON.stringify(response));

    await assert.rejects(
      fake.solver.solve({
        subject: 'english',
        method: 'grammar',
        question: 'A question'
      }),
      (error) => error.code === 'ENGLISH_AI_INVALID_RESULT'
    );
  });
}

test('rejects an AI result with an incorrect subject', async () => {
  const fake = createFakeSolver(validResponse('grammar', {
    subject: 'math'
  }));

  await assert.rejects(
    fake.solver.solve({
      subject: 'english',
      method: 'grammar',
      question: 'A question'
    }),
    (error) => error.code === 'ENGLISH_AI_INVALID_RESULT'
  );
});

test('rejects an AI result with an incorrect method', async () => {
  const fake = createFakeSolver(validResponse('reading'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'english',
      method: 'grammar',
      question: 'A question'
    }),
    (error) => error.code === 'ENGLISH_AI_INVALID_RESULT'
  );
});

test('validation failure does not call AI', async () => {
  const fake = createFakeSolver(validResponse('grammar'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'english',
      method: 'invalid',
      question: ''
    })
  );
  assert.equal(fake.calls, 0);
});
