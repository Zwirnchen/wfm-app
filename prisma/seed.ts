import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const passwordHash = await bcrypt.hash("test1234", 10);

  const supervisor = await prisma.user.upsert({
    where: { email: "supervisor@wfm.local" },
    update: { role: "SUPERVISOR", passwordHash },
    create: { email: "supervisor@wfm.local", role: "SUPERVISOR", passwordHash },
  });

  const employee = await prisma.user.upsert({
    where: { email: "mitarbeiter@wfm.local" },
    update: { role: "EMPLOYEE", passwordHash },
    create: { email: "mitarbeiter@wfm.local", role: "EMPLOYEE", passwordHash },
  });

  await prisma.employee.upsert({
    where: { userId: employee.id },
    update: { name: "Max Mustermann" },
    create: { userId: employee.id, name: "Max Mustermann" },
  });

  // One StaffingParameter row (defaults). Use a stable id so re-runs are idempotent.
  await prisma.staffingParameter.upsert({
    where: { id: "seed-default-params" },
    update: {},
    create: { id: "seed-default-params" },
  });

  await prisma.shiftTemplate.upsert({
    where: { id: "seed-template-frueh" },
    update: { name: "Früh", startTime: "07:00", endTime: "15:00", paidBreakMinutes: 30 },
    create: {
      id: "seed-template-frueh",
      name: "Früh",
      startTime: "07:00",
      endTime: "15:00",
      paidBreakMinutes: 30,
    },
  });

  await prisma.shiftTemplate.upsert({
    where: { id: "seed-template-spaet" },
    update: { name: "Spät", startTime: "11:00", endTime: "19:00", paidBreakMinutes: 30 },
    create: {
      id: "seed-template-spaet",
      name: "Spät",
      startTime: "11:00",
      endTime: "19:00",
      paidBreakMinutes: 30,
    },
  });

  console.log("Seeded users:", supervisor.email, employee.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
