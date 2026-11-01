-- F10: stav zápisového okna. Dřív ruční stav (DRAFT / SCHEDULED / OPEN / CLOSED) + příznak „viditelné studentům“.
-- Nově: `published` (koncept / zveřejněno) a `closedEarlyAt` (předčasně uzavřeno). Stav plánováno / otevřeno / uzavřeno
-- se odvozuje z dat a nikde se neukládá.

ALTER TABLE "EnrollmentWindow" ADD COLUMN "published" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EnrollmentWindow" ADD COLUMN "closedEarlyAt" TIMESTAMP(3);

-- Studenti okno viděli jen tehdy, když nebylo koncept a bylo viditelné: tak se zveřejněné okno převádí.
-- (Skryté okno, které nebylo koncept, se stává konceptem: pro studenty se nic nemění.)
UPDATE "EnrollmentWindow" SET "published" = ("status" <> 'DRAFT' AND "visibleToStudents");

-- Ruční uzavření před koncem = předčasně uzavřeno. Stav CLOSED po uplynutí konce byl jen automatický zápis času.
UPDATE "EnrollmentWindow" SET "closedEarlyAt" = LEAST("updatedAt", now())
  WHERE "status" = 'CLOSED' AND "endsAt" > now() AND "published";

ALTER TABLE "EnrollmentWindow" DROP COLUMN "status";
ALTER TABLE "EnrollmentWindow" DROP COLUMN "visibleToStudents";
DROP TYPE "Status";
