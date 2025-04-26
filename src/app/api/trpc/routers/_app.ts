import { router } from "../trpc";
import { exampleRouter } from "./example";

/**
 * Root router for the tRPC API
 * This combines all the sub-routers together
 */
export const appRouter = router({
  example: exampleRouter,
});

// Export type definition of API
export type AppRouter = typeof appRouter;
