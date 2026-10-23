-- Modul Dopisování písemek: termíny, povolené předměty, zápisy studentů.

-- CreateEnum
CREATE TYPE "MakeupAttendance" AS ENUM ('REGISTERED', 'ATTENDED', 'NO_SHOW');

-- CreateTable
CREATE TABLE "MakeupSession" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "room" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "changeDeadlineMinutes" INTEGER NOT NULL DEFAULT 60,
    "note" TEXT,
    "seriesId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MakeupSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MakeupSessionSubject" (
    "sessionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,

    CONSTRAINT "MakeupSessionSubject_pkey" PRIMARY KEY ("sessionId","subjectId")
);

-- CreateTable
CREATE TABLE "MakeupRegistration" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "note" TEXT,
    "attendance" "MakeupAttendance" NOT NULL DEFAULT 'REGISTERED',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MakeupRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MakeupRegistrationSubject" (
    "registrationId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "subjectTeacherId" TEXT,

    CONSTRAINT "MakeupRegistrationSubject_pkey" PRIMARY KEY ("registrationId","subjectId")
);

-- CreateIndex
CREATE INDEX "MakeupSession_startsAt_idx" ON "MakeupSession"("startsAt");

-- CreateIndex
CREATE INDEX "MakeupSession_teacherId_startsAt_idx" ON "MakeupSession"("teacherId", "startsAt");

-- CreateIndex
CREATE INDEX "MakeupSession_seriesId_idx" ON "MakeupSession"("seriesId");

-- CreateIndex
CREATE INDEX "MakeupRegistration_studentId_idx" ON "MakeupRegistration"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "MakeupRegistration_sessionId_studentId_key" ON "MakeupRegistration"("sessionId", "studentId");

-- CreateIndex
CREATE INDEX "MakeupRegistrationSubject_subjectTeacherId_idx" ON "MakeupRegistrationSubject"("subjectTeacherId");

-- AddForeignKey
ALTER TABLE "MakeupSession" ADD CONSTRAINT "MakeupSession_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MakeupSessionSubject" ADD CONSTRAINT "MakeupSessionSubject_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "MakeupSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MakeupSessionSubject" ADD CONSTRAINT "MakeupSessionSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MakeupRegistration" ADD CONSTRAINT "MakeupRegistration_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "MakeupSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MakeupRegistration" ADD CONSTRAINT "MakeupRegistration_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MakeupRegistrationSubject" ADD CONSTRAINT "MakeupRegistrationSubject_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "MakeupRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MakeupRegistrationSubject" ADD CONSTRAINT "MakeupRegistrationSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MakeupRegistrationSubject" ADD CONSTRAINT "MakeupRegistrationSubject_subjectTeacherId_fkey" FOREIGN KEY ("subjectTeacherId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

