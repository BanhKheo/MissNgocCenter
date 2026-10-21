import type { GradingMode, SubmissionStatus } from '@missngoc/core';
import type { GradebookTemplate } from './gradebook-template';

export interface GbStyle {
  fill?: string;
  font?: string;
  bold?: boolean;
}

export type GbColumnKind = 'stt' | 'studentCode' | 'fullName' | 'average' | 'rank' | 'attendance' | 'homework' | 'score' | 'total';

export interface GbColumn {
  key: string;
  kind: GbColumnKind;
  title: string;
  /** Dòng thứ hai của tiêu đề: thứ, ngày, hệ số */
  subtitle?: string;
  width: number;
  header: { fill: string; font: string };
  sessionId?: string;
  examId?: string;
  gradingMode?: GradingMode;
  maxScore?: number;
  weight?: number;
}

export interface GbCell {
  value: string | number | null;
  style?: GbStyle;
  submissionId?: string | null;
  /** Điểm AI chấm còn chờ duyệt, có thể còn đổi */
  pending?: boolean;
}

export interface GbRow {
  key: string;
  studentId: string;
  inClass: boolean;
  cells: Record<string, GbCell>;
}

export interface Gradebook {
  title: string;
  subtitle: string;
  columns: GbColumn[];
  rows: GbRow[];
  attendanceCodes: GradebookTemplate['attendanceCodes'];
  homeworkCodes: GradebookTemplate['homeworkCodes'];
  lowScore: GradebookTemplate['lowScore'];
  scoreColumnFill: string;
  averageDecimals: number;
}

export interface GbStudent {
  id: string;
  studentCode: string;
  fullName: string;
  inClass: boolean;
}

export interface GbSession {
  id: string;
  date: Date;
  /** Số thứ tự buổi trong cả khoá, không đổi khi lọc theo tháng */
  number: number;
  note: string | null;
}

export interface GbExam {
  id: string;
  title: string;
  date: Date;
  gradingMode: GradingMode;
  maxScore: number;
  weight: number;
  categoryName: string | null;
  headerFill: string;
  headerFont: string;
}

export interface GbScore {
  examId: string;
  studentId: string;
  submissionId: string | null;
  status: SubmissionStatus;
  score: number | null;
}

export interface GbAttendance {
  sessionId: string;
  studentId: string;
  status: string | null;
  homework: string | null;
}

const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const PENDING_FONT = '#808080';

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const pad = (n: number) => String(n).padStart(2, '0');
/** "T7 10/10": thứ và ngày, theo ngày lưu trong database (cột date, không có giờ) */
export const dayLabel = (d: Date) => `${WEEKDAY[d.getUTCDay()]} ${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}`;
const fmtWeight = (w: number) => (Number.isInteger(w) ? String(w) : w.toFixed(2).replace(/0+$/, ''));
const round = (v: number, decimals: number) => Math.round(v * 10 ** decimals) / 10 ** decimals;

/** Điểm quy về thang 10 để so ngưỡng và tính trung bình */
const toTen = (score: number, max: number) => (max > 0 ? (score / max) * 10 : score);

/**
 * Điểm trung bình có hệ số: Σ(hệ số × điểm thang 10) / Σ hệ số, chỉ tính bài có điểm.
 * Bài vắng hoặc chưa có điểm không tính (không coi là 0).
 */
export function weightedAverage(items: { score: number; maxScore: number; weight: number }[]): number | null {
  const counted = items.filter((i) => i.weight > 0);
  const totalWeight = counted.reduce((s, i) => s + i.weight, 0);
  if (totalWeight === 0) return null;
  return counted.reduce((s, i) => s + i.weight * toTen(i.score, i.maxScore), 0) / totalWeight;
}

/** Xếp hạng kiểu 1, 2, 2, 4: bằng điểm (sau khi làm tròn như hiển thị) thì cùng hạng */
export function competitionRanks(values: (number | null)[]): (number | null)[] {
  const sorted = values.filter((v): v is number => v !== null).sort((a, b) => b - a);
  return values.map((v) => (v === null ? null : sorted.indexOf(v) + 1));
}

export function buildGradebook(
  input: {
    className: string;
    periodLabel: string;
    students: GbStudent[];
    sessions: GbSession[];
    exams: GbExam[];
    scores: GbScore[];
    attendances: GbAttendance[];
  },
  t: GradebookTemplate,
): Gradebook {
  const { students, sessions, exams } = input;
  const main = t.header;
  const columns: GbColumn[] = [{ key: 'stt', kind: 'stt', title: 'STT', width: 5, header: main }];
  if (t.showStudentCode) columns.push({ key: 'studentCode', kind: 'studentCode', title: 'Mã HS', width: 10, header: main });
  columns.push(
    { key: 'fullName', kind: 'fullName', title: 'Họ và tên', width: 24, header: main },
    { key: 'average', kind: 'average', title: 'Điểm trung bình', width: 9, header: main },
    { key: 'rank', kind: 'rank', title: 'Xếp hạng', width: 8, header: main },
  );

  // Gom theo ngày: buổi học (điểm danh, bài tập) rồi đến các bài kiểm tra cùng ngày
  const days = [...new Set([...sessions.map((s) => dayKey(s.date)), ...exams.map((e) => dayKey(e.date))])].sort();
  for (const day of days) {
    const session = sessions.find((s) => dayKey(s.date) === day);
    if (session) {
      columns.push(
        {
          key: `att:${session.id}`,
          kind: 'attendance',
          title: `B${session.number}`,
          subtitle: dayLabel(session.date),
          width: 7,
          header: t.sessionHeader,
          sessionId: session.id,
        },
        { key: `hw:${session.id}`, kind: 'homework', title: 'D/ND', width: 6, header: t.homeworkHeader, sessionId: session.id },
      );
    }
    for (const e of exams.filter((x) => dayKey(x.date) === day)) {
      columns.push({
        key: `score:${e.id}`,
        kind: 'score',
        title: e.title,
        subtitle: `${dayLabel(e.date)} · x${fmtWeight(e.weight)}`,
        width: 9,
        header: { fill: e.headerFill, font: e.headerFont },
        examId: e.id,
        gradingMode: e.gradingMode,
        maxScore: e.maxScore,
        weight: e.weight,
      });
    }
  }
  columns.push({ key: 'total', kind: 'total', title: 'Tổng buổi', subtitle: input.periodLabel, width: 8, header: main });

  const attCode = new Map(t.attendanceCodes.map((c) => [c.code, c]));
  const hwCode = new Map(t.homeworkCodes.map((c) => [c.code, c]));
  const attBy = new Map(input.attendances.map((a) => [`${a.sessionId}:${a.studentId}`, a]));
  const scoreBy = new Map(input.scores.map((s) => [`${s.examId}:${s.studentId}`, s]));
  const examById = new Map(exams.map((e) => [e.id, e]));
  const low = (v: number, max: number) => toTen(v, max) < t.lowScore.below - 1e-9;

  const averages: (number | null)[] = [];
  const rows: GbRow[] = students.map((st, i) => {
    const cells: Record<string, GbCell> = {
      stt: { value: i + 1 },
      studentCode: { value: st.studentCode },
      fullName: { value: st.fullName },
    };
    let present = 0;
    const counted: { score: number; maxScore: number; weight: number }[] = [];

    for (const c of columns) {
      if (c.kind === 'attendance' || c.kind === 'homework') {
        const a = attBy.get(`${c.sessionId}:${st.id}`);
        const value = c.kind === 'attendance' ? (a?.status ?? null) : (a?.homework ?? null);
        const conf = value ? (c.kind === 'attendance' ? attCode.get(value) : hwCode.get(value)) : undefined;
        if (c.kind === 'attendance' && conf && 'present' in conf && conf.present) present++;
        cells[c.key] = { value, style: conf?.fill || conf?.font ? { fill: conf.fill, font: conf.font } : undefined };
      } else if (c.kind === 'score') {
        const e = examById.get(c.examId!)!;
        const s = scoreBy.get(`${e.id}:${st.id}`);
        const base: GbStyle = { fill: t.scoreColumnFill };
        if (s?.status === 'ABSENT') {
          cells[c.key] = { value: 'V', style: base, submissionId: s.submissionId };
        } else if (s && s.score !== null && (s.status === 'GRADED' || s.status === 'NEEDS_REVIEW')) {
          const pending = s.status === 'NEEDS_REVIEW';
          counted.push({ score: s.score, maxScore: e.maxScore, weight: e.weight });
          const style: GbStyle = low(s.score, e.maxScore) ? { fill: t.lowScore.fill, font: t.lowScore.font } : base;
          cells[c.key] = { value: round(s.score, 2), style: pending ? { ...style, font: PENDING_FONT } : style, submissionId: s.submissionId, pending };
        } else {
          cells[c.key] = { value: null, style: base, submissionId: s?.submissionId ?? null };
        }
      }
    }

    const avg = weightedAverage(counted);
    const shown = avg === null ? null : round(avg, t.averageDecimals);
    averages.push(st.inClass ? shown : null);
    cells.average = {
      value: shown,
      style: { bold: true, ...(shown !== null && t.highlightLowAverage && low(shown, 10) ? { fill: t.lowScore.fill, font: t.lowScore.font } : {}) },
    };
    cells.total = { value: present, style: { bold: true } };
    return { key: st.id, studentId: st.id, inClass: st.inClass, cells };
  });

  const ranks = competitionRanks(averages);
  rows.forEach((r, i) => (r.cells.rank = { value: ranks[i] }));

  return {
    title: t.title.replace('{className}', input.className),
    subtitle: `${input.periodLabel} · ${students.filter((s) => s.inClass).length} học sinh · ${sessions.length} buổi · ${exams.length} bài kiểm tra`,
    columns,
    rows,
    attendanceCodes: t.attendanceCodes,
    homeworkCodes: t.homeworkCodes,
    lowScore: t.lowScore,
    scoreColumnFill: t.scoreColumnFill,
    averageDecimals: t.averageDecimals,
  };
}
