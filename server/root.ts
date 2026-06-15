import { router } from "./trpc";
import { forecastRouter } from "./routers/forecast";
import { adminRouter } from "./routers/admin";
import { planningRouter } from "./routers/planning";
import { coverageRouter } from "./routers/coverage";

export const appRouter = router({
  forecast: forecastRouter,
  admin: adminRouter,
  planning: planningRouter,
  coverage: coverageRouter,
});

export type AppRouter = typeof appRouter;
