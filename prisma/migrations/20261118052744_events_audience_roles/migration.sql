-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "audienceRoles" "Role"[] DEFAULT ARRAY['STUDENT']::"Role"[];
