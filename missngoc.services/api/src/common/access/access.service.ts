import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hasAnyPermission, PMS } from '@missngoc/core';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth-user';

const SEE_ALL_CLASSES = [PMS.CLS_AD, PMS.EXAM_AD, PMS.GRD_USER, PMS.RPT_AD];
const NONE = '00000000-0000-0000-0000-000000000000';

/**
 * Lọc dữ liệu theo người dùng (BR-AUTH-08): giáo viên chỉ có RPT.USER thì chỉ thấy lớp mình dạy.
 * Đây là lọc dữ liệu trong service, không phải một quyền.
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  canSeeAllClasses(user: AuthUser): boolean {
    return hasAnyPermission(user.permissions, SEE_ALL_CLASSES);
  }

  classWhere(user: AuthUser): Prisma.ClassWhereInput {
    if (this.canSeeAllClasses(user)) return {};
    if (hasAnyPermission(user.permissions, [PMS.RPT_USER])) return { teacherId: user.id };
    return { id: NONE };
  }

  async assertClass(user: AuthUser, classId: string) {
    const cls = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!cls) throw new NotFoundException('Không tìm thấy lớp');
    if (!this.canSeeAllClasses(user) && cls.teacherId !== user.id) {
      throw new ForbiddenException('Bạn chỉ xem được lớp mình dạy');
    }
    return cls;
  }

  async assertExam(user: AuthUser, examId: string) {
    const exam = await this.prisma.exam.findUnique({ where: { id: examId }, include: { class: true } });
    if (!exam) throw new NotFoundException('Không tìm thấy bài kiểm tra');
    if (!this.canSeeAllClasses(user) && exam.class.teacherId !== user.id) {
      throw new ForbiddenException('Bạn chỉ xem được lớp mình dạy');
    }
    return exam;
  }
}
