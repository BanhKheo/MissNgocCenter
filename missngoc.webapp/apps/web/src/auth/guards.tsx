import { Result } from 'antd';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { RoutePaths, type PMS } from '@missngoc/core';
import { selectProfile, useAppSelector, useCan } from '../store';

export function RequireAuth({ children }: { children: ReactNode }) {
  const profile = useAppSelector(selectProfile);
  const location = useLocation();
  if (!profile) return <Navigate to={RoutePaths.login} replace state={{ from: location.pathname }} />;
  // Đăng nhập bằng mật khẩu tạm thì phải đổi trước khi vào (FR-AUTH-04)
  if (profile.mustChangePassword) return <Navigate to={RoutePaths.changePassword} replace />;
  return <>{children}</>;
}

export function RequirePermission({ any, children }: { any: PMS[]; children: ReactNode }) {
  const allowed = useCan(...any);
  if (!allowed) return <Result status="403" title="Không có quyền" subTitle="Tài khoản của bạn không được mở trang này." />;
  return <>{children}</>;
}
