import { SUBMISSION_STATUS_LABEL, type SubmissionStatus } from '@missngoc/core';
import { bandFor, COLUMN_TITLES, COLUMN_WIDTHS, type ReportTemplateConfig } from './report-template';

export interface CellStyle {
  fill?: string;
  font?: string;
  bold?: boolean;
}

export interface GridColumn {
  key: string;
  title: string;
  width: number;
  question?: number;
}

export interface GridCell {
  value: string | number | null;
  style?: CellStyle;
}

export interface GridRow {
  key: string;
  studentId: string;
  submissionId: string | null;
  status: SubmissionStatus;
  style?: CellStyle;
  cells: Record<string, GridCell>;
}

export interface ReportGrid {
  title: string;
  subtitle: string;
  header: CellStyle;
  columns: GridColumn[];
  rows: GridRow[];
  bands: ReportTemplateConfig['scoreBands'];
  maxScore: number;
  summary: { total: number; graded: number; needsReview: number; absent: number; missing: number; average: number | null; max: number | null; min: number | null };
}

export interface ReportStudent {
  studentId: string;
  studentCode: string;
  fullName: string;
  submissionId: string | null;
  status: SubmissionStatus;
  versionCode: string | null;
  score: number | null;
  correctCount: number | null;
  answers: Map<number, { finalChoice: string | null; isCorrect: boolean | null }>;
}

export interface ReportExam {
  title: string;
  className: string;
  examDate: Date;
  questionCount: number;
  maxScore: number;
  textQuestions?: number[]; // câu điền từ cần cột rộng hơn
}

const NOTE_FOR: Partial<Record<SubmissionStatus, string>> = {
  NO_IMAGE: 'Chưa có ảnh',
  UPLOADED: 'Chưa chấm',
  QUEUED: 'Đang chấm',
  PROCESSING: 'Đang chấm',
  NEEDS_REVIEW: 'Cần duyệt',
  FAILED: 'Lỗi, cần chấm lại',
  ABSENT: 'Vắng',
};

/**
 * Một lưới dùng chung: web vẽ bằng Antd Table, Excel đưa cho exceljs.
 * Hai nơi cùng đọc một nguồn nên luôn khớp nhau.
 */
export function buildReportGrid(exam: ReportExam, students: ReportStudent[], config: ReportTemplateConfig): ReportGrid {
  const columns: GridColumn[] = config.columns.map((key) => ({ key, title: COLUMN_TITLES[key], width: COLUMN_WIDTHS[key] }));
  if (config.showPerQuestion) {
    const isText = new Set(exam.textQuestions ?? []);
    for (let q = 1; q <= exam.questionCount; q++) {
      columns.push({ key: `q${q}`, title: String(q), width: isText.has(q) ? 12 : 4, question: q });
    }
  }

  const rows: GridRow[] = students.map((s, i) => {
    const hasResult = s.score !== null;
    const band = hasResult ? bandFor(config, s.score!, exam.maxScore) : null;
    const cells: Record<string, GridCell> = {
      stt: { value: i + 1 },
      studentCode: { value: s.studentCode },
      fullName: { value: s.fullName },
      versionCode: { value: s.versionCode || null },
      correctCount: { value: hasResult ? s.correctCount : null },
      score: { value: hasResult ? s.score : null, style: band ? { fill: band.fill, font: band.font } : undefined },
      rank: { value: band?.label ?? null },
      note: { value: s.status === 'GRADED' ? null : (NOTE_FOR[s.status] ?? SUBMISSION_STATUS_LABEL[s.status]) },
    };
    if (config.showPerQuestion && s.answers.size > 0) {
      for (let q = 1; q <= exam.questionCount; q++) {
        const a = s.answers.get(q);
        if (!a) continue;
        if (a.finalChoice === null) cells[`q${q}`] = { value: '–', style: { ...config.blankCell } };
        else if (a.isCorrect === false) cells[`q${q}`] = { value: a.finalChoice, style: { ...config.wrongCell } };
        else cells[`q${q}`] = { value: a.finalChoice };
      }
    }
    return {
      key: s.studentId,
      studentId: s.studentId,
      submissionId: s.submissionId,
      status: s.status,
      style: s.status === 'NEEDS_REVIEW' ? { fill: config.needsReviewRow.fill } : undefined,
      cells,
    };
  });

  const scores = students.filter((s) => s.score !== null && s.status === 'GRADED').map((s) => s.score!);
  const average = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : null;
  const dd = String(exam.examDate.getUTCDate()).padStart(2, '0');
  const mm = String(exam.examDate.getUTCMonth() + 1).padStart(2, '0');

  return {
    title: config.title.replace('{className}', exam.className).replace('{examTitle}', exam.title),
    subtitle: `Ngày kiểm tra: ${dd}/${mm}/${exam.examDate.getUTCFullYear()} · ${exam.questionCount} câu · Thang điểm ${exam.maxScore}`,
    header: { fill: config.header.fill, font: config.header.font, bold: config.header.bold },
    columns,
    rows,
    bands: config.scoreBands,
    maxScore: exam.maxScore,
    summary: {
      total: students.length,
      graded: scores.length,
      needsReview: students.filter((s) => s.status === 'NEEDS_REVIEW').length,
      absent: students.filter((s) => s.status === 'ABSENT').length,
      missing: students.filter((s) => s.status === 'NO_IMAGE').length,
      average,
      max: scores.length ? Math.max(...scores) : null,
      min: scores.length ? Math.min(...scores) : null,
    },
  };
}
