// Danh sách quyền theo kiểu IUROADMAP: enum PMS + APP_PERMISSIONS, seed vào database.
// Thêm quyền mới: thêm vào PMS và APP_PERMISSIONS, rebuild core, chạy lại seed (npm run db:seed).

export enum PMS {
  SYS_AD = 'SYS.AD',
  USER_AD = 'USER.AD',
  CLS_AD = 'CLS.AD',
  EXAM_AD = 'EXAM.AD',
  GRD_USER = 'GRD.USER',
  RPT_AD = 'RPT.AD',
  RPT_USER = 'RPT.USER',
}

export const PMS_GROUP = {
  SYSTEM: 'SYSTEM',
  USER: 'USER',
  CLASS: 'CLASS',
  EXAM: 'EXAM',
  GRADING: 'GRADING',
  REPORT: 'REPORT',
} as const;

export type PmsGroup = (typeof PMS_GROUP)[keyof typeof PMS_GROUP];

export interface AppPermission {
  code: PMS;
  displayName: string;
  groupId: PmsGroup;
}

export const APP_PERMISSIONS: AppPermission[] = [
  { code: PMS.SYS_AD, displayName: 'Mẫu bảng điểm, nhật ký thao tác', groupId: PMS_GROUP.SYSTEM },
  { code: PMS.USER_AD, displayName: 'Tài khoản, vai trò, ma trận quyền', groupId: PMS_GROUP.USER },
  { code: PMS.CLS_AD, displayName: 'Lớp, học sinh, import Excel', groupId: PMS_GROUP.CLASS },
  { code: PMS.EXAM_AD, displayName: 'Bài kiểm tra, đáp án, chấm lại', groupId: PMS_GROUP.EXAM },
  { code: PMS.GRD_USER, displayName: 'Chụp và tải ảnh, Generate, duyệt kết quả', groupId: PMS_GROUP.GRADING },
  { code: PMS.RPT_AD, displayName: 'Xem, xuất Excel và thống kê mọi lớp', groupId: PMS_GROUP.REPORT },
  { code: PMS.RPT_USER, displayName: 'Xem bảng điểm và thống kê lớp mình dạy', groupId: PMS_GROUP.REPORT },
];

export const ROLE_NAME = {
  Admin: 'ADMIN',
  Staff: 'STAFF',
  Teacher: 'TEACHER',
} as const;

// Quyền mặc định khi cài lần đầu. ADMIN luôn có mọi quyền; các vai trò khác Admin sửa được trên web.
export const DEFAULT_ROLE_PERMISSIONS: Record<string, PMS[]> = {
  [ROLE_NAME.Staff]: [PMS.CLS_AD, PMS.GRD_USER, PMS.RPT_AD],
  [ROLE_NAME.Teacher]: [PMS.RPT_USER],
};

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  [ROLE_NAME.Admin]: 'Chủ trung tâm, giáo vụ trưởng',
  [ROLE_NAME.Staff]: 'Giáo vụ',
  [ROLE_NAME.Teacher]: 'Giáo viên đứng lớp',
};

export function hasAnyPermission(granted: readonly string[] | undefined, required: readonly string[]): boolean {
  if (!granted) return false;
  return required.some((p) => granted.includes(p));
}
