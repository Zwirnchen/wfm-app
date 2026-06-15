import { z } from "zod";
import { router, supervisorProcedure } from "../trpc";
import { computeCoverage } from "@/domain/scheduling/coverage";
import type { AssignmentForCoverage } from "@/domain/scheduling/coverage";

export const coverageRouter = router({
  forPeriod: supervisorProcedure
    .input(z.object({ periodId: z.string() }))
    .query(async ({ input, ctx }) => {
      const period = await ctx.prisma.planningPeriod.findUniqueOrThrow({
        where: { id: input.periodId },
      });
      const assignments = await ctx.prisma.shiftAssignment.findMany({
        where: { periodId: input.periodId },
        include: { shiftTemplate: true, breaks: true },
      });
      const reqs = await ctx.prisma.staffingRequirement.findMany({
        where: { date: { gte: period.startDate, lte: period.endDate } },
      });
      const params = await ctx.prisma.staffingParameter.findFirst({
        orderBy: { validFrom: "desc" },
      });
      const intervalLen = params?.intervalLengthMinutes ?? 30;

      const cov: AssignmentForCoverage[] = assignments.map((a) => ({
        date: a.date.toISOString().slice(0, 10),
        shiftStart: a.shiftTemplate.startTime,
        shiftEnd: a.shiftTemplate.endTime,
        breaks: a.breaks.map((b) => ({ start: b.start, durationMinutes: b.durationMinutes })),
      }));
      return computeCoverage(
        cov,
        reqs.map((r) => ({
          date: r.date.toISOString().slice(0, 10),
          intervalStart: r.intervalStart,
          requiredAgents: r.requiredAgents,
        })),
        intervalLen,
      );
    }),
});
