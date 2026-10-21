import type { AnswerKeyGrid, ExamRow } from '../../api/types';

const quote = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** [5, 6, 7, 8, 18] → "5-8, 18" */
function ranges(qs: number[]): string {
  const sorted = [...new Set(qs)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    while (i + 1 < sorted.length && sorted[i + 1] === sorted[i] + 1) i++;
    parts.push(start === sorted[i] ? String(start) : `${start}-${sorted[i]}`);
  }
  return parts.join(', ');
}

/** Các dòng đáp án: câu trắc nghiệm liền nhau gộp thành một dòng tối đa 10 câu, câu điền từ mỗi câu một dòng */
function keyLines(items: AnswerKeyGrid['items']): string[] {
  const lines: string[] = [];
  const sorted = [...items].sort((a, b) => a.q - b.q);
  let run: typeof sorted = [];
  const flush = () => {
    if (!run.length) return;
    const head = run.length === 1 ? `${run[0].q}` : `${run[0].q}-${run[run.length - 1].q}`;
    lines.push(`    ${head.padEnd(6)} ${run.map((it) => it.correct.join('/')).join(' ')}`);
    run = [];
  };
  for (const it of sorted) {
    if (it.kind === 'text') {
      flush();
      lines.push(`    ${String(it.q).padEnd(6)} ${it.correct.map(quote).join(' / ')}`);
    } else {
      if (run.length && (run[run.length - 1].q !== it.q - 1 || run.length === 10)) flush();
      run.push(it);
    }
  }
  flush();
  return lines;
}

/** File mẫu cho bài mới: chưa có đáp án, nên trình biên dịch báo ngay câu nào còn thiếu */
export function newExamSource(title: string): string {
  return [
    '// Bài mới. Sửa số câu, các phần rồi ghi đáp án; lỗi hiện ngay bên dưới.',
    `exam ${quote(title || 'Bài kiểm tra mới')} {`,
    '  questions 20',
    '  options   A B C D',
    '  max       10',
    '',
    '  section Grammar   1-10   choice',
    '  section Reading   11-20  choice  weight 2',
    '',
    '  key {',
    '    // Ghi đáp án, ví dụ:  1-10  B A C D A B D C A B',
    '    // Câu điền từ: khai báo phần text, rồi ghi  12  "eight hours" / "8 hours"',
    '  }',
    '}',
    '',
    'review {',
    '  flag "AI không chắc"  when answer.status in [unclear, multiple]',
    '  flag "Tên không khớp" when submission.nameMismatch',
    '  flag "Không rõ mã đề" when not submission.versionKnown',
    '}',
    '',
  ].join('\n');
}

const num = (x: number) => String(+x.toFixed(3));

/**
 * Các phần để giữ đúng loại câu và điểm từng câu đang có trong app: gom câu cùng loại, cùng điểm.
 * Tổng điểm bằng thang điểm thì ghi `score` (tái tạo đúng từng câu), không thì ghi `weight` theo tỉ lệ.
 */
function sectionLines(items: AnswerKeyGrid['items'], maxScore: number): string[] {
  const groups = new Map<string, { kind: 'choice' | 'text'; points: number; qs: number[] }>();
  for (const it of items) {
    const key = `${it.kind}|${it.points}`;
    const g = groups.get(key) ?? { kind: it.kind, points: it.points, qs: [] };
    g.qs.push(it.q);
    groups.set(key, g);
  }
  const list = [...groups.values()].sort((a, b) => Math.min(...a.qs) - Math.min(...b.qs));
  const samePoints = new Set(list.map((g) => g.points)).size === 1;
  if (samePoints && list.every((g) => g.kind === 'choice')) return []; // đều trắc nghiệm, chia đều: không cần phần
  const total = list.reduce((s, g) => s + g.points * g.qs.length, 0);
  const useScore = !samePoints && Math.abs(total - maxScore) < 1e-6;
  const minPoints = Math.min(...list.map((g) => g.points)) || 1;
  const perKind = { choice: 0, text: 0 };
  const lines = list.map((g) => {
    const base = g.kind === 'text' ? 'Điền từ' : 'Trắc nghiệm';
    const count = list.filter((x) => x.kind === g.kind).length;
    const name = count > 1 ? `${base} ${++perKind[g.kind]}` : base;
    const mod = samePoints ? '' : useScore ? `  score ${num(g.points * g.qs.length)}` : `  weight ${num(g.points / minPoints)}`;
    return `  section ${quote(name).padEnd(16)} ${ranges(g.qs).padEnd(14)} ${g.kind.padEnd(6)}${mod}`;
  });
  return ['', ...lines];
}

/**
 * Dựng file .exam từ thông tin bài và đáp án đang có trong app, cho bài chưa từng soạn bằng ExamDSL.
 * Các phần dựng sao cho lưu lại không làm đổi loại câu và điểm từng câu.
 */
export function sourceFromApp(exam: ExamRow, keys: AnswerKeyGrid[]): string {
  const out: string[] = ['// Tạo từ thông tin và đáp án đang có trong app. Sửa xong bấm "Lưu vào bài kiểm tra".'];
  const versions = keys.map((k) => k.versionCode).filter(Boolean);
  const first = keys[0]?.items ?? [];

  out.push(`exam ${quote(exam.title)} {`);
  out.push(`  questions ${exam.questionCount}`);
  out.push(`  options   ${exam.options.split('').join(' ')}`);
  out.push(`  max       ${exam.maxScore}`);
  if (versions.length) out.push(`  versions  ${versions.join(' ')}`);
  if (exam.layoutHint) out.push(`  layout    ${quote(exam.layoutHint)}`);
  out.push(...sectionLines(first, exam.maxScore));
  if (keys.length === 0) {
    out.push('', '  key {', `    // Ghi đáp án câu 1 đến ${exam.questionCount}, ví dụ: 1-10  B A C D A B D C A B`, '  }');
  }
  for (const k of keys) {
    out.push('', `  key${k.versionCode ? ' ' + k.versionCode : ''} {`, ...keyLines(k.items), '  }');
  }
  out.push('}', '');
  out.push(
    'review {',
    '  flag "AI không chắc"  when answer.status in [unclear, multiple]',
    '  flag "Tên không khớp" when submission.nameMismatch',
    '  flag "Không rõ mã đề" when not submission.versionKnown',
    '}',
    '',
  );
  return out.join('\n');
}
