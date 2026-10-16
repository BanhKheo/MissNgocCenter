import { z } from 'zod';

const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Màu dạng #RRGGBB');
const cellStyle = z.object({ fill: color, font: color.optional(), bold: z.boolean().optional() });

export const REPORT_COLUMNS = ['stt', 'studentCode', 'fullName', 'versionCode', 'correctCount', 'score', 'rank', 'note'] as const;
export type ReportColumn = (typeof REPORT_COLUMNS)[number];

export const ReportTemplateSchema = z.object({
  title: z.string().min(1).max(200),
  header: z.object({ fill: color, font: color, bold: z.boolean().default(true) }),
  columns: z.array(z.enum(REPORT_COLUMNS)).min(1),
  showPerQuestion: z.boolean(),
  wrongCell: cellStyle,
  blankCell: cellStyle,
  needsReviewRow: z.object({ fill: color }),
  scoreBands: z
    .array(z.object({ min: z.number().min(0), label: z.string().min(1).max(30), fill: color, font: color }))
    .min(1)
    .max(8),
  freezeHeader: z.boolean(),
});

export type ReportTemplateConfig = z.infer<typeof ReportTemplateSchema>;

// Mẫu mặc định theo mục 9 tài liệu; Admin chỉnh trên màn hình cài đặt
export const DEFAULT_REPORT_TEMPLATE: ReportTemplateConfig = {
  title: 'BẢNG ĐIỂM {className} – {examTitle}',
  header: { fill: '#1F4E78', font: '#FFFFFF', bold: true },
  columns: ['stt', 'studentCode', 'fullName', 'correctCount', 'score', 'rank', 'note'],
  showPerQuestion: true,
  wrongCell: { fill: '#FFC7CE', font: '#9C0006' },
  blankCell: { fill: '#EDEDED' },
  needsReviewRow: { fill: '#FFF2CC' },
  scoreBands: [
    { min: 8.0, label: 'Giỏi', fill: '#C6EFCE', font: '#006100' },
    { min: 6.5, label: 'Khá', fill: '#DDEBF7', font: '#1F4E78' },
    { min: 5.0, label: 'Trung bình', fill: '#FFEB9C', font: '#9C5700' },
    { min: 0, label: 'Cần cố gắng', fill: '#FFC7CE', font: '#9C0006' },
  ],
  freezeHeader: true,
};

export const COLUMN_TITLES: Record<ReportColumn, string> = {
  stt: 'STT',
  studentCode: 'Mã HS',
  fullName: 'Họ và tên',
  versionCode: 'Mã đề',
  correctCount: 'Số câu đúng',
  score: 'Điểm',
  rank: 'Xếp loại',
  note: 'Ghi chú',
};

export const COLUMN_WIDTHS: Record<ReportColumn, number> = {
  stt: 5,
  studentCode: 10,
  fullName: 26,
  versionCode: 8,
  correctCount: 11,
  score: 8,
  rank: 13,
  note: 16,
};

/** Dải điểm theo thang 10; bài thang khác thì quy đổi tỉ lệ */
export function bandFor(config: ReportTemplateConfig, score: number, maxScore: number) {
  const scaled = maxScore > 0 ? (score / maxScore) * 10 : score;
  const bands = [...config.scoreBands].sort((a, b) => b.min - a.min);
  return bands.find((b) => scaled >= b.min - 1e-9) ?? bands[bands.length - 1];
}
