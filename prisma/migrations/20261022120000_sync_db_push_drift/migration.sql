-- Dorovnání stavu po změnách provedených přes `prisma db push` (Subject.description/isActive,
-- volitelný SubjectOccurrence.teacherId, kaskádové mazání, User.cohort, SystemSetting).
-- Na produkci, kde už tyto změny jsou, se NESPOUŠTÍ – jen se označí jako aplikovaná:
--   npx prisma migrate resolve --applied 20261022120000_sync_db_push_drift

-- DropForeignKey
ALTER TABLE "Block" DROP CONSTRAINT "Block_enrollmentWindowId_fkey";

-- DropForeignKey
ALTER TABLE "StudentEnrollment" DROP CONSTRAINT "StudentEnrollment_subjectOccurrenceId_fkey";

-- DropForeignKey
ALTER TABLE "SubjectOccurrence" DROP CONSTRAINT "SubjectOccurrence_blockId_fkey";

-- DropForeignKey
ALTER TABLE "SubjectOccurrence" DROP CONSTRAINT "SubjectOccurrence_subjectId_fkey";

-- DropForeignKey
ALTER TABLE "SubjectOccurrence" DROP CONSTRAINT "SubjectOccurrence_teacherId_fkey";

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "description" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "SubjectOccurrence" ALTER COLUMN "teacherId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "cohort" TEXT;

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_enrollmentWindowId_fkey" FOREIGN KEY ("enrollmentWindowId") REFERENCES "EnrollmentWindow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectOccurrence" ADD CONSTRAINT "SubjectOccurrence_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectOccurrence" ADD CONSTRAINT "SubjectOccurrence_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectOccurrence" ADD CONSTRAINT "SubjectOccurrence_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEnrollment" ADD CONSTRAINT "StudentEnrollment_subjectOccurrenceId_fkey" FOREIGN KEY ("subjectOccurrenceId") REFERENCES "SubjectOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

