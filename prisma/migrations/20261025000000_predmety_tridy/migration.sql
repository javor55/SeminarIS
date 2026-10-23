-- Předměty, pevné třídy, žádost o třídu při registraci.
--
-- Migrace zachovává existující data:
--  * řádky Seminar se přenesou do Subject (se stejným id), výskyty v zápisech se přepojí;
--  * třídy z kohort (rok nástupu) se převedou na pevné třídy (ročník + písmeno),
--    historie zařazení a úvazky se přepojí na třídu, ve které studenti v tom roce skutečně byli.

-- ======================================================================
-- 1. PŘEDMĚTY: Seminar -> Subject
-- ======================================================================

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "grades" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "syllabus" TEXT,
ADD COLUMN     "updatedById" TEXT,
ALTER COLUMN "code" DROP NOT NULL;

-- Zkratka předmětu je teď nepovinná a jedinečná. U seminářů nebyla jedinečná,
-- proto si zkratku ponechá jen první výskyt (zkratky existujících předmětů mají přednost),
-- ostatním se zkratka vyprázdní. Prázdný řetězec je totéž co žádná zkratka.
INSERT INTO "Subject" ("id", "name", "code", "description", "syllabus", "grades", "isActive", "createdById", "updatedById", "createdAt", "updatedAt")
SELECT
  s."id",
  s."name",
  CASE
    WHEN s."code_norm" IS NULL THEN NULL
    WHEN EXISTS (SELECT 1 FROM "Subject" x WHERE upper(x."code") = s."code_norm") THEN NULL
    WHEN s."rn" > 1 THEN NULL
    ELSE s."code_norm"
  END,
  s."description",
  NULLIF(s."syllabus", ''),
  ARRAY[]::INTEGER[],
  s."isActive",
  s."createdById",
  s."updatedById",
  s."createdAt",
  s."updatedAt"
FROM (
  SELECT
    sem.*,
    NULLIF(upper(btrim(sem."code")), '') AS "code_norm",
    row_number() OVER (PARTITION BY NULLIF(upper(btrim(sem."code")), '') ORDER BY sem."createdAt", sem."id") AS "rn"
  FROM "Seminar" sem
) s;

-- DropForeignKey
ALTER TABLE "Seminar" DROP CONSTRAINT "Seminar_createdById_fkey";

-- DropForeignKey
ALTER TABLE "Seminar" DROP CONSTRAINT "Seminar_updatedById_fkey";

-- DropForeignKey
ALTER TABLE "SubjectOccurrence" DROP CONSTRAINT "SubjectOccurrence_seminarId_fkey";

-- DropIndex
DROP INDEX "SubjectOccurrence_seminarId_idx";

-- Výskyty: sloupec seminarId se přejmenuje na subjectId, id předmětů zůstala stejná
ALTER TABLE "SubjectOccurrence" RENAME COLUMN "seminarId" TO "subjectId";

-- DropTable
DROP TABLE "Seminar";

-- CreateIndex
CREATE INDEX "SubjectOccurrence_subjectId_idx" ON "SubjectOccurrence"("subjectId");

-- AddForeignKey
ALTER TABLE "SubjectOccurrence" ADD CONSTRAINT "SubjectOccurrence_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ======================================================================
-- 2. PEVNÉ TŘÍDY: (entryYear, letter) -> (grade, letter)
-- ======================================================================

-- Aktuální školní rok (startYear): označený rok, jinak podle data (školní rok začíná 1. září)
CREATE TEMP TABLE "_cur" AS
SELECT COALESCE(
  (SELECT "startYear" FROM "SchoolYear" WHERE "isCurrent" ORDER BY "startYear" DESC LIMIT 1),
  CASE WHEN EXTRACT(MONTH FROM now()) >= 9 THEN EXTRACT(YEAR FROM now())::int ELSE EXTRACT(YEAR FROM now())::int - 1 END
) AS "y";

-- Ročník dnešní třídy; (entryYear, letter) bylo jedinečné, takže (grade, letter) také
-- DropIndex (dočasné řádky níže nemají smysluplný rok nástupu)
DROP INDEX "ClassGroup_entryYear_letter_key";

ALTER TABLE "ClassGroup" ADD COLUMN "grade" INTEGER;
UPDATE "ClassGroup" SET "grade" = (SELECT "y" FROM "_cur") - "entryYear" + 1;
ALTER TABLE "ClassGroup" ALTER COLUMN "grade" SET NOT NULL;

-- Třídy, které v daném roce skutečně existovaly a dnes mají jiný ročník (historie zařazení
-- a úvazky z minulých let), dostanou vlastní pevnou třídu. Ročník v historii je uložený
-- v ClassMembership.grade, u úvazků se spočítá z roku úvazku.
INSERT INTO "ClassGroup" ("id", "letter", "grade", "entryYear", "studyYears", "updatedAt")
SELECT gen_random_uuid()::text, h."letter", h."grade", 0, 4, now()
FROM (
  SELECT DISTINCT c."letter", m."grade"
  FROM "ClassMembership" m JOIN "ClassGroup" c ON c."id" = m."classGroupId"
  UNION
  SELECT DISTINCT c."letter", y."startYear" - c."entryYear" + 1
  FROM "TeachingAssignment" t
  JOIN "ClassGroup" c ON c."id" = t."classGroupId"
  JOIN "SchoolYear" y ON y."id" = t."schoolYearId"
) h
WHERE h."grade" BETWEEN 1 AND 4
  AND NOT EXISTS (SELECT 1 FROM "ClassGroup" n WHERE n."grade" = h."grade" AND n."letter" = h."letter");

-- Historie zařazení: přepojit na pevnou třídu (ročník z membership, písmeno ze staré třídy)
UPDATE "ClassMembership" m
SET "classGroupId" = n."id"
FROM "ClassGroup" c, "ClassGroup" n
WHERE c."id" = m."classGroupId"
  AND n."grade" = m."grade" AND n."letter" = c."letter"
  AND m."grade" BETWEEN 1 AND 4
  AND n."id" <> m."classGroupId";

-- Úvazky: třída, ve které se v daném školním roce skutečně učilo (jinak by se po přejmenování
-- ročníků přesunuly do jiného ročníku). Přepojení po jedné řádce by narazilo na jedinečný klíč
-- (třída se uvolní až v téže příkazu), proto se úvazky přepočítají do pomocné tabulky a vloží znovu.
-- Úvazky mimo ročníky 1–4 se tím zahodí.
CREATE TEMP TABLE "_ta" AS
SELECT t."id", t."teacherId", t."subjectId", n."id" AS "classGroupId", t."schoolYearId", t."createdAt"
FROM "TeachingAssignment" t
JOIN "ClassGroup" c ON c."id" = t."classGroupId"
JOIN "SchoolYear" y ON y."id" = t."schoolYearId"
JOIN "ClassGroup" n ON n."grade" = y."startYear" - c."entryYear" + 1 AND n."letter" = c."letter"
WHERE y."startYear" - c."entryYear" + 1 BETWEEN 1 AND 4;

DELETE FROM "TeachingAssignment";

INSERT INTO "TeachingAssignment" ("id", "teacherId", "subjectId", "classGroupId", "schoolYearId", "createdAt")
SELECT "id", "teacherId", "subjectId", "classGroupId", "schoolYearId", "createdAt" FROM "_ta"
ON CONFLICT DO NOTHING;

DROP TABLE "_ta";

-- Absolventi a ukončení studenti zůstanou ve své poslední třídě z historie (ne ve třídě, do které
-- by se jejich kohorta mezitím posunula).
UPDATE "User" u
SET "classGroupId" = COALESCE((
  SELECT m."classGroupId"
  FROM "ClassMembership" m JOIN "SchoolYear" y ON y."id" = m."schoolYearId"
  WHERE m."userId" = u."id" AND m."grade" BETWEEN 1 AND 4
  ORDER BY y."startYear" DESC LIMIT 1
), u."classGroupId")
WHERE u."studyStatus" <> 'ACTIVE' AND u."classGroupId" IS NOT NULL;

-- Studující ve třídách mimo ročníky 1–4 (předčasně založené nebo neuzavřené třídy) zůstanou bez zařazení
UPDATE "User"
SET "classGroupId" = NULL
WHERE "classGroupId" IN (SELECT "id" FROM "ClassGroup" WHERE "grade" NOT BETWEEN 1 AND 4);

-- Třídy mimo ročníky 1–4 pryč (zbylá historie a úvazky se smažou kaskádou)
DELETE FROM "ClassGroup" WHERE "grade" NOT BETWEEN 1 AND 4;

-- AlterTable
ALTER TABLE "ClassGroup" DROP COLUMN "entryYear",
DROP COLUMN "studyYears";

-- CreateIndex
CREATE UNIQUE INDEX "ClassGroup_grade_letter_key" ON "ClassGroup"("grade", "letter");

DROP TABLE "_cur";

-- ======================================================================
-- 3. ŽÁDOST O TŘÍDU PŘI REGISTRACI
-- ======================================================================

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "requestedClassGroupId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_requestedClassGroupId_fkey" FOREIGN KEY ("requestedClassGroupId") REFERENCES "ClassGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
