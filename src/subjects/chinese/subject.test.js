import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createChineseSolver,
  createSubjectModule,
  subjectId
} from './index.js';

test('chinese module loads', () => {
  assert.equal(subjectId, 'chinese');
  assert.equal(createSubjectModule().subjectId, 'chinese');
  assert.equal(typeof createSubjectModule().createChineseSolver, 'function');
});

function createFakeSolver(responseText) {
  let calls = 0;
  const requests = [];
  const solver = createChineseSolver({
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
    subject: 'chinese',
    method,
    steps: ['Identify the question type', 'Analyze the relevant evidence'],
    answer: 'The answer follows from the text.',
    explanation: 'The reasoning is based on the supplied question.',
    ...overrides
  });
}

for (const method of [
  'auto',
  'reading',
  'classical_chinese',
  'vocabulary',
  'idiom',
  'literature',
  'grammar'
]) {
  test(`solves Chinese with ${method}`, async () => {
    const actualMethod = method === 'auto' ? 'reading' : method;
    const fake = createFakeSolver(validResponse(actualMethod));
    const result = await fake.solver.solve({
      subject: 'chinese',
      method,
      question: 'Analyze this Chinese question.'
    });

    assert.equal(result.subject, 'chinese');
    assert.equal(result.method, actualMethod);
    assert.equal(result.steps.length, 2);
    assert.equal(result.answer, 'The answer follows from the text.');
    assert.match(result.explanation, /reasoning/);
    assert.equal(fake.calls, 1);
    assert.match(fake.requests[0].contents, /Return only valid JSON/);
  });
}

test('preserves reading fixture evidence and conclusion', async () => {
  const fake = createFakeSolver(validResponse('reading', {
    steps: [
      'Keyword: perseverance',
      'Evidence: the supplied passage says the speaker continued despite difficulty',
      'Context: the final sentence reinforces the change in attitude'
    ],
    evidence: ['the speaker continued despite difficulty'],
    conclusion: 'The passage emphasizes perseverance.'
  }));
  const result = await fake.solver.solve({
    subject: 'chinese',
    method: 'reading',
    question: 'According to the supplied passage, what is the main idea?'
  });

  assert.match(result.steps[1], /Evidence/);
  assert.deepEqual(result.evidence, [
    'the speaker continued despite difficulty'
  ]);
  assert.equal(result.conclusion, 'The passage emphasizes perseverance.');
});

test('preserves classical Chinese fixture', async () => {
  const fake = createFakeSolver(validResponse('classical_chinese', {
    originalText: '學而時習之',
    translation: '學習之後要按時溫習。',
    vocabulary: [{ word: '時', meaning: '按時' }]
  }));
  const result = await fake.solver.solve({
    subject: 'chinese',
    method: 'classical_chinese',
    question: 'Translate and explain the supplied classical sentence.'
  });

  assert.equal(result.originalText, '學而時習之');
  assert.equal(result.translation, '學習之後要按時溫習。');
  assert.deepEqual(result.vocabulary, [{ word: '時', meaning: '按時' }]);
});

test('preserves vocabulary and idiom fixture fields', async () => {
  const vocabulary = createFakeSolver(validResponse('vocabulary', {
    word: '兼顧',
    meaning: '同時照顧兩方面',
    example: '他努力兼顧學業與休息'
  }));
  const vocabularyResult = await vocabulary.solver.solve({
    subject: 'chinese',
    method: 'vocabulary',
    question: 'Explain the word 兼顧.'
  });
  assert.equal(vocabularyResult.word, '兼顧');
  assert.equal(vocabularyResult.meaning, '同時照顧兩方面');
  assert.match(vocabularyResult.example, /學業/);

  const idiom = createFakeSolver(validResponse('idiom', {
    idiom: '畫龍點睛',
    meaning: '在關鍵處加上精妙的一筆',
    usage: '用於形容文章或作品的關鍵修飾'
  }));
  const idiomResult = await idiom.solver.solve({
    subject: 'chinese',
    method: 'idiom',
    question: 'Explain the idiom 畫龍點睛.'
  });
  assert.equal(idiomResult.idiom, '畫龍點睛');
  assert.match(idiomResult.usage, /關鍵/);
});

test('preserves literature fixture', async () => {
  const fake = createFakeSolver(validResponse('literature', {
    author: 'Unknown in supplied question',
    work: 'Supplied text',
    literaryContext: 'Describe only context supported by the prompt.'
  }));
  const result = await fake.solver.solve({
    subject: 'chinese',
    method: 'literature',
    question: 'Analyze the literary features of the supplied work.'
  });

  assert.equal(result.author, 'Unknown in supplied question');
  assert.equal(result.work, 'Supplied text');
  assert.match(result.literaryContext, /supported/);
});

test('preserves grammar fixture', async () => {
  const fake = createFakeSolver(validResponse('grammar', {
    grammarPoint: '把字句',
    examples: ['他把書放在桌上。']
  }));
  const result = await fake.solver.solve({
    subject: 'chinese',
    method: 'grammar',
    question: 'Explain the grammar point in this sentence.'
  });

  assert.equal(result.grammarPoint, '把字句');
  assert.deepEqual(result.examples, ['他把書放在桌上。']);
});

test('rejects an empty question before calling AI', async () => {
  const fake = createFakeSolver(validResponse('reading'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'chinese',
      method: 'reading',
      question: '   '
    }),
    (error) => error.code === 'CHINESE_QUESTION_REQUIRED'
  );
  assert.equal(fake.calls, 0);
});

test('rejects a non-Chinese subject before calling AI', async () => {
  const fake = createFakeSolver(validResponse('auto'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'math',
      method: 'auto',
      question: 'A question'
    }),
    (error) => error.code === 'CHINESE_SUBJECT_REQUIRED'
  );
  assert.equal(fake.calls, 0);
});

test('rejects an invalid method before calling AI', async () => {
  const fake = createFakeSolver(validResponse('reading'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'chinese',
      method: 'kcl',
      question: 'A question'
    }),
    (error) => error.code === 'CHINESE_METHOD_INVALID'
  );
  assert.equal(fake.calls, 0);
});

test('handles malformed AI JSON predictably', async () => {
  const fake = createFakeSolver('{not-json');

  await assert.rejects(
    fake.solver.solve({
      subject: 'chinese',
      method: 'auto',
      question: 'A question'
    }),
    (error) => error.code === 'CHINESE_AI_INVALID_JSON'
  );
  assert.equal(fake.calls, 1);
});

for (const missingField of ['steps', 'answer', 'explanation']) {
  test(`rejects an AI result without ${missingField}`, async () => {
    const response = {
      subject: 'chinese',
      method: 'reading',
      steps: ['Analyze the supplied text'],
      answer: 'The result follows from the text.',
      explanation: 'This is supported by the supplied evidence.'
    };
    delete response[missingField];
    const fake = createFakeSolver(JSON.stringify(response));

    await assert.rejects(
      fake.solver.solve({
        subject: 'chinese',
        method: 'reading',
        question: 'A question'
      }),
      (error) => error.code === 'CHINESE_AI_INVALID_RESULT'
    );
  });
}

test('rejects an AI result with an incorrect subject', async () => {
  const fake = createFakeSolver(validResponse('reading', {
    subject: 'math'
  }));

  await assert.rejects(
    fake.solver.solve({
      subject: 'chinese',
      method: 'reading',
      question: 'A question'
    }),
    (error) => error.code === 'CHINESE_AI_INVALID_RESULT'
  );
});

test('rejects an AI result with an incorrect method', async () => {
  const fake = createFakeSolver(validResponse('literature'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'chinese',
      method: 'reading',
      question: 'A question'
    }),
    (error) => error.code === 'CHINESE_AI_INVALID_RESULT'
  );
});

test('validation failure does not call AI', async () => {
  const fake = createFakeSolver(validResponse('reading'));

  await assert.rejects(
    fake.solver.solve({
      subject: 'chinese',
      method: 'invalid',
      question: ''
    })
  );
  assert.equal(fake.calls, 0);
});
