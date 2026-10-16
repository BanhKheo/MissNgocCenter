import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasAnyPermission } from '@missngoc/core';
import type { AuthUser } from '../auth-user';
import { ALLOW_PENDING_PASSWORD_KEY, IS_PUBLIC_KEY, PERMISSIONS_KEY } from '../decorators';

/**
 * Kiểm quyền theo mã quyền (không theo tên vai trò như IUROADMAP), để vai trò mới do Admin tạo có tác dụng.
 * Quyền đọc từ DB ở mỗi request (JwtStrategy), nên đổi vai trò hay khoá tài khoản có hiệu lực ngay.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const user = context.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!user) throw new UnauthorizedException();

    const allowPending = this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD_KEY, targets);
    if (user.mustChangePassword && !allowPending) {
      throw new ForbiddenException({ message: 'Cần đổi mật khẩu trước khi tiếp tục', code: 'PASSWORD_CHANGE_REQUIRED' });
    }

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, targets);
    if (!required || required.length === 0) return true;
    if (!hasAnyPermission(user.permissions, required)) {
      throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
    }
    return true;
  }
}
