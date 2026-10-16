import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthUser, JwtPayload } from '../../../common/auth-user';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { hashPassword, verifyPassword } from '../password';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const INVALID_LOGIN = 'Sai tên đăng nhập hoặc mật khẩu';

export const userWithPermissions = {
  role: { include: { permissions: { select: { name: true } } } },
} as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(username: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { username }, include: userWithPermissions });
    if (!user) throw new UnauthorizedException(INVALID_LOGIN);
    if (user.status !== 'ACTIVE') throw new UnauthorizedException('Tài khoản đã bị khoá. Liên hệ Admin');
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException(`Đăng nhập sai quá ${MAX_FAILED_LOGINS} lần. Thử lại sau ${LOCK_MINUTES} phút`);
    }

    if (!(await verifyPassword(user.passwordHash, password))) {
      const failed = user.failedLoginCount + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: failed >= MAX_FAILED_LOGINS ? 0 : failed,
          lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        },
      });
      throw new UnauthorizedException(INVALID_LOGIN);
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const profile = toAuthUser(user);
    return { accessToken: await this.sign(profile), user: profile };
  }

  async changePassword(user: AuthUser, currentPassword: string, newPassword: string) {
    const found = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await verifyPassword(found.passwordHash, currentPassword))) {
      throw new BadRequestException('Mật khẩu hiện tại không đúng');
    }
    if (currentPassword === newPassword) throw new BadRequestException('Mật khẩu mới phải khác mật khẩu cũ');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
    });
    await this.audit.log({ actorId: user.id, action: 'user.change-password', entity: 'user', entityId: user.id });
  }

  private sign(user: AuthUser): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      permissions: user.permissions,
      mustChangePassword: user.mustChangePassword,
    };
    return this.jwt.signAsync(payload);
  }
}

export function toAuthUser(user: {
  id: string;
  username: string;
  fullName: string;
  mustChangePassword: boolean;
  role: { name: string; permissions: { name: string }[] };
}): AuthUser {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role.name,
    permissions: user.role.permissions.map((p) => p.name).sort(),
    mustChangePassword: user.mustChangePassword,
  };
}
