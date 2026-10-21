-- CreateEnum
CREATE TYPE "GradingMode" AS ENUM ('AI', 'MANUAL');

-- AlterTable
ALTER TABLE "exams" ADD COLUMN     "category_id" UUID,
ADD COLUMN     "grading_mode" "GradingMode" NOT NULL DEFAULT 'AI',
ADD COLUMN     "weight" DECIMAL(5,2);

-- CreateTable
CREATE TABLE "assessment_categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "weight" DECIMAL(5,2) NOT NULL DEFAULT 1,
    "header_fill" TEXT NOT NULL DEFAULT '#E2EFDA',
    "header_font" TEXT NOT NULL DEFAULT '#000000',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_sessions" (
    "id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendances" (
    "session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" TEXT,
    "homework" TEXT,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("session_id","student_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assessment_categories_name_key" ON "assessment_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "class_sessions_class_id_date_key" ON "class_sessions"("class_id", "date");

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "assessment_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
