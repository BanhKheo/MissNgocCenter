import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthUser, JwtPayload } from '../../common/auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import { toAuthUser, userWithPermissions } from './services/auth.service';

/**
 * Mỗi request đọc lại trạng thái và quyền của người dùng từ DB (BR-AUTH-06):
 * khoá tài khoản hay đổi vai trò có hiệu lực ngay dù token 30 ngày còn hạn.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, include: userWithPermissions });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Tài khoản đã bị khoá hoặc không còn tồn tại');
    }
    return toAuthUser(user);
  }
}
