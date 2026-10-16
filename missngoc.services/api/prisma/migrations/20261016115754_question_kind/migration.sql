-- CreateEnum
CREATE TYPE "QuestionKind" AS ENUM ('choice', 'text');

-- AlterTable
ALTER TABLE "answer_key_items" ADD COLUMN     "kind" "QuestionKind" NOT NULL DEFAULT 'choice';
