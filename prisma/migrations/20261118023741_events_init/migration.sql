-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EventVisibility" AS ENUM ('PUBLIC', 'USERS');

-- CreateEnum
CREATE TYPE "EventConfirmChannel" AS ENUM ('EMAIL_AND_SCREEN', 'SCREEN_ONLY', 'EMAIL_ONLY');

-- CreateEnum
CREATE TYPE "EventFieldType" AS ENUM ('TEXT', 'TEXTAREA', 'SELECT', 'CHECKBOX');

-- CreateEnum
CREATE TYPE "EventFieldMode" AS ENUM ('REQUIRED', 'OPTIONAL', 'HIDDEN');

-- CreateEnum
CREATE TYPE "EventRegistrationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'WAITLIST');

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "place" TEXT,
    "contact" TEXT,
    "descriptionHtml" TEXT NOT NULL DEFAULT '',
    "imageId" TEXT,
    "imageAlt" TEXT,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "EventVisibility" NOT NULL DEFAULT 'PUBLIC',
    "registrationOpensAt" TIMESTAMP(3),
    "registrationClosesAt" TIMESTAMP(3),
    "maxItemsPerRegistration" INTEGER NOT NULL DEFAULT 1,
    "allowGuests" BOOLEAN NOT NULL DEFAULT false,
    "maxGuests" INTEGER NOT NULL DEFAULT 0,
    "changeDeadlineMinutes" INTEGER NOT NULL DEFAULT 1440,
    "maxRegistrationsPerEmail" INTEGER NOT NULL DEFAULT 1,
    "confirmChannel" "EventConfirmChannel" NOT NULL DEFAULT 'EMAIL_AND_SCREEN',
    "confirmationText" TEXT,
    "consentText" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "purgedAt" TIMESTAMP(3),

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventOrganizer" (
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "EventOrganizer_pkey" PRIMARY KEY ("eventId","userId")
);

-- CreateTable
CREATE TABLE "EventAudience" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" "AudienceType" NOT NULL,
    "grade" INTEGER,
    "classGroupId" TEXT,
    "userId" TEXT,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventAudience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventImage" (
    "id" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mime" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "size" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventItem" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "label" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "capacity" INTEGER,
    "note" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "EventItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventField" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" "EventFieldType" NOT NULL,
    "label" TEXT NOT NULL,
    "mode" "EventFieldMode" NOT NULL DEFAULT 'OPTIONAL',
    "options" TEXT[],
    "order" INTEGER NOT NULL DEFAULT 0,
    "builtin" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "EventField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRegistration" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "guests" INTEGER NOT NULL DEFAULT 0,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "status" "EventRegistrationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "tokenHash" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,
    "attendedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "EventRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRegistrationItem" (
    "registrationId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,

    CONSTRAINT "EventRegistrationItem_pkey" PRIMARY KEY ("registrationId","itemId")
);

-- CreateTable
CREATE TABLE "EventRateLimit" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EventRateLimit_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateIndex
CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");

-- CreateIndex
CREATE INDEX "Event_status_idx" ON "Event"("status");

-- CreateIndex
CREATE INDEX "Event_createdById_idx" ON "Event"("createdById");

-- CreateIndex
CREATE INDEX "EventOrganizer_userId_idx" ON "EventOrganizer"("userId");

-- CreateIndex
CREATE INDEX "EventAudience_userId_idx" ON "EventAudience"("userId");

-- CreateIndex
CREATE INDEX "EventAudience_classGroupId_idx" ON "EventAudience"("classGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "EventAudience_eventId_key_key" ON "EventAudience"("eventId", "key");

-- CreateIndex
CREATE INDEX "EventItem_eventId_order_idx" ON "EventItem"("eventId", "order");

-- CreateIndex
CREATE INDEX "EventField_eventId_order_idx" ON "EventField"("eventId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "EventField_eventId_key_key" ON "EventField"("eventId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "EventRegistration_tokenHash_key" ON "EventRegistration"("tokenHash");

-- CreateIndex
CREATE INDEX "EventRegistration_eventId_email_idx" ON "EventRegistration"("eventId", "email");

-- CreateIndex
CREATE INDEX "EventRegistration_userId_idx" ON "EventRegistration"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EventRegistration_eventId_code_key" ON "EventRegistration"("eventId", "code");

-- CreateIndex
CREATE INDEX "EventRegistrationItem_itemId_idx" ON "EventRegistrationItem"("itemId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "EventImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventOrganizer" ADD CONSTRAINT "EventOrganizer_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventOrganizer" ADD CONSTRAINT "EventOrganizer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAudience" ADD CONSTRAINT "EventAudience_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAudience" ADD CONSTRAINT "EventAudience_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "ClassGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAudience" ADD CONSTRAINT "EventAudience_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventItem" ADD CONSTRAINT "EventItem_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventField" ADD CONSTRAINT "EventField_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistrationItem" ADD CONSTRAINT "EventRegistrationItem_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "EventRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistrationItem" ADD CONSTRAINT "EventRegistrationItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "EventItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
