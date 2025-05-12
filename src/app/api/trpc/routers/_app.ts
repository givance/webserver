import { router } from "../trpc";
import { exampleRouter } from "./example";
import { donationsRouter } from "./donations";
import { projectsRouter } from "./projects";
import { staffRouter } from "./staff";
import { donorsRouter } from "./donors";
import { communicationsRouter } from "./communications";
import { organizationsRouter } from "./organizations";

/**
 * Root router for the tRPC API
 * This combines all the sub-routers together
 */
export const appRouter = router({
  example: exampleRouter,
  donations: donationsRouter,
  projects: projectsRouter,
  staff: staffRouter,
  donors: donorsRouter,
  communications: communicationsRouter,
  organizations: organizationsRouter,
});

// Export type definition of API
export type AppRouter = typeof appRouter;
