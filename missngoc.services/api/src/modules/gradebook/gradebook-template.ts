import { z } from 'zod';

const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Màu dạng #RRGGBB');
const headerStyle = z.object({ fill: color, font: color });
const code = z.string().trim().min(1).max(4);

export const GradebookTemplateSchema = z
  .object({
    title: z.string().min(1).max(200),
    /** Tiêu đề các cột STT, họ tên, điểm trung bình, xếp hạng, tổng buổi */
    header: headerStyle,
    /** Tiêu đề cột điểm danh từng buổi (B1, B2…) */
    sessionHeader: headerStyle,
    /** Tiêu đề cột bài tập về nhà */
    homeworkHeader: headerStyle,
    /** Tiêu đề cột điểm của bài chưa chọn loại; bài có loại dùng màu của loại bài */
    scoreHeader: headerStyle,
    /** Nền nhạt của cả cột điểm, giúp phân biệt với cột điểm danh */
    scoreColumnFill: color,
    /** Điểm dưới ngưỡng tô màu, ví dụ dưới 5 tô vàng. Ngưỡng tính theo thang 10 */
    lowScore: z.object({ below: z.number().min(0).max(10), fill: color, font: color }),
    /** Điểm trung bình dưới ngưỡng cũng tô màu như trên */
    highlightLowAverage: z.boolean(),
    averageDecimals: z.number().int().min(0).max(2),
    showStudentCode: z.boolean(),
    attendanceCodes: z
      .array(z.object({ code, label: z.string().min(1).max(40), present: z.boolean(), fill: color.optional(), font: color.optional() }))
      .min(1)
      .max(8),
    homeworkCodes: z
      .array(z.object({ code, label: z.string().min(1).max(40), fill: color.optional(), font: color.optional() }))
      .min(1)
      .max(6),
  })
  .refine((t) => new Set(t.attendanceCodes.map((c) => c.code.toUpperCase())).size === t.attendanceCodes.length, {
    message: 'Mã điểm danh bị trùng',
    path: ['attendanceCodes'],
  })
  .refine((t) => new Set(t.homeworkCodes.map((c) => c.code.toUpperCase())).size === t.homeworkCodes.length, {
    message: 'Mã bài tập bị trùng',
    path: ['homeworkCodes'],
  });

export type GradebookTemplate = z.infer<typeof GradebookTemplateSchema>;

/** Tên bản ghi trong bảng report_templates */
export const GRADEBOOK_TEMPLATE_NAME = 'gradebook';

// Màu theo sổ điểm Excel trung tâm đang dùng: tiêu đề xanh đậm, buổi học xanh nhạt, bài tập cam, điểm dưới 5 tô vàng
export const DEFAULT_GRADEBOOK_TEMPLATE: GradebookTemplate = {
  title: 'SỔ ĐIỂM LỚP {className}',
  header: { fill: '#1F4E78', font: '#FFFFFF' },
  sessionHeader: { fill: '#DDEBF7', font: '#1F4E78' },
  homeworkHeader: { fill: '#F8CBAD', font: '#000000' },
  scoreHeader: { fill: '#E2EFDA', font: '#000000' },
  scoreColumnFill: '#F3F9EF',
  lowScore: { below: 5, fill: '#FFFF00', font: '#000000' },
  highlightLowAverage: false,
  averageDecimals: 1,
  showStudentCode: false,
  attendanceCodes: [
    { code: 'O', label: 'Có mặt', present: true },
    { code: 'P', label: 'Vắng có phép', present: false, fill: '#FFF2CC' },
    { code: 'K', label: 'Vắng không phép', present: false, fill: '#FFC7CE', font: '#9C0006' },
    { code: 'L', label: 'Học bù', present: true },
  ],
  homeworkCodes: [
    { code: 'D', label: 'Đã làm' },
    { code: 'ND', label: 'Không làm', fill: '#FCE4D6', font: '#9C0006' },
  ],
};

// Loại bài mặc định khi cài lần đầu; Admin sửa tên, hệ số, màu trên web
export const DEFAULT_CATEGORIES = [
  { name: 'Kiểm tra buổi', weight: 1, headerFill: '#E2EFDA', headerFont: '#000000', sortOrder: 1 },
  { name: 'Cuối unit', weight: 2, headerFill: '#FFD966', headerFont: '#000000', sortOrder: 2 },
  { name: 'Giữa kỳ', weight: 3, headerFill: '#F4B183', headerFont: '#000000', sortOrder: 3 },
  { name: 'Cuối kỳ', weight: 3, headerFill: '#C9A0DC', headerFont: '#000000', sortOrder: 4 },
];
