import { z } from "zod";
import { router, supervisorProcedure, employeeProcedure } from "../trpc";

export const adminRouter = router({
  listTemplates: employeeProcedure.query(({ ctx }) =>
    ctx.prisma.shiftTemplate.findMany({ where: { active: true }, orderBy: { startTime: "asc" } }),
  ),

  upsertTemplate: supervisorProcedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string(),
        startTime: z.string(),
        endTime: z.string(),
        paidBreakMinutes: z.number().int().min(0),
        color: z.string(),
      }),
    )
    .mutation(({ input, ctx }) =>
      input.id
        ? ctx.prisma.shiftTemplate.update({ where: { id: input.id }, data: input })
        : ctx.prisma.shiftTemplate.create({ data: input }),
    ),

  getParams: supervisorProcedure.query(({ ctx }) =>
    ctx.prisma.staffingParameter.findFirst({ orderBy: { validFrom: "desc" } }),
  ),

  saveParams: supervisorProcedure
    .input(
      z.object({
        serviceLevelTarget: z.number().min(0).max(1),
        thresholdSeconds: z.number().int().min(1),
        shrinkagePercent: z.number().min(0).max(0.99),
        maxOccupancy: z.number().min(0.1).max(1),
        intervalLengthMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]),
        openingTime: z.string(),
        closingTime: z.string(),
      }),
    )
    .mutation(({ input, ctx }) => ctx.prisma.staffingParameter.create({ data: input })),
});
