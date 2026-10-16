/**
 * Dữ liệu mẫu để chạy thử: lớp "Starters 3", 5 học sinh khớp bộ ảnh poc-samples/datasets/starters3,
 * bài kiểm tra 10 câu A–D với đáp án B B C D A B C D A B. Chạy lại nhiều lần không tạo trùng.
 *   npm run db:demo
 */
import { PrismaClient } from '@prisma/client';
import { loadEnv } from './load-env';

const CLASS_NAME = 'Starters 3';
const EXAM_TITLE = 'Starters 3 – Unit test';
const KEY = ['B', 'B', 'C', 'D', 'A', 'B', 'C', 'D', 'A', 'B'];
// Tên hư cấu, trùng tên viết trên 5 ảnh mẫu
const STUDENTS = [
  { code: 'S3-01', name: 'Nguyễn Minh Anh' },
  { code: 'S3-02', name: 'Trần Gia Bảo' },
  { code: 'S3-03', name: 'Lê Khánh Linh' },
  { code: 'S3-04', name: 'Phạm Quốc Huy' },
  { code: 'S3-05', name: 'Võ Ngọc Hân' },
];

async function main() {
  loadEnv();
  const prisma = new PrismaClient();
  try {
    const cls =
      (await prisma.class.findFirst({ where: { name: CLASS_NAME, status: 'ACTIVE' } })) ??
      (await prisma.class.create({ data: { name: CLASS_NAME, level: 'Starters' } }));

    for (const s of STUDENTS) {
      const student = await prisma.student.upsert({
        where: { studentCode: s.code },
        update: { fullName: s.name },
        create: { studentCode: s.code, fullName: s.name },
      });
      const enrolled = await prisma.enrollment.findFirst({ where: { classId: cls.id, studentId: student.id, leftAt: null } });
      if (!enrolled) await prisma.enrollment.create({ data: { classId: cls.id, studentId: student.id } });
    }

    const exam =
      (await prisma.exam.findFirst({ where: { classId: cls.id, title: EXAM_TITLE } })) ??
      (await prisma.exam.create({
        data: {
          classId: cls.id,
          title: EXAM_TITLE,
          examDate: new Date(),
          questionCount: KEY.length,
          options: 'ABCD',
          maxScore: 10,
          layoutHint: "Đề có câu hỏi in sẵn A/B/C/D. Học sinh viết chữ cái trong bảng 'Your answers:' cuối trang, mỗi ô có số câu rồi tới chữ học sinh viết.",
        },
      }));

    const key = await prisma.answerKey.upsert({
      where: { examId_versionCode: { examId: exam.id, versionCode: '' } },
      update: {},
      create: { examId: exam.id, versionCode: '' },
    });
    await prisma.answerKeyItem.deleteMany({ where: { answerKeyId: key.id } });
    await prisma.answerKeyItem.createMany({
      data: KEY.map((correct, i) => ({ answerKeyId: key.id, questionNo: i + 1, correct: [correct], points: 1 })),
    });

    console.log(`Lớp "${CLASS_NAME}": ${STUDENTS.length} học sinh · bài "${EXAM_TITLE}" · đáp án ${KEY.join('')}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
