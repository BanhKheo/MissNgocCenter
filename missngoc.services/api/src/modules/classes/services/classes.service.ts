import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccessService } from '../../../common/access/access.service';
import type { AuthUser } from '../../../common/auth-user';
import { paged, skipTake } from '../../../common/pagination';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import type { ClassCreateRequestDto, ClassFilterRequestDto, ClassUpdateRequestDto } from '../dto/class.dto';

const classInclude = {
  teacher: { select: { id: true, fullName: true } },
  _count: { select: { enrollments: { where: { leftAt: null } }, exams: { where: { status: 'OPEN' } } } },
} satisfies Prisma.ClassInclude;

type ClassRow = Prisma.ClassGetPayload<{ include: typeof classInclude }>;

function toResponse(c: ClassRow) {
  return {
    id: c.id,
    name: c.name,
    level: c.level,
    status: c.status,
    startDate: c.startDate,
    endDate: c.endDate,
    teacher: c.teacher,
    studentCount: c._count.enrollments,
    examCount: c._count.exams,
  };
}

@Injectable()
export class ClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, q: ClassFilterRequestDto) {
    const where: Prisma.ClassWhereInput = {
      ...this.access.classWhere(user),
      status: q.status ?? 'ACTIVE',
      ...(q.keyword ? { name: { contains: q.keyword, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.class.findMany({ where, include: classInclude, orderBy: { name: 'asc' }, ...skipTake(q) }),
      this.prisma.class.count({ where }),
    ]);
    return paged(items.map(toResponse), total, q);
  }

  async options(user: AuthUser, keyword?: string) {
    const classes = await this.prisma.class.findMany({
      where: {
        ...this.access.classWhere(user),
        status: 'ACTIVE',
        ...(keyword ? { name: { contains: keyword, mode: 'insensitive' } } : {}),
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return classes.map((c) => ({ id: c.id, label: c.name }));
  }

  async get(user: AuthUser, id: string) {
    await this.access.assertClass(user, id);
    const c = await this.prisma.class.findUniqueOrThrow({ where: { id }, include: classInclude });
    return toResponse(c);
  }

  async create(actor: AuthUser, dto: ClassCreateRequestDto) {
    await this.ensureTeacher(dto.teacherId);
    const c = await this.prisma.class.create({
      data: {
        name: dto.name,
        level: dto.level,
        teacherId: dto.teacherId ?? null,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
      },
      include: classInclude,
    });
    await this.audit.log({ actorId: actor.id, action: 'class.create', entity: 'class', entityId: c.id, after: dto });
    return toResponse(c);
  }

  async update(actor: AuthUser, id: string, dto: ClassUpdateRequestDto) {
    const before = await this.access.assertClass(actor, id);
    await this.ensureTeacher(dto.teacherId);
    const c = await this.prisma.class.update({
      where: { id },
      data: {
        name: dto.name,
        level: dto.level,
        teacherId: dto.teacherId,
        status: dto.status,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
      include: classInclude,
    });
    await this.audit.log({ actorId: actor.id, action: 'class.update', entity: 'class', entityId: id, before, after: dto });
    return toResponse(c);
  }

  private async ensureTeacher(teacherId: string | null | undefined) {
    if (!teacherId) return;
    const t = await this.prisma.user.findUnique({ where: { id: teacherId } });
    if (!t || t.status !== 'ACTIVE') throw new BadRequestException('Giáo viên không tồn tại hoặc đã bị khoá');
  }
}
