/**
 * Tạo tài khoản admin đầu tiên, hoặc đặt lại mật khẩu nếu đã có (upsert, như bootstrap-admin.ts của IUROADMAP).
 * Đọc ADMIN_USERNAME và ADMIN_PASSWORD từ .env. Đăng nhập xong phải đổi mật khẩu,
 * rồi xoá ADMIN_PASSWORD khỏi .env. Admin quên mật khẩu thì điền lại và chạy lại lệnh này.
 */
import { PrismaClient } from '@prisma/client';
import { ROLE_NAME } from '@missngoc/core';
import { hashPassword, PASSWORD_MIN_LENGTH } from '../modules/auth/password';
import { loadEnv } from './load-env';

async function main() {
  loadEnv();
  const username = (process.env.ADMIN_USERNAME ?? 'admin').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error('Thiếu ADMIN_PASSWORD trong .env');
  if (password.length < PASSWORD_MIN_LENGTH) throw new Error(`ADMIN_PASSWORD cần ít nhất ${PASSWORD_MIN_LENGTH} ký tự`);
  if (!/^[a-z0-9.]{3,30}$/.test(username)) throw new Error('ADMIN_USERNAME chỉ gồm chữ thường, số, dấu chấm; 3–30 ký tự');

  const prisma = new PrismaClient();
  try {
    const role = await prisma.role.findUnique({ where: { name: ROLE_NAME.Admin } });
    if (!role) throw new Error('Chưa có vai trò ADMIN. Chạy seed trước: npm run db:seed');
    const passwordHash = await hashPassword(password);
    await prisma.user.upsert({
      where: { username },
      update: { passwordHash, roleId: role.id, status: 'ACTIVE', mustChangePassword: true, failedLoginCount: 0, lockedUntil: null },
      create: { username, fullName: 'Quản trị viên', passwordHash, roleId: role.id, mustChangePassword: true },
    });
    console.log(`Tài khoản admin sẵn sàng: ${username}. Đăng nhập rồi đổi mật khẩu, sau đó xoá ADMIN_PASSWORD khỏi .env`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
