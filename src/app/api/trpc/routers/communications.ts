import { router } from "../trpc";
import { communicationThreadsRouter } from "./communication-threads";
import { emailCampaignsRouter } from "./email-campaigns";
import { agenticEmailCampaignsRouter } from "./agentic-email-campaigns";

/**
 * Combined communications router that includes both thread management and email campaigns
 * This router has been refactored from a single large file into smaller, focused modules
 */
export const communicationsRouter = router({
  // Communication thread operations
  threads: communicationThreadsRouter,

  // Email campaign operations
  campaigns: emailCampaignsRouter,

  // Agentic email campaign operations (experimental)
  agenticCampaigns: agenticEmailCampaignsRouter,
});
