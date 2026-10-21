/**
 * Seed quyền, vai trò mặc định và mẫu bảng điểm. Chạy sau mỗi lần migrate, chạy lại bao nhiêu lần cũng được.
 * - Thêm quyền mới từ APP_PERMISSIONS
 * - Tạo vai trò mặc định nếu chưa có; ADMIN luôn được gán đủ mọi quyền
 * - Không ghi đè quyền của STAFF, TEACHER và vai trò khác, vì Admin có thể đã sửa trên web
 */
import { PrismaClient } from '@prisma/client';
import { APP_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, ROLE_DESCRIPTIONS, ROLE_NAME } from '@missngoc/core';
import { DEFAULT_CATEGORIES } from '../modules/gradebook/gradebook-template';
import { DEFAULT_REPORT_TEMPLATE } from '../modules/reports/report-template';
import { loadEnv } from './load-env';

async function main() {
  loadEnv();
  const prisma = new PrismaClient();
  try {
    for (const perm of APP_PERMISSIONS) {
      const group = await prisma.permissionGroup.upsert({
        where: { name: perm.groupId },
        update: {},
        create: { name: perm.groupId },
      });
      await prisma.permission.upsert({
        where: { name: perm.code },
        update: { displayName: perm.displayName, groupId: group.id },
        create: { name: perm.code, displayName: perm.displayName, groupId: group.id },
      });
    }
    console.log(`Đã seed ${APP_PERMISSIONS.length} quyền`);

    const all = await prisma.permission.findMany({ select: { id: true, name: true } });
    await prisma.role.upsert({
      where: { name: ROLE_NAME.Admin },
      update: { isSystem: true, permissions: { set: all.map((p) => ({ id: p.id })) } },
      create: {
        name: ROLE_NAME.Admin,
        description: ROLE_DESCRIPTIONS[ROLE_NAME.Admin],
        isSystem: true,
        permissions: { connect: all.map((p) => ({ id: p.id })) },
      },
    });

    for (const [name, codes] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      const exists = await prisma.role.findUnique({ where: { name } });
      if (exists) continue;
      await prisma.role.create({
        data: {
          name,
          description: ROLE_DESCRIPTIONS[name],
          isSystem: true,
          permissions: { connect: all.filter((p) => (codes as string[]).includes(p.name)).map((p) => ({ id: p.id })) },
        },
      });
      console.log(`Tạo vai trò ${name}`);
    }

    if (!(await prisma.reportTemplate.findFirst({ where: { isDefault: true } }))) {
      await prisma.reportTemplate.create({ data: { name: 'Mặc định', isDefault: true, config: DEFAULT_REPORT_TEMPLATE } });
      console.log('Tạo mẫu bảng điểm mặc định');
    }

    // Loại bài và hệ số mặc định: chỉ tạo khi chưa có loại nào, để không ghi đè cấu hình Admin đã sửa
    if ((await prisma.assessmentCategory.count()) === 0) {
      await prisma.assessmentCategory.createMany({ data: DEFAULT_CATEGORIES });
      console.log(`Tạo ${DEFAULT_CATEGORIES.length} loại bài mặc định`);
    }
    console.log('Seed xong');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
