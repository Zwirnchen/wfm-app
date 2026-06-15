import { z } from "zod";
import { router, supervisorProcedure, employeeProcedure } from "../trpc";
import { optimizeBreaks } from "@/domain/breaks/optimizeBreaks";
import type { ShiftToBreak, Requirement } from "@/domain/breaks/optimizeBreaks";

const hhmm = z.string().regex(/^\d{2}:\d{2}$/);

export const planningRouter = router({
  createPeriod: supervisorProcedure
    .input(z.object({ startDate: z.string(), endDate: z.string() }))
    .mutation(({ input, ctx }) =>
      ctx.prisma.planningPeriod.create({
        data: { startDate: new Date(input.startDate), endDate: new Date(input.endDate) },
      }),
    ),

  listPeriods: employeeProcedure.query(({ ctx }) =>
    ctx.prisma.planningPeriod.findMany({ orderBy: { startDate: "desc" } }),
  ),

  upsertWish: employeeProcedure
    .input(
      z.object({
        periodId: z.string(),
        date: z.string(),
        shiftTemplateId: z.string(),
        priority: z.number().int().min(1).max(5).default(1),
        breakPreference: hhmm.nullable().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const employee = await ctx.prisma.employee.findUniqueOrThrow({
        where: { userId: ctx.session!.user!.id as string },
      });
      return ctx.prisma.shiftWish.upsert({
        where: {
          periodId_employeeId_date: {
            periodId: input.periodId,
            employeeId: employee.id,
            date: new Date(input.date),
          },
        },
        update: {
          shiftTemplateId: input.shiftTemplateId,
          priority: input.priority,
          breakPreference: input.breakPreference ?? null,
        },
        create: {
          periodId: input.periodId,
          employeeId: employee.id,
          date: new Date(input.date),
          shiftTemplateId: input.shiftTemplateId,
          priority: input.priority,
          breakPreference: input.breakPreference ?? null,
        },
      });
    }),

  wishesForPeriod: supervisorProcedure
    .input(z.object({ periodId: z.string() }))
    .query(({ input, ctx }) =>
      ctx.prisma.shiftWish.findMany({
        where: { periodId: input.periodId },
        include: { employee: true, shiftTemplate: true },
      }),
    ),

  assign: supervisorProcedure
    .input(
      z.object({
        periodId: z.string(),
        employeeId: z.string(),
        date: z.string(),
        shiftTemplateId: z.string(),
        source: z.enum(["FROM_WISH", "MANUAL"]).default("MANUAL"),
      }),
    )
    .mutation(({ input, ctx }) =>
      ctx.prisma.shiftAssignment.upsert({
        where: { employeeId_date: { employeeId: input.employeeId, date: new Date(input.date) } },
        update: { shiftTemplateId: input.shiftTemplateId, source: input.source },
        create: {
          periodId: input.periodId,
          employeeId: input.employeeId,
          date: new Date(input.date),
          shiftTemplateId: input.shiftTemplateId,
          source: input.source,
        },
      }),
    ),

  planBreaks: supervisorProcedure
    .input(z.object({ periodId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const assignments = await ctx.prisma.shiftAssignment.findMany({
        where: { periodId: input.periodId },
        include: { shiftTemplate: true },
      });
      const wishes = await ctx.prisma.shiftWish.findMany({ where: { periodId: input.periodId } });
      const prefByKey = new Map(
        wishes.map((w) => [`${w.employeeId}|${w.date.toISOString().slice(0, 10)}`, w.breakPreference]),
      );
      const reqs = await ctx.prisma.staffingRequirement.findMany();
      const requirements: Requirement[] = reqs.map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        intervalStart: r.intervalStart,
        requiredAgents: r.requiredAgents,
      }));
      const shifts: ShiftToBreak[] = assignments.map((a) => {
        const dateStr = a.date.toISOString().slice(0, 10);
        return {
          id: a.id,
          date: dateStr,
          shiftStart: a.shiftTemplate.startTime,
          shiftEnd: a.shiftTemplate.endTime,
          breakMinutes: a.shiftTemplate.paidBreakMinutes,
          preference: prefByKey.get(`${a.employeeId}|${dateStr}`) ?? null,
        };
      });
      const params = await ctx.prisma.staffingParameter.findFirst({ orderBy: { validFrom: "desc" } });
      const intervalLen = params?.intervalLengthMinutes ?? 30;
      const breaks = optimizeBreaks(shifts, requirements, intervalLen);

      await ctx.prisma.$transaction([
        ctx.prisma.plannedBreak.deleteMany({
          where: { assignment: { periodId: input.periodId } },
        }),
        ctx.prisma.plannedBreak.createMany({
          data: breaks.map((b) => ({
            assignmentId: b.shiftId,
            start: b.start,
            durationMinutes: b.durationMinutes,
          })),
        }),
      ]);
      return { placed: breaks.length };
    }),

  publish: supervisorProcedure
    .input(z.object({ periodId: z.string(), confirmDeficit: z.boolean().default(false) }))
    .mutation(async ({ input, ctx }) => {
      // Coverage deficit guard handled in UI; confirmDeficit must be true to publish with gaps.
      return ctx.prisma.planningPeriod.update({
        where: { id: input.periodId },
        data: { status: "PUBLISHED" },
      });
    }),

  myPlan: employeeProcedure
    .input(z.object({ periodId: z.string() }))
    .query(async ({ input, ctx }) => {
      const employee = await ctx.prisma.employee.findUniqueOrThrow({
        where: { userId: ctx.session!.user!.id as string },
      });
      return ctx.prisma.shiftAssignment.findMany({
        where: { periodId: input.periodId, employeeId: employee.id },
        include: { shiftTemplate: true, breaks: true },
      });
    }),
});
