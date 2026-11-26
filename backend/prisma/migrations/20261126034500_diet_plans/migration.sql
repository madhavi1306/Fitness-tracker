CREATE TABLE "DietPlan" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "goal" TEXT NOT NULL,
    "dietaryPreference" "DietaryPreference" NOT NULL,
    "estimatedCalories" DOUBLE PRECISION NOT NULL,
    "estimatedProteinGrams" DOUBLE PRECISION NOT NULL,
    "estimatedCarbsGrams" DOUBLE PRECISION NOT NULL,
    "estimatedFatGrams" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DietPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DietPlanMeal" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "mealType" "MealType" NOT NULL,
    "name" TEXT NOT NULL,
    "ingredients" JSONB NOT NULL,
    "nutrition" JSONB NOT NULL,
    CONSTRAINT "DietPlanMeal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DietPlan_ownerId_date_idx" ON "DietPlan"("ownerId", "date");
CREATE INDEX "DietPlanMeal_planId_idx" ON "DietPlanMeal"("planId");
CREATE UNIQUE INDEX "DietPlanMeal_planId_mealType_key" ON "DietPlanMeal"("planId", "mealType");

ALTER TABLE "DietPlan" ADD CONSTRAINT "DietPlan_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DietPlanMeal" ADD CONSTRAINT "DietPlanMeal_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "DietPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
