import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface CategoryInput {
  name?: string;
  weight?: number;
  headerFill?: string;
  headerFont?: string;
  sortOrder?: number;
}

/** Loại bài và hệ số mặc định (Kiểm tra buổi x1, Cuối unit x2, Giữa kỳ x3…) */
@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const rows = await this.prisma.assessmentCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { exams: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      weight: Number(c.weight),
      headerFill: c.headerFill,
      headerFont: c.headerFont,
      sortOrder: c.sortOrder,
      examCount: c._count.exams,
    }));
  }

  async create(user: AuthUser, dto: Required<Pick<CategoryInput, 'name' | 'weight'>> & CategoryInput) {
    const c = await this.save(() => this.prisma.assessmentCategory.create({ data: dto }));
    await this.audit.log({ actorId: user.id, action: 'category.create', entity: 'assessment-category', entityId: c.id, after: dto });
    return c;
  }

  async update(user: AuthUser, id: string, dto: CategoryInput) {
    const before = await this.prisma.assessmentCategory.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Không tìm thấy loại bài');
    const c = await this.save(() => this.prisma.assessmentCategory.update({ where: { id }, data: dto }));
    await this.audit.log({ actorId: user.id, action: 'category.update', entity: 'assessment-category', entityId: id, before, after: dto });
    return c;
  }

  /** Bài đang dùng loại này chuyển về "chưa chọn loại" (hệ số 1 nếu bài không có hệ số riêng) */
  async remove(user: AuthUser, id: string) {
    const before = await this.prisma.assessmentCategory.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Không tìm thấy loại bài');
    await this.prisma.assessmentCategory.delete({ where: { id } });
    await this.audit.log({ actorId: user.id, action: 'category.delete', entity: 'assessment-category', entityId: id, before });
    return { deleted: true };
  }

  private async save<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ConflictException('Đã có loại bài trùng tên');
      throw err;
    }
  }
}
