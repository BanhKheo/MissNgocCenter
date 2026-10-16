import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ROLE_NAME } from '@missngoc/core';
import type { AuthUser } from '../../../common/auth-user';
import { paged, skipTake } from '../../../common/pagination';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { hashPassword } from '../../auth/password';
import type {
  PasswordResetRequestDto,
  UserCreateRequestDto,
  UserFilterRequestDto,
  UserUpdateRequestDto,
} from '../dto/user.dto';

const userSelect = {
  id: true,
  username: true,
  fullName: true,
  status: true,
  mustChangePassword: true,
  lastLoginAt: true,
  createdAt: true,
  role: { select: { id: true, name: true, description: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(q: UserFilterRequestDto) {
    const where: Prisma.UserWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.keyword
        ? {
            OR: [
              { username: { contains: q.keyword, mode: 'insensitive' } },
              { fullName: { contains: q.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({ where, select: userSelect, orderBy: { createdAt: 'desc' }, ...skipTake(q) }),
      this.prisma.user.count({ where }),
    ]);
    return paged(items, total, q);
  }

  /** Dropdown chọn giáo viên chủ nhiệm khi tạo lớp */
  options(keyword?: string) {
    return this.prisma.user
      .findMany({
        where: {
          status: 'ACTIVE',
          ...(keyword ? { fullName: { contains: keyword, mode: 'insensitive' } } : {}),
        },
        select: { id: true, fullName: true, username: true, role: { select: { name: true } } },
        orderBy: { fullName: 'asc' },
        take: 100,
      })
      .then((users) => users.map((u) => ({ id: u.id, label: `${u.fullName} (${u.username})`, role: u.role.name })));
  }

  async get(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản');
    return user;
  }

  async create(actor: AuthUser, dto: UserCreateRequestDto) {
    await this.ensureRole(dto.roleId);
    const exists = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (exists) throw new ConflictException(`Username "${dto.username}" đã có người dùng`);
    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        fullName: dto.fullName,
        roleId: dto.roleId,
        passwordHash: await hashPassword(dto.password),
        mustChangePassword: true,
      },
      select: userSelect,
    });
    await this.audit.log({ actorId: actor.id, action: 'user.create', entity: 'user', entityId: user.id, after: user });
    return user;
  }

  async update(actor: AuthUser, id: string, dto: UserUpdateRequestDto) {
    const before = await this.get(id);
    if (id === actor.id && dto.status === 'BANNED') throw new BadRequestException('Không tự khoá tài khoản của mình');
    if (id === actor.id && dto.roleId && dto.roleId !== before.role.id) {
      throw new BadRequestException('Không tự đổi vai trò của mình');
    }
    if (dto.roleId) await this.ensureRole(dto.roleId);

    const losesAdmin =
      before.role.name === ROLE_NAME.Admin &&
      before.status === 'ACTIVE' &&
      (dto.status === 'BANNED' || (dto.roleId !== undefined && dto.roleId !== before.role.id));
    if (losesAdmin) {
      const activeAdmins = await this.prisma.user.count({ where: { status: 'ACTIVE', role: { name: ROLE_NAME.Admin } } });
      if (activeAdmins <= 1) throw new BadRequestException('Không khoá hoặc đổi vai trò của Admin cuối cùng');
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        roleId: dto.roleId,
        status: dto.status,
        ...(dto.status === 'ACTIVE' ? { failedLoginCount: 0, lockedUntil: null } : {}),
      },
      select: userSelect,
    });
    await this.audit.log({ actorId: actor.id, action: 'user.update', entity: 'user', entityId: id, before, after: user });
    return user;
  }

  async resetPassword(actor: AuthUser, id: string, dto: PasswordResetRequestDto) {
    await this.get(id);
    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash: await hashPassword(dto.password),
        mustChangePassword: true,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    await this.audit.log({ actorId: actor.id, action: 'user.reset-password', entity: 'user', entityId: id });
  }

  private async ensureRole(roleId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new BadRequestException('Vai trò không tồn tại');
    return role;
  }
}
