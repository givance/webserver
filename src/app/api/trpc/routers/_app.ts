import { router } from "../trpc";
import { exampleRouter } from "./example";
import { organizationsRouter } from "./organizations";
import { donorsRouter } from "./donors";
import { projectsRouter } from "./projects";
import { staffRouter } from "./staff";
import { donationsRouter } from "./donations";
import { communicationsRouter } from "./communications";
import { usersRouter } from "./users";
import { analysisRouter } from "./analysis";
import { todoRouter } from "./todos";
import { gmailRouter } from "./gmail";
import { staffGmailRouter } from "./staff-gmail";
import { microsoftRouter } from "./microsoft";
import { staffMicrosoftRouter } from "./staff-microsoft";
import { emailTrackingRouter } from "./email-tracking";
import { templatesRouter } from "./templates";
import { listsRouter } from "./lists";
import { personResearchRouter } from "./person-research";

/**
 * Root router for the tRPC API
 * This combines all the sub-routers together
 */
export const appRouter = router({
  example: exampleRouter,
  organizations: organizationsRouter,
  donors: donorsRouter,
  projects: projectsRouter,
  staff: staffRouter,
  donations: donationsRouter,
  communications: communicationsRouter,
  users: usersRouter,
  analysis: analysisRouter,
  todos: todoRouter,
  gmail: gmailRouter,
  staffGmail: staffGmailRouter,
  microsoft: microsoftRouter,
  staffMicrosoft: staffMicrosoftRouter,
  emailTracking: emailTrackingRouter,
  templates: templatesRouter,
  lists: listsRouter,
  personResearch: personResearchRouter,
});

// Export type definition of API
export type AppRouter = typeof appRouter;
