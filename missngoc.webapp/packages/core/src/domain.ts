export const CHOICES = ['A', 'B', 'C', 'D', 'E'] as const;
export type Choice = (typeof CHOICES)[number];

/** Loại câu: trắc nghiệm (khoanh, tô chữ cái) hoặc điền từ (học sinh viết một từ hay cụm từ) */
export const QUESTION_KINDS = ['choice', 'text'] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

export const QUESTION_KIND_LABEL: Record<QuestionKind, string> = {
  choice: 'Trắc nghiệm',
  text: 'Điền từ',
};

/** Độ dài tối đa của một đáp án điền từ */
export const MAX_TEXT_ANSWER = 100;

export const MARK_STATUSES = ['clear', 'blank', 'multiple', 'unclear'] as const;
export type MarkStatus = (typeof MARK_STATUSES)[number];

/** Câu AI đọc không chắc, cần người duyệt. `blank` là học sinh bỏ trống, không cần duyệt. */
export const UNCERTAIN_STATUSES: readonly MarkStatus[] = ['multiple', 'unclear'];

export const MARK_STATUS_LABEL: Record<MarkStatus, string> = {
  clear: 'Rõ',
  blank: 'Bỏ trống',
  multiple: 'Nhiều đáp án',
  unclear: 'Không chắc',
};

export const SUBMISSION_STATUSES = [
  'NO_IMAGE',
  'UPLOADED',
  'QUEUED',
  'PROCESSING',
  'NEEDS_REVIEW',
  'GRADED',
  'FAILED',
  'ABSENT',
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const SUBMISSION_STATUS_LABEL: Record<SubmissionStatus, string> = {
  NO_IMAGE: 'Chưa có ảnh',
  UPLOADED: 'Đã có ảnh',
  QUEUED: 'Trong hàng đợi',
  PROCESSING: 'Đang đọc ảnh',
  NEEDS_REVIEW: 'Cần duyệt',
  GRADED: 'Đã chấm',
  FAILED: 'Lỗi',
  ABSENT: 'Vắng',
};

/** Mã đề dùng chung khi bài kiểm tra chỉ có một mã đề. Trên URL viết là "_". */
export const DEFAULT_VERSION_CODE = '';
export const DEFAULT_VERSION_URL_PARAM = '_';

export const OPTION_SETS = ['ABCD', 'ABCDE'] as const;
export type OptionSet = (typeof OPTION_SETS)[number];

export const IMPORT_TYPES = ['students', 'answer-keys'] as const;
export type ImportType = (typeof IMPORT_TYPES)[number];
