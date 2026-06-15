import { router } from "./trpc";
import { forecastRouter } from "./routers/forecast";
import { adminRouter } from "./routers/admin";
import { planningRouter } from "./routers/planning";

export const appRouter = router({
  forecast: forecastRouter,
  admin: adminRouter,
  planning: planningRouter,
});

export type AppRouter = typeof appRouter;
