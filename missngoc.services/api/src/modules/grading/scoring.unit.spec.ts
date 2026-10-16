import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKeyAnswer } from '@missngoc/core';
import { defaultPoints, kindConflicts, missingQuestions, scoreSubmission } from './scoring';
import { buildPrompt } from './engines/prompt';
import { normalizeSheet } from './engines/normalize';

test('chấm đúng số câu và điểm', () => {
  const key = [
    { q: 1, correct: ['A'], points: 2.5 },
    { q: 2, correct: ['B'], points: 2.5 },
    { q: 3, correct: ['C', 'D'], points: 2.5 },
    { q: 4, correct: ['A'], points: 2.5 },
  ];
  const r = scoreSubmission(
    [
      { q: 1, finalChoice: 'A' },
      { q: 2, finalChoice: 'C' },
      { q: 3, finalChoice: 'D' },
      { q: 4, finalChoice: null },
    ],
    key,
  );
  assert.equal(r.correctCount, 2);
  assert.equal(r.score, 5);
  assert.deepEqual(
    r.perQuestion.map((p) => p.isCorrect),
    [true, false, true, false],
  );
});

test('làm tròn điểm, không lỗi số thực', () => {
  const pts = defaultPoints(10, 3);
  assert.equal(pts, 3.333);
  const key = [1, 2, 3].map((q) => ({ q, correct: ['A'], points: pts }));
  const r = scoreSubmission(key.map((k) => ({ q: k.q, finalChoice: 'A' })), key);
  assert.equal(r.score, 10);
});

test('phát hiện câu thiếu trong đáp án', () => {
  assert.deepEqual(missingQuestions([{ q: 1 }, { q: 3 }], 4), [2, 4]);
});

test('normalizeSheet: thiếu câu, trùng câu, lựa chọn ngoài bộ đều thành unclear', () => {
  const sheet = normalizeSheet(
    {
      studentNameRead: '  Nguyễn  Văn An ',
      versionCodeRead: '',
      answers: [
        { q: 1, choice: 'A', status: 'clear' },
        { q: 2, choice: 'E', status: 'clear' }, // bài chỉ có A–D
        { q: 3, choice: 'B', status: 'clear' },
        { q: 3, choice: 'C', status: 'clear' }, // trùng câu, khác nhau
        { q: 5, choice: null, status: 'clear' }, // clear mà không có lựa chọn
        { q: 9, choice: 'A', status: 'clear' }, // ngoài số câu
      ],
    },
    5,
    ['A', 'B', 'C', 'D'],
  );
  assert.equal(sheet.studentNameRead, 'Nguyễn Văn An');
  assert.equal(sheet.versionCodeRead, null);
  assert.equal(sheet.answers.length, 5);
  assert.deepEqual(sheet.answers[0], { q: 1, choice: 'A', status: 'clear' });
  assert.equal(sheet.answers[1].status, 'unclear');
  assert.equal(sheet.answers[2].status, 'unclear');
  assert.equal(sheet.answers[3].status, 'unclear'); // câu 4 thiếu
  assert.equal(sheet.answers[4].status, 'unclear');
});

test('normalizeSheet: blank có lựa chọn thành unclear, multiple bỏ lựa chọn', () => {
  const sheet = normalizeSheet(
    {
      studentNameRead: null,
      versionCodeRead: '101',
      answers: [
        { q: 1, choice: 'B', status: 'blank' },
        { q: 2, choice: 'B', status: 'multiple' },
      ],
    },
    2,
    ['A', 'B', 'C', 'D'],
  );
  assert.deepEqual(sheet.answers, [
    { q: 1, choice: 'B', status: 'unclear' },
    { q: 2, choice: null, status: 'multiple' },
  ]);
});

test('điền từ: bỏ hoa/thường, khoảng trắng, dấu chấm cuối; sai chính tả vẫn sai', () => {
  const key = [
    { q: 1, kind: 'text' as const, correct: ['twice'], points: 1 },
    { q: 2, kind: 'text' as const, correct: ['eight hours', '8 hours'], points: 1 },
    { q: 3, kind: 'text' as const, correct: ['creativity'], points: 1 },
    { q: 4, kind: 'text' as const, correct: ["don't"], points: 1 },
    { q: 5, kind: 'text' as const, correct: ['useful'], points: 1 },
  ];
  const r = scoreSubmission(
    [
      { q: 1, finalChoice: ' Twice. ' },
      { q: 2, finalChoice: '8  hours' },
      { q: 3, finalChoice: 'creativty' },
      { q: 4, finalChoice: 'don’t' },
      { q: 5, finalChoice: '' },
    ],
    key,
  );
  assert.deepEqual(
    r.perQuestion.map((p) => p.isCorrect),
    [true, true, false, true, false],
  );
});

test('parseKeyAnswer: chữ cái là trắc nghiệm, còn lại là điền từ', () => {
  assert.deepEqual(parseKeyAnswer('c', 'ABCD'), { kind: 'choice', correct: ['C'] });
  assert.deepEqual(parseKeyAnswer('C, a', 'ABCD'), { kind: 'choice', correct: ['A', 'C'] });
  assert.ok('error' in parseKeyAnswer('E', 'ABCD'));
  assert.deepEqual(parseKeyAnswer('eight hours | 8 hours', 'ABCD'), { kind: 'text', correct: ['eight hours', '8 hours'] });
  assert.deepEqual(parseKeyAnswer('an', 'ABCD'), { kind: 'text', correct: ['an'] });
});

test('kindConflicts: cùng một câu nhưng khác loại ở hai mã đề', () => {
  const keys = [
    { versionCode: '101', items: [{ q: 1, kind: 'choice' as const }, { q: 2, kind: 'text' as const }] },
    { versionCode: '102', items: [{ q: 1, kind: 'choice' as const }, { q: 2, kind: 'choice' as const }] },
  ];
  const out = kindConflicts(keys);
  assert.equal(out.length, 1);
  assert.match(out[0], /Câu 2 là câu điền từ ở mã đề 101/);
});

test('normalizeSheet: câu điền từ lấy text, bỏ choice; clear mà không có chữ thành unclear', () => {
  const sheet = normalizeSheet(
    {
      studentNameRead: null,
      versionCodeRead: null,
      answers: [
        { q: 1, choice: 'B', status: 'clear' },
        { q: 2, choice: null, text: '  creativty ', status: 'clear' },
        { q: 3, choice: 'A', text: null, status: 'clear' }, // câu điền từ mà AI trả chữ cái
        { q: 4, choice: null, text: null, status: 'blank' },
      ],
    },
    4,
    ['A', 'B', 'C', 'D'],
    [2, 3, 4],
  );
  assert.deepEqual(sheet.answers, [
    { q: 1, choice: 'B', status: 'clear' },
    { q: 2, choice: null, text: 'creativty', status: 'clear' },
    { q: 3, choice: null, text: null, status: 'unclear' },
    { q: 4, choice: null, text: null, status: 'blank' },
  ]);
});

test('prompt: báo các câu điền từ và bắt chép nguyên văn', () => {
  const options: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
  const p = buildPrompt({ images: [], questionCount: 41, options, textQuestions: [5, 6, 7, 8, 18, 19, 20, 21] });
  assert.match(p, /Fill-in questions: 5-8, 18-21\./);
  assert.match(p, /Never fix spelling/);
  assert.doesNotMatch(buildPrompt({ images: [], questionCount: 40, options }), /Fill-in/);
});
