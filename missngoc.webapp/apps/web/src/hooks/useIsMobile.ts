import { Grid } from 'antd';

/** Điện thoại: màn hình hẹp hơn 768 px */
export function useIsMobile(): boolean {
  const screens = Grid.useBreakpoint();
  return !screens.md;
}
