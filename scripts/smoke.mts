import "dotenv/config";
import { appRouter } from "../server/root";
import { prisma } from "../infrastructure/db";
import type { Context } from "../server/context";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
}

// Build a context manually. The real Context is `{ session, prisma }` where
// session is a next-auth Session augmented with `user: { id, role }`. We cast
// our minimal session into that shape — the routers only read user.id/role.
function ctxFor(userId: string, role: "SUPERVISOR" | "EMPLOYEE"): Context {
  return {
    session: { user: { id: userId, role } },
    prisma,
  } as unknown as Context;
}

const DATE = "2026-06-15";

async function main() {
  const sup = await prisma.user.findUniqueOrThrow({ where: { email: "supervisor@wfm.local" } });
  const emp = await prisma.user.findUniqueOrThrow({ where: { email: "mitarbeiter@wfm.local" } });
  const employee = await prisma.employee.findUniqueOrThrow({ where: { userId: emp.id } });

  const supervisorCaller = appRouter.createCaller(ctxFor(sup.id, "SUPERVISOR"));
  const employeeCaller = appRouter.createCaller(ctxFor(emp.id, "EMPLOYEE"));

  // 3. forecast.commit -> Erlang C through the stack
  const committed = await supervisorCaller.forecast.commit({
    fileName: "smoke.csv",
    points: [
      { date: DATE, intervalStart: "08:00", expectedCalls: 100, ahtSeconds: 180 },
      { date: DATE, intervalStart: "08:30", expectedCalls: 120, ahtSeconds: 180 },
      { date: DATE, intervalStart: "09:00", expectedCalls: 80, ahtSeconds: 180 },
    ],
  });
  assert(committed.intervals === 3, "forecast.commit should report 3 intervals");
  console.log("forecast.commit ->", committed);

  const reqs = await prisma.staffingRequirement.findMany({
    where: { date: new Date(DATE) },
  });
  assert(reqs.length > 0, "staffingRequirement rows should exist for the date");
  assert(
    reqs.some((r) => r.requiredAgents > 0),
    "at least one requirement should have requiredAgents > 0 (Erlang C ran)",
  );
  console.log("staffingRequirement rows:", reqs.length, "max agents:", Math.max(...reqs.map((r) => r.requiredAgents)));

  // 4. planning.createPeriod
  const period = await supervisorCaller.planning.createPeriod({ startDate: DATE, endDate: DATE });
  const periodId = period.id;
  console.log("planning.createPeriod ->", periodId);

  // 5. employee: list templates, pick Früh, upsert wish
  const templates = await employeeCaller.admin.listTemplates();
  const frueh = templates.find((t) => t.name === "Früh");
  assert(frueh, "Früh template should be listed");
  console.log("admin.listTemplates ->", templates.map((t) => t.name).join(", "));

  const wish = await employeeCaller.planning.upsertWish({
    periodId,
    date: DATE,
    shiftTemplateId: frueh!.id,
  });
  assert(wish.id, "upsertWish should return a wish");
  console.log("planning.upsertWish -> ok", wish.id);

  // 6. supervisor: assign, planBreaks, coverage
  const assignment = await supervisorCaller.planning.assign({
    periodId,
    employeeId: employee.id,
    date: DATE,
    shiftTemplateId: frueh!.id,
    source: "FROM_WISH",
  });
  assert(assignment.id, "assign should return an assignment");
  console.log("planning.assign -> ok", assignment.id);

  const breaks = await supervisorCaller.planning.planBreaks({ periodId });
  assert(breaks.placed >= 0, "planBreaks should report placed >= 0");
  console.log("planning.planBreaks ->", breaks);

  const coverage = await supervisorCaller.coverage.forPeriod({ periodId });
  assert(Array.isArray(coverage), "coverage.forPeriod should return an array");
  console.log("coverage.forPeriod -> cells:", coverage.length);

  // 7. supervisor: publish
  const published = await supervisorCaller.planning.publish({ periodId, confirmDeficit: true });
  assert(published.status === "PUBLISHED", "period should be PUBLISHED");
  console.log("planning.publish ->", published.status);

  // 8. employee: myPlan
  const myPlan = await employeeCaller.planning.myPlan({ periodId });
  assert(myPlan.length >= 1, "myPlan should include the assignment");
  assert(myPlan.some((a) => a.id === assignment.id), "myPlan should include the created assignment");
  console.log("planning.myPlan -> assignments:", myPlan.length);

  console.log("SMOKE OK");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
