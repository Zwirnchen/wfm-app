import { z } from "zod";
import { router, supervisorProcedure } from "../trpc";
import { parseCsv, parseXlsx } from "@/infrastructure/import/parseForecast";
import { validateForecast } from "@/infrastructure/import/validateForecast";
import { computeRequirements } from "@/domain/staffing/computeRequirements";
import { prisma } from "@/infrastructure/db";
import type { ForecastPoint, StaffingParams } from "@/domain/types";

export function buildRequirementRows(points: ForecastPoint[], params: StaffingParams) {
  return computeRequirements(points, params).map((r) => ({
    date: new Date(r.date),
    intervalStart: r.intervalStart,
    requiredAgents: r.requiredAgents,
  }));
}

async function currentParams(db: typeof prisma): Promise<StaffingParams> {
  const p = await db.staffingParameter.findFirst({ orderBy: { validFrom: "desc" } });
  return {
    serviceLevelTarget: p?.serviceLevelTarget ?? 0.8,
    thresholdSeconds: p?.thresholdSeconds ?? 20,
    shrinkagePercent: p?.shrinkagePercent ?? 0.3,
    maxOccupancy: p?.maxOccupancy ?? 0.85,
    intervalLengthMinutes: p?.intervalLengthMinutes ?? 30,
  };
}

export const forecastRouter = router({
  preview: supervisorProcedure
    .input(z.object({ fileName: z.string(), base64: z.string(), kind: z.enum(["csv", "xlsx"]) }))
    .mutation(async ({ input, ctx }) => {
      const buffer = Buffer.from(input.base64, "base64");
      const rows =
        input.kind === "csv"
          ? parseCsv(buffer.toString("utf-8"))
          : parseXlsx(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
      const params = await currentParams(ctx.prisma);
      return validateForecast(rows, params.intervalLengthMinutes);
    }),

  commit: supervisorProcedure
    .input(
      z.object({
        fileName: z.string(),
        points: z.array(
          z.object({
            date: z.string(),
            intervalStart: z.string(),
            expectedCalls: z.number(),
            ahtSeconds: z.number(),
          }),
        ),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const params = await currentParams(ctx.prisma);
      const dates = input.points.map((p) => new Date(p.date).getTime());
      const periodStart = new Date(Math.min(...dates));
      const periodEnd = new Date(Math.max(...dates));

      return ctx.prisma.$transaction(async (tx) => {
        await tx.forecastImport.updateMany({
          where: { status: "ACTIVE", periodStart, periodEnd },
          data: { status: "REPLACED" },
        });
        const imp = await tx.forecastImport.create({
          data: {
            fileName: input.fileName,
            importedById: ctx.session!.user!.id as string,
            periodStart,
            periodEnd,
            status: "ACTIVE",
            intervals: {
              create: input.points.map((p) => ({
                date: new Date(p.date),
                intervalStart: p.intervalStart,
                expectedCalls: p.expectedCalls,
                ahtSeconds: p.ahtSeconds,
              })),
            },
          },
        });
        const reqRows = buildRequirementRows(input.points, params);
        for (const r of reqRows) {
          await tx.staffingRequirement.upsert({
            where: { date_intervalStart: { date: r.date, intervalStart: r.intervalStart } },
            update: { requiredAgents: r.requiredAgents },
            create: r,
          });
        }
        return { importId: imp.id, intervals: input.points.length };
      });
    }),
});
