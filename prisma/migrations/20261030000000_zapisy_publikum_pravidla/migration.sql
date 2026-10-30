-- CreateEnum
CREATE TYPE "AudienceType" AS ENUM ('GRADE', 'CLASS', 'USER', 'EXCLUDE_USER');

-- CreateEnum
CREATE TYPE "ResultsVisibility" AS ENUM ('COUNTS', 'NAMES');

-- AlterTable
ALTER TABLE "EnrollmentWindow" ADD COLUMN     "allowSelfUnenroll" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "changesUntil" TIMESTAMP(3),
ADD COLUMN     "resultsVisibility" "ResultsVisibility" NOT NULL DEFAULT 'COUNTS';

-- AlterTable
ALTER TABLE "Block" ADD COLUMN     "maxEnrollments" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "minEnrollments" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "required" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "SubjectOccurrence" ADD COLUMN     "restrictGrades" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- CreateTable
CREATE TABLE "EnrollmentWindowAudience" (
    "id" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "type" "AudienceType" NOT NULL,
    "grade" INTEGER,
    "classGroupId" TEXT,
    "userId" TEXT,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnrollmentWindowAudience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_OccurrenceClasses" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_OccurrenceClasses_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "EnrollmentWindowAudience_userId_idx" ON "EnrollmentWindowAudience"("userId");

-- CreateIndex
CREATE INDEX "EnrollmentWindowAudience_classGroupId_idx" ON "EnrollmentWindowAudience"("classGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentWindowAudience_windowId_key_key" ON "EnrollmentWindowAudience"("windowId", "key");

-- Převod dosavadních cílových ročníků oken (targetGrades) na položky publika typu GRADE.
-- Okna s prázdným polem (= všichni) zůstanou bez položek, tedy dál pro všechny aktivní studenty.
INSERT INTO "EnrollmentWindowAudience" ("id", "windowId", "type", "grade", "key")
SELECT 'aud_' || substr(md5(w."id" || ':' || g::text), 1, 24), w."id", 'GRADE'::"AudienceType", g, 'GRADE:' || g::text
FROM "EnrollmentWindow" w, unnest(w."targetGrades") AS g;

-- Starý sloupec už není potřeba
ALTER TABLE "EnrollmentWindow" DROP COLUMN "targetGrades";

-- CreateIndex
CREATE INDEX "_OccurrenceClasses_B_index" ON "_OccurrenceClasses"("B");

-- AddForeignKey
ALTER TABLE "EnrollmentWindowAudience" ADD CONSTRAINT "EnrollmentWindowAudience_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "EnrollmentWindow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentWindowAudience" ADD CONSTRAINT "EnrollmentWindowAudience_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "ClassGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentWindowAudience" ADD CONSTRAINT "EnrollmentWindowAudience_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OccurrenceClasses" ADD CONSTRAINT "_OccurrenceClasses_A_fkey" FOREIGN KEY ("A") REFERENCES "ClassGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OccurrenceClasses" ADD CONSTRAINT "_OccurrenceClasses_B_fkey" FOREIGN KEY ("B") REFERENCES "SubjectOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

