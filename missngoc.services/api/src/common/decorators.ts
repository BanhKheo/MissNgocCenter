import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { PMS } from '@missngoc/core';
import type { AuthUser } from './auth-user';

export const IS_PUBLIC_KEY = 'isPublic';
/** Endpoint không cần đăng nhập. Mặc định mọi endpoint đều cần. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = 'permissions';
/** Cần ít nhất một trong các quyền liệt kê. Không gắn thì chỉ cần đăng nhập. */
export const RequirePermissions = (...permissions: PMS[]) => SetMetadata(PERMISSIONS_KEY, permissions);

export const ALLOW_PENDING_PASSWORD_KEY = 'allowPendingPassword';
/** Cho phép gọi khi tài khoản đang phải đổi mật khẩu tạm (FR-AUTH-04). */
export const AllowPendingPasswordChange = () => SetMetadata(ALLOW_PENDING_PASSWORD_KEY, true);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user as AuthUser;
});
