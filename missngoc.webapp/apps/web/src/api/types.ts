import type { GradingMode, MarkStatus, QuestionKind, SubmissionStatus } from '@missngoc/core';
import type { AuthProfile } from '../store/appSlice';

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Option {
  id: string;
  label: string;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthProfile;
}

export interface UserRow {
  id: string;
  username: string;
  fullName: string;
  status: 'ACTIVE' | 'BANNED';
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  role: { id: string; name: string; description: string | null };
}

export interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissions: string[];
}

export interface PermissionItem {
  id: string;
  name: string;
  displayName: string;
  isInRole?: boolean;
}

export interface PermissionGroup {
  id: string;
  name: string;
  permissions: PermissionItem[];
}

export interface RoleDetail {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  editable: boolean;
  groups: PermissionGroup[];
}

export interface ClassRow {
  id: string;
  name: string;
  level: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  startDate: string | null;
  endDate: string | null;
  teacher: { id: string; fullName: string } | null;
  studentCount: number;
  examCount: number;
}

export interface StudentRow {
  id: string;
  studentCode: string;
  fullName: string;
  dob: string | null;
  parentPhone: string | null;
  joinedAt: string;
}

export type StatusCounts = Record<SubmissionStatus, number> & { total: number };

export interface ExamRow {
  id: string;
  title: string;
  examDate: string;
  gradingMode: GradingMode;
  category: { id: string; name: string; weight: number } | null;
  /** Hệ số riêng của bài; null thì theo loại bài */
  weight: number | null;
  /** Hệ số dùng khi tính điểm trung bình */
  effectiveWeight: number;
  questionCount: number;
  options: string;
  maxScore: number;
  layoutHint: string | null;
  status: 'OPEN' | 'ARCHIVED';
  class: { id: string; name: string };
  answerKeys: { versionCode: string; itemCount: number; complete: boolean }[];
  counts: StatusCounts;
}

export interface AnswerKeyGrid {
  versionCode: string;
  items: { q: number; kind: QuestionKind; correct: string[]; points: number }[];
}

export interface SubmissionRow {
  studentId: string;
  studentCode: string;
  fullName: string;
  inClass: boolean;
  submissionId: string | null;
  status: SubmissionStatus;
  imageCount: number;
  versionCode: string | null;
  score: number | null;
  correctCount: number | null;
  uncertainCount: number;
  nameMismatch: boolean;
  lastError: string | null;
}

export interface SubmissionDetail {
  id: string;
  status: SubmissionStatus;
  version: number;
  versionCode: string | null;
  studentNameRead: string | null;
  nameMismatch: boolean;
  lastError: string | null;
  student: { id: string; studentCode: string; fullName: string };
  exam: {
    id: string;
    title: string;
    questionCount: number;
    options: string;
    maxScore: number;
    className: string;
    versionCodes: string[];
  };
  images: { id: string; pageNo: number; uploadedAt: string }[];
  answers: {
    q: number;
    kind: QuestionKind;
    detectedChoice: string | null;
    status: MarkStatus;
    finalChoice: string | null;
    isCorrect: boolean | null;
    /** Đáp án đúng theo mã đề của bài; null khi chưa biết mã đề */
    correct: string[] | null;
    reviewed: boolean;
    needsReview: boolean;
  }[];
  result: { score: number; correctCount: number } | null;
}

export interface GradingRunProgress {
  id: string;
  examId: string;
  regrade: boolean;
  createdAt: string;
  total: number;
  done: number;
  finished: boolean;
  counts: Partial<Record<SubmissionStatus, number>>;
}

export interface ImportSpecDescription {
  type: string;
  title: string;
  columns: { header: string; required: boolean; format: string; examples: [string, string] }[];
  rules: string[];
  prompt: string;
  privacyNote: string | null;
  maxRows: number;
}

export interface ImportPreview<T = Record<string, unknown>, E = unknown> {
  type: string;
  headers: string[];
  rows: {
    rowNumber: number;
    values: Record<string, string>;
    parsed: T;
    errors: { column: string; message: string }[];
    action?: 'create' | 'update';
  }[];
  fileErrors: string[];
  summary: { total: number; valid: number; invalid: number; create: number; update: number };
  canSave: boolean;
  saved: boolean;
  extra?: E;
}

export interface CellStyle {
  fill?: string;
  font?: string;
  bold?: boolean;
}

export interface ReportGrid {
  title: string;
  subtitle: string;
  header: CellStyle;
  columns: { key: string; title: string; width: number; question?: number }[];
  rows: {
    key: string;
    studentId: string;
    submissionId: string | null;
    status: SubmissionStatus;
    style?: CellStyle;
    cells: Record<string, { value: string | number | null; style?: CellStyle }>;
  }[];
  bands: { min: number; label: string; fill: string; font: string }[];
  maxScore: number;
  summary: {
    total: number;
    graded: number;
    needsReview: number;
    absent: number;
    missing: number;
    average: number | null;
    max: number | null;
    min: number | null;
  };
}

export interface QuestionStatsVersion {
  versionCode: string;
  submissions: number;
  questions: {
    q: number;
    kind: QuestionKind;
    correct: string[];
    answered: number;
    correctRate: number | null;
    counts: Record<string, number>;
    topWrong: { choice: string; count: number } | null;
  }[];
}

export interface ReportTemplateConfig {
  title: string;
  header: { fill: string; font: string; bold: boolean };
  columns: string[];
  showPerQuestion: boolean;
  wrongCell: { fill: string; font?: string };
  blankCell: { fill: string; font?: string };
  needsReviewRow: { fill: string };
  scoreBands: { min: number; label: string; fill: string; font: string }[];
  freezeHeader: boolean;
}

export interface AuditLogRow {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  at: string;
  actor: { id: string; username: string; fullName: string } | null;
}

// ───── Sổ điểm lớp ─────

export interface AssessmentCategory {
  id: string;
  name: string;
  weight: number;
  headerFill: string;
  headerFont: string;
  sortOrder: number;
  examCount: number;
}

export interface AttendanceCode {
  code: string;
  label: string;
  present: boolean;
  fill?: string;
  font?: string;
}

export interface HomeworkCode {
  code: string;
  label: string;
  fill?: string;
  font?: string;
}

export interface GradebookTemplate {
  title: string;
  header: { fill: string; font: string };
  sessionHeader: { fill: string; font: string };
  homeworkHeader: { fill: string; font: string };
  scoreHeader: { fill: string; font: string };
  scoreColumnFill: string;
  lowScore: { below: number; fill: string; font: string };
  highlightLowAverage: boolean;
  averageDecimals: number;
  showStudentCode: boolean;
  attendanceCodes: AttendanceCode[];
  homeworkCodes: HomeworkCode[];
}

export type GbColumnKind = 'stt' | 'studentCode' | 'fullName' | 'average' | 'rank' | 'attendance' | 'homework' | 'score' | 'total';

export interface GbColumn {
  key: string;
  kind: GbColumnKind;
  title: string;
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
  style?: CellStyle;
  submissionId?: string | null;
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
  attendanceCodes: AttendanceCode[];
  homeworkCodes: HomeworkCode[];
  lowScore: GradebookTemplate['lowScore'];
  scoreColumnFill: string;
  averageDecimals: number;
}
