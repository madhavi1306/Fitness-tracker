CREATE TYPE "MealType" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACKS');

CREATE TABLE "Food" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "servingUnit" TEXT NOT NULL,
    "servingSize" DOUBLE PRECISION NOT NULL,
    "calories" DOUBLE PRECISION NOT NULL,
    "proteinGrams" DOUBLE PRECISION NOT NULL,
    "carbohydratesGrams" DOUBLE PRECISION NOT NULL,
    "fatGrams" DOUBLE PRECISION NOT NULL,
    "dietaryTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Food_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FoodLog" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "foodId" TEXT,
    "foodName" TEXT NOT NULL,
    "servingUnit" TEXT NOT NULL,
    "servingSize" DOUBLE PRECISION NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "mealType" "MealType" NOT NULL,
    "calories" DOUBLE PRECISION NOT NULL,
    "proteinGrams" DOUBLE PRECISION NOT NULL,
    "carbohydratesGrams" DOUBLE PRECISION NOT NULL,
    "fatGrams" DOUBLE PRECISION NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FoodLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NutritionTarget" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "maintenanceCalories" INTEGER NOT NULL,
    "dailyCalories" INTEGER NOT NULL,
    "proteinGrams" DOUBLE PRECISION NOT NULL,
    "carbohydratesGrams" DOUBLE PRECISION NOT NULL,
    "fatGrams" DOUBLE PRECISION NOT NULL,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NutritionTarget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Food_ownerId_name_key" ON "Food"("ownerId", "name");
CREATE INDEX "Food_category_idx" ON "Food"("category");
CREATE INDEX "FoodLog_ownerId_loggedAt_idx" ON "FoodLog"("ownerId", "loggedAt");
CREATE INDEX "FoodLog_ownerId_mealType_loggedAt_idx" ON "FoodLog"("ownerId", "mealType", "loggedAt");
CREATE UNIQUE INDEX "NutritionTarget_ownerId_key" ON "NutritionTarget"("ownerId");

ALTER TABLE "Food" ADD CONSTRAINT "Food_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FoodLog" ADD CONSTRAINT "FoodLog_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FoodLog" ADD CONSTRAINT "FoodLog_foodId_fkey"
  FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NutritionTarget" ADD CONSTRAINT "NutritionTarget_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
