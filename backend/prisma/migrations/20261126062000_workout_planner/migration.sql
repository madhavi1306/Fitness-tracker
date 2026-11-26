CREATE TABLE "WorkoutPlan" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "planType" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "splitPreference" TEXT NOT NULL,
    "daysPerWeek" INTEGER NOT NULL,
    "availableMinutes" INTEGER NOT NULL,
    "equipment" TEXT[],
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkoutPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkoutPlanDay" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "focus" TEXT NOT NULL,
    "isRestDay" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "estimatedDurationMinutes" INTEGER NOT NULL,
    "warmup" TEXT NOT NULL,
    "cooldown" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "guidance" TEXT NOT NULL,
    CONSTRAINT "WorkoutPlanDay_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkoutPlanExercise" (
    "id" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "sets" INTEGER NOT NULL,
    "reps" INTEGER NOT NULL,
    "restSeconds" INTEGER NOT NULL,
    "notes" TEXT,
    CONSTRAINT "WorkoutPlanExercise_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WorkoutSession" ADD COLUMN "planDayId" TEXT;

CREATE INDEX "WorkoutPlan_ownerId_isActive_startDate_endDate_idx"
  ON "WorkoutPlan"("ownerId", "isActive", "startDate", "endDate");
CREATE UNIQUE INDEX "WorkoutPlanDay_planId_date_key" ON "WorkoutPlanDay"("planId", "date");
CREATE INDEX "WorkoutPlanDay_date_status_idx" ON "WorkoutPlanDay"("date", "status");
CREATE UNIQUE INDEX "WorkoutPlanExercise_dayId_order_key" ON "WorkoutPlanExercise"("dayId", "order");
CREATE UNIQUE INDEX "WorkoutPlanExercise_dayId_exerciseId_key" ON "WorkoutPlanExercise"("dayId", "exerciseId");
CREATE INDEX "WorkoutSession_planDayId_idx" ON "WorkoutSession"("planDayId");

ALTER TABLE "WorkoutPlan" ADD CONSTRAINT "WorkoutPlan_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutPlanDay" ADD CONSTRAINT "WorkoutPlanDay_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "WorkoutPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutPlanExercise" ADD CONSTRAINT "WorkoutPlanExercise_dayId_fkey"
  FOREIGN KEY ("dayId") REFERENCES "WorkoutPlanDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutPlanExercise" ADD CONSTRAINT "WorkoutPlanExercise_exerciseId_fkey"
  FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_planDayId_fkey"
  FOREIGN KEY ("planDayId") REFERENCES "WorkoutPlanDay"("id") ON DELETE SET NULL ON UPDATE CASCADE;
