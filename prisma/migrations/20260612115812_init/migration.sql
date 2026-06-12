-- CreateEnum
CREATE TYPE "Role" AS ENUM ('EMPLOYEE', 'SUPERVISOR');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('VALIDATED', 'ACTIVE', 'REPLACED');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('PLANNED', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "AssignmentSource" AS ENUM ('FROM_WISH', 'MANUAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contractWeeklyHours" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastImport" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "importedById" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "ForecastImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastInterval" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "intervalStart" TEXT NOT NULL,
    "expectedCalls" DOUBLE PRECISION NOT NULL,
    "ahtSeconds" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ForecastInterval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffingParameter" (
    "id" TEXT NOT NULL,
    "serviceLevelTarget" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "thresholdSeconds" INTEGER NOT NULL DEFAULT 20,
    "shrinkagePercent" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "maxOccupancy" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "intervalLengthMinutes" INTEGER NOT NULL DEFAULT 30,
    "openingTime" TEXT NOT NULL DEFAULT '08:00',
    "closingTime" TEXT NOT NULL DEFAULT '18:00',
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffingParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffingRequirement" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "intervalStart" TEXT NOT NULL,
    "requiredAgents" INTEGER NOT NULL,

    CONSTRAINT "StaffingRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "paidBreakMinutes" INTEGER NOT NULL DEFAULT 30,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ShiftTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanningPeriod" (
    "id" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'DRAFT',

    CONSTRAINT "PlanningPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftWish" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "shiftTemplateId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "breakPreference" TEXT,

    CONSTRAINT "ShiftWish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftAssignment" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "shiftTemplateId" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'PLANNED',
    "source" "AssignmentSource" NOT NULL DEFAULT 'MANUAL',

    CONSTRAINT "ShiftAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannedBreak" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "start" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,

    CONSTRAINT "PlannedBreak_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");

-- CreateIndex
CREATE INDEX "ForecastInterval_importId_date_idx" ON "ForecastInterval"("importId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "StaffingRequirement_date_intervalStart_key" ON "StaffingRequirement"("date", "intervalStart");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftWish_periodId_employeeId_date_key" ON "ShiftWish"("periodId", "employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftAssignment_employeeId_date_key" ON "ShiftAssignment"("employeeId", "date");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecastInterval" ADD CONSTRAINT "ForecastInterval_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ForecastImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftWish" ADD CONSTRAINT "ShiftWish_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PlanningPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftWish" ADD CONSTRAINT "ShiftWish_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftWish" ADD CONSTRAINT "ShiftWish_shiftTemplateId_fkey" FOREIGN KEY ("shiftTemplateId") REFERENCES "ShiftTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PlanningPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_shiftTemplateId_fkey" FOREIGN KEY ("shiftTemplateId") REFERENCES "ShiftTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedBreak" ADD CONSTRAINT "PlannedBreak_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ShiftAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
