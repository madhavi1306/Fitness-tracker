-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "FitnessGoal" AS ENUM ('WEIGHT_GAIN', 'WEIGHT_LOSS', 'MAINTAIN_WEIGHT', 'BUILD_STRENGTH');

-- CreateEnum
CREATE TYPE "ActivityLevel" AS ENUM ('SEDENTARY', 'LIGHTLY_ACTIVE', 'MODERATELY_ACTIVE', 'VERY_ACTIVE', 'EXTRA_ACTIVE');

-- CreateEnum
CREATE TYPE "DietaryPreference" AS ENUM ('NONE', 'VEGETARIAN', 'VEGAN', 'PESCATARIAN', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "heightCm" DOUBLE PRECISION NOT NULL,
    "currentWeightKg" DOUBLE PRECISION NOT NULL,
    "targetWeightKg" DOUBLE PRECISION,
    "fitnessGoal" "FitnessGoal" NOT NULL,
    "activityLevel" "ActivityLevel" NOT NULL DEFAULT 'MODERATELY_ACTIVE',
    "dietaryPreference" "DietaryPreference" NOT NULL DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");
