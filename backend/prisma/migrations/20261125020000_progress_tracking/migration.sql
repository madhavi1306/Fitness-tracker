ALTER TABLE "User" ADD COLUMN "startingWeightKg" DOUBLE PRECISION NOT NULL DEFAULT 75;
UPDATE "User" SET "startingWeightKg" = "currentWeightKg";

CREATE TABLE "PersonalRecord" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "workoutSessionId" TEXT NOT NULL,
    "exerciseName" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "previousValue" DOUBLE PRECISION,
    "weightKg" DOUBLE PRECISION,
    "reps" INTEGER,
    "achievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PersonalRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WeightEntry" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WeightEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PersonalRecord_ownerId_achievedAt_idx" ON "PersonalRecord"("ownerId", "achievedAt");
CREATE INDEX "PersonalRecord_ownerId_exerciseName_recordType_idx" ON "PersonalRecord"("ownerId", "exerciseName", "recordType");
CREATE UNIQUE INDEX "WeightEntry_ownerId_date_key" ON "WeightEntry"("ownerId", "date");
CREATE INDEX "WeightEntry_ownerId_date_idx" ON "WeightEntry"("ownerId", "date");

ALTER TABLE "PersonalRecord" ADD CONSTRAINT "PersonalRecord_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PersonalRecord" ADD CONSTRAINT "PersonalRecord_workoutSessionId_fkey"
  FOREIGN KEY ("workoutSessionId") REFERENCES "WorkoutSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WeightEntry" ADD CONSTRAINT "WeightEntry_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
