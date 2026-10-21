import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGradebook, competitionRanks, dayLabel, weightedAverage } from './gradebook-grid';
import { DEFAULT_GRADEBOOK_TEMPLATE, GradebookTemplateSchema } from './gradebook-template';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

test('điểm trung bình có hệ số, quy về thang 10', () => {
  // Kiểm tra buổi 6/10 x1, cuối unit 8/10 x2, midterm 45/50 (=9) x3 → (6 + 16 + 27) / 6
  const avg = weightedAverage([
    { score: 6, maxScore: 10, weight: 1 },
    { score: 8, maxScore: 10, weight: 2 },
    { score: 45, maxScore: 50, weight: 3 },
  ]);
  assert.equal(avg, 49 / 6);
  assert.equal(weightedAverage([]), null);
  assert.equal(weightedAverage([{ score: 5, maxScore: 10, weight: 0 }]), null);
});

test('xếp hạng bằng điểm thì cùng hạng, hạng sau nhảy cách', () => {
  assert.deepEqual(competitionRanks([7.1, 6.3, 7.1, null, 5]), [1, 3, 1, null, 4]);
});

test('nhãn ngày theo thứ Việt Nam', () => {
  assert.equal(dayLabel(d('2026-10-10')), 'T7 10/10');
  assert.equal(dayLabel(d('2026-10-11')), 'CN 11/10');
});

test('sổ điểm: cột theo ngày, vắng thi không tính, tô điểm dưới 5, đếm buổi có mặt', () => {
  const t = DEFAULT_GRADEBOOK_TEMPLATE;
  const g = buildGradebook(
    {
      className: '7A',
      periodLabel: 'T10/2026',
      students: [
        { id: 's1', studentCode: 'HS1', fullName: 'An', inClass: true },
        { id: 's2', studentCode: 'HS2', fullName: 'Bình', inClass: true },
      ],
      sessions: [
        { id: 'b3', date: d('2026-10-10'), number: 3, note: null },
        { id: 'b4', date: d('2026-10-11'), number: 4, note: null },
      ],
      exams: [
        { id: 'e1', title: 'Unit 2', date: d('2026-10-10'), gradingMode: 'AI', maxScore: 10, weight: 2, categoryName: 'Cuối unit', headerFill: '#FFD966', headerFont: '#000000' },
        { id: 'e2', title: 'Nói', date: d('2026-10-12'), gradingMode: 'MANUAL', maxScore: 10, weight: 1, categoryName: null, headerFill: '#E2EFDA', headerFont: '#000000' },
      ],
      scores: [
        { examId: 'e1', studentId: 's1', submissionId: 'x1', status: 'GRADED', score: 4 },
        { examId: 'e2', studentId: 's1', submissionId: 'x2', status: 'GRADED', score: 7 },
        { examId: 'e1', studentId: 's2', submissionId: 'x3', status: 'ABSENT', score: null },
        { examId: 'e2', studentId: 's2', submissionId: 'x4', status: 'GRADED', score: 9 },
      ],
      attendances: [
        { sessionId: 'b3', studentId: 's1', status: 'O', homework: 'D' },
        { sessionId: 'b4', studentId: 's1', status: 'K', homework: null },
        { sessionId: 'b3', studentId: 's2', status: 'L', homework: 'ND' },
      ],
    },
    t,
  );

  assert.deepEqual(
    g.columns.map((c) => c.key),
    ['stt', 'fullName', 'average', 'rank', 'att:b3', 'hw:b3', 'score:e1', 'att:b4', 'hw:b4', 'score:e2', 'total'],
  );
  assert.equal(g.columns.find((c) => c.key === 'att:b3')?.title, 'B3');
  assert.equal(g.columns.find((c) => c.key === 'score:e1')?.subtitle, 'T7 10/10 · x2');

  const [an, binh] = g.rows;
  // An: (2×4 + 1×7) / 3 = 5
  assert.equal(an.cells.average.value, 5);
  assert.equal(an.cells['score:e1'].style?.fill, t.lowScore.fill);
  assert.equal(an.cells.total.value, 1); // O có mặt, K vắng
  // Bình vắng bài Unit 2: chỉ tính bài Nói
  assert.equal(binh.cells['score:e1'].value, 'V');
  assert.equal(binh.cells.average.value, 9);
  assert.equal(binh.cells.total.value, 1); // L học bù tính là có mặt
  assert.equal(binh.cells.rank.value, 1);
  assert.equal(an.cells.rank.value, 2);
});

test('mẫu sổ điểm mặc định hợp lệ, mã trùng bị từ chối', () => {
  assert.equal(GradebookTemplateSchema.safeParse(DEFAULT_GRADEBOOK_TEMPLATE).success, true);
  const dup = { ...DEFAULT_GRADEBOOK_TEMPLATE, homeworkCodes: [{ code: 'D', label: 'a' }, { code: 'D', label: 'b' }] };
  assert.equal(GradebookTemplateSchema.safeParse(dup).success, false);
});
