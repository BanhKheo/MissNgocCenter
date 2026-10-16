import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccessService } from '../../../common/access/access.service';
import type { AuthUser } from '../../../common/auth-user';
import { compareVietnameseNames } from '../../../common/text';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import type { ImportPreview } from '../../imports/import-spec';
import { ImportsService, type UploadedFileLike } from '../../imports/imports.service';
import { studentsImportSpec, type StudentImportRow } from '../../imports/specs/students.spec';
import { summarize } from '../../imports/validate';
import type { StudentCreateRequestDto, StudentUpdateRequestDto } from '../dto/student.dto';

type Tx = Prisma.TransactionClient;

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly imports: ImportsService,
  ) {}

  /** Học sinh đang học trong lớp, xếp theo tên */
  async listInClass(user: AuthUser, classId: string) {
    await this.access.assertClass(user, classId);
    const enrollments = await this.prisma.enrollment.findMany({
      where: { classId, leftAt: null },
      include: { student: true },
    });
    return enrollments
      .map((e) => ({
        id: e.student.id,
        studentCode: e.student.studentCode,
        fullName: e.student.fullName,
        dob: e.student.dob,
        parentPhone: e.student.parentPhone,
        joinedAt: e.joinedAt,
      }))
      .sort((a, b) => compareVietnameseNames(a.fullName, b.fullName));
  }

  async create(actor: AuthUser, classId: string, dto: StudentCreateRequestDto) {
    await this.access.assertClass(actor, classId);
    return this.prisma.$transaction(async (tx) => {
      if (dto.studentCode) {
        const existing = await tx.student.findUnique({ where: { studentCode: dto.studentCode } });
        if (existing) {
          throw new ConflictException(`Mã HS ${dto.studentCode} đã có (${existing.fullName}). Dùng chuyển lớp hoặc import để cập nhật`);
        }
      }
      const studentCode = dto.studentCode ?? (await nextStudentCodes(tx, 1))[0];
      const student = await tx.student.create({
        data: {
          studentCode,
          fullName: dto.fullName,
          dob: dto.dob ? new Date(dto.dob) : null,
          parentPhone: dto.parentPhone ?? null,
        },
      });
      await tx.enrollment.create({ data: { classId, studentId: student.id } });
      await this.audit.log({ actorId: actor.id, action: 'student.create', entity: 'student', entityId: student.id, after: student }, tx);
      return student;
    });
  }

  async update(actor: AuthUser, id: string, dto: StudentUpdateRequestDto) {
    const before = await this.prisma.student.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Không tìm thấy học sinh');
    if (dto.studentCode && dto.studentCode !== before.studentCode) {
      const dup = await this.prisma.student.findUnique({ where: { studentCode: dto.studentCode } });
      if (dup) throw new ConflictException(`Mã HS ${dto.studentCode} đã có (${dup.fullName})`);
    }
    const student = await this.prisma.student.update({
      where: { id },
      data: {
        studentCode: dto.studentCode,
        fullName: dto.fullName,
        dob: dto.dob === undefined ? undefined : dto.dob ? new Date(dto.dob) : null,
        parentPhone: dto.parentPhone,
      },
    });
    await this.audit.log({ actorId: actor.id, action: 'student.update', entity: 'student', entityId: id, before, after: student });
    return student;
  }

  /** Cho học sinh rời lớp. Không xoá để giữ lịch sử điểm. */
  async removeFromClass(actor: AuthUser, classId: string, studentId: string) {
    await this.access.assertClass(actor, classId);
    const res = await this.prisma.enrollment.updateMany({
      where: { classId, studentId, leftAt: null },
      data: { leftAt: new Date() },
    });
    if (res.count === 0) throw new NotFoundException('Học sinh không có trong lớp này');
    await this.audit.log({ actorId: actor.id, action: 'student.leave-class', entity: 'student', entityId: studentId, after: { classId } });
  }

  /** Chuyển lớp, giữ lịch sử điểm ở lớp cũ */
  async transfer(actor: AuthUser, classId: string, studentId: string, toClassId: string) {
    if (classId === toClassId) throw new BadRequestException('Lớp mới trùng lớp hiện tại');
    await this.access.assertClass(actor, classId);
    const target = await this.access.assertClass(actor, toClassId);
    if (target.status !== 'ACTIVE') throw new BadRequestException('Lớp mới đã lưu trữ');
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.enrollment.updateMany({ where: { classId, studentId, leftAt: null }, data: { leftAt: new Date() } });
      if (res.count === 0) throw new NotFoundException('Học sinh không có trong lớp này');
      const already = await tx.enrollment.findFirst({ where: { classId: toClassId, studentId, leftAt: null } });
      if (!already) await tx.enrollment.create({ data: { classId: toClassId, studentId } });
      await this.audit.log(
        { actorId: actor.id, action: 'student.transfer', entity: 'student', entityId: studentId, after: { from: classId, to: toClassId } },
        tx,
      );
    });
  }

  /** Import danh sách học sinh. dryRun=true chỉ kiểm tra và trả bản xem trước. */
  async import(actor: AuthUser, classId: string, file: UploadedFileLike | undefined, dryRun: boolean) {
    const ctx = await this.imports.context(actor, 'students', { classId });
    const preview = (await this.imports.parse(studentsImportSpec, file, ctx)) as unknown as ImportPreview<StudentImportRow>;

    // Mã HS trùng trong file
    const seen = new Map<string, number>();
    for (const row of preview.rows) {
      const code = row.parsed.studentCode;
      if (!code) continue;
      if (seen.has(code)) {
        row.errors.push({ column: 'Mã HS', message: `Trùng với dòng ${seen.get(code)}` });
      } else seen.set(code, row.rowNumber);
    }

    const codes = [...seen.keys()];
    const existing = await this.prisma.student.findMany({ where: { studentCode: { in: codes } }, select: { studentCode: true } });
    const existingCodes = new Set(existing.map((s) => s.studentCode));
    for (const row of preview.rows) {
      row.action = row.parsed.studentCode && existingCodes.has(row.parsed.studentCode) ? 'update' : 'create';
    }
    summarize(preview);
    if (dryRun || !preview.canSave) return preview;

    await this.prisma.$transaction(
      async (tx) => {
        const needCodes = preview.rows.filter((r) => !r.parsed.studentCode).length;
        const generated = await nextStudentCodes(tx, needCodes);
        for (const row of preview.rows) {
          const p = row.parsed;
          // Cập nhật: ô để trống thì giữ thông tin cũ
          const student =
            row.action === 'update'
              ? await tx.student.update({
                  where: { studentCode: p.studentCode! },
                  data: { fullName: p.fullName, dob: p.dob ?? undefined, parentPhone: p.parentPhone ?? undefined },
                })
              : await tx.student.create({
                  data: {
                    studentCode: p.studentCode ?? generated.shift()!,
                    fullName: p.fullName,
                    dob: p.dob,
                    parentPhone: p.parentPhone,
                  },
                });
          const enrolled = await tx.enrollment.findFirst({ where: { classId, studentId: student.id, leftAt: null } });
          if (!enrolled) await tx.enrollment.create({ data: { classId, studentId: student.id } });
        }
        await this.audit.log(
          { actorId: actor.id, action: 'student.import', entity: 'class', entityId: classId, after: preview.summary },
          tx,
        );
      },
      { timeout: 60_000 },
    );
    preview.saved = true;
    return preview;
  }
}

/** Mã HS tự tạo: HS00001, HS00002... nối tiếp mã lớn nhất đang có */
async function nextStudentCodes(tx: Tx, count: number): Promise<string[]> {
  if (count === 0) return [];
  const rows = await tx.$queryRaw<{ max: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING(student_code FROM 3) AS INTEGER)) AS max
    FROM students WHERE student_code ~ '^HS[0-9]{1,9}$'`;
  const start = (rows[0]?.max ?? 0) + 1;
  return Array.from({ length: count }, (_, i) => `HS${String(start + i).padStart(5, '0')}`);
}
