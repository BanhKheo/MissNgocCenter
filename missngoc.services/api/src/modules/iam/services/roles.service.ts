import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ROLE_NAME } from '@missngoc/core';
import type { AuthUser } from '../../../common/auth-user';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import type { RoleCreateRequestDto, RoleUpdateRequestDto } from '../dto/role.dto';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const roles = await this.prisma.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      include: { permissions: { select: { name: true } }, _count: { select: { users: true } } },
    });
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      userCount: r._count.users,
      permissions: r.permissions.map((p) => p.name).sort(),
    }));
  }

  options() {
    return this.prisma.role
      .findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, description: true } })
      .then((roles) => roles.map((r) => ({ id: r.id, label: r.description ? `${r.name} — ${r.description}` : r.name, name: r.name })));
  }

  /** Ma trận quyền: mọi quyền theo nhóm, đánh dấu quyền nào vai trò đang có (isInRole) */
  async get(id: string) {
    const role = await this.prisma.role.findUnique({ where: { id }, include: { permissions: { select: { id: true } } } });
    if (!role) throw new NotFoundException('Không tìm thấy vai trò');
    const inRole = new Set(role.permissions.map((p) => p.id));
    const all = await this.allPermissions();
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      editable: role.name !== ROLE_NAME.Admin,
      groups: all.map((g) => ({ ...g, permissions: g.permissions.map((p) => ({ ...p, isInRole: inRole.has(p.id) })) })),
    };
  }

  async allPermissions() {
    const groups = await this.prisma.permissionGroup.findMany({
      orderBy: { name: 'asc' },
      include: { permissions: { orderBy: { name: 'asc' }, select: { id: true, name: true, displayName: true } } },
    });
    return groups.map((g) => ({ id: g.id, name: g.name, permissions: g.permissions }));
  }

  async create(actor: AuthUser, dto: RoleCreateRequestDto) {
    if (await this.prisma.role.findUnique({ where: { name: dto.name } })) {
      throw new ConflictException(`Vai trò ${dto.name} đã có`);
    }
    const permissions = await this.resolvePermissions(dto.permissions);
    const role = await this.prisma.role.create({
      data: { name: dto.name, description: dto.description, permissions: { connect: permissions } },
    });
    await this.audit.log({ actorId: actor.id, action: 'role.create', entity: 'role', entityId: role.id, after: dto });
    return this.get(role.id);
  }

  async update(actor: AuthUser, id: string, dto: RoleUpdateRequestDto) {
    const before = await this.prisma.role.findUnique({ where: { id }, include: { permissions: { select: { name: true } } } });
    if (!before) throw new NotFoundException('Không tìm thấy vai trò');
    if (before.name === ROLE_NAME.Admin) throw new BadRequestException('Vai trò ADMIN luôn có mọi quyền, không sửa được');
    const permissions = await this.resolvePermissions(dto.permissions);
    await this.prisma.role.update({
      where: { id },
      data: { description: dto.description, permissions: { set: permissions } },
    });
    await this.audit.log({
      actorId: actor.id,
      action: 'role.update',
      entity: 'role',
      entityId: id,
      before: { description: before.description, permissions: before.permissions.map((p) => p.name) },
      after: dto,
    });
    return this.get(id);
  }

  async remove(actor: AuthUser, id: string) {
    const role = await this.prisma.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
    if (!role) throw new NotFoundException('Không tìm thấy vai trò');
    if (role.isSystem) throw new BadRequestException('Không xoá được vai trò mặc định');
    if (role._count.users > 0) throw new ConflictException(`Còn ${role._count.users} tài khoản dùng vai trò này`);
    await this.prisma.role.delete({ where: { id } });
    await this.audit.log({ actorId: actor.id, action: 'role.delete', entity: 'role', entityId: id, before: { name: role.name } });
  }

  private async resolvePermissions(codes: string[]) {
    const found = await this.prisma.permission.findMany({ where: { name: { in: codes } }, select: { id: true, name: true } });
    const missing = codes.filter((c) => !found.some((f) => f.name === c));
    if (missing.length > 0) throw new BadRequestException(`Quyền không tồn tại: ${missing.join(', ')}`);
    return found.map((f) => ({ id: f.id }));
  }
}
