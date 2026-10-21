import type { ThemeConfig } from 'antd';

/**
 * Nơi duy nhất khai báo màu và cỡ chữ của app.
 * Trang không tự viết mã màu hay fontSize: dùng class trong styles.css (đọc biến --mn-*) hoặc component dùng chung.
 */
export const palette = {
  primary: '#1F4E78',
  success: '#1E7E34',
  successBright: '#52C41A',
  danger: '#C0392B',
  warning: '#D48806',
  muted: '#6B7280',
  iconMuted: '#9CA3AF',
  border: '#E5E7EB',
  divider: '#F0F0F0',
  bg: '#F4F6F9',
  surface: '#FFFFFF',
  pressed: '#EEF3F8',
  uncertainBg: '#FFF2CC',
  uncertainBorder: '#F0B400',
  errorRow: '#FFF1F0',
  imageBg: '#FAFAFA',
} as const;

export const antdTheme: ThemeConfig = {
  token: { colorPrimary: palette.primary, borderRadius: 8, fontSize: 15 },
  components: { Button: { controlHeightLG: 48 } },
};

/** Đưa bảng màu thành biến CSS --mn-* để styles.css dùng chung một nguồn với antd */
export function applyCssVars() {
  const root = document.documentElement.style;
  for (const [name, value] of Object.entries(palette)) {
    root.setProperty(`--mn-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, value);
  }
}
