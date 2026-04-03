import { router } from "./init";
import { dealsRouter } from "./routers/deals";

export const appRouter = router({
  deals: dealsRouter,
});

export type AppRouter = typeof appRouter;
