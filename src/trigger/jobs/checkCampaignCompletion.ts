import { task, logger as triggerLogger } from '@trigger.dev/sdk/v3';
import { EmailCampaignsService } from '@/app/lib/services/email-campaigns.service';

export const checkCampaignCompletionTask = task({
  id: 'check-campaign-completion',
  run: async (payload: { sessionId: number; organizationId: string }) => {
    const { sessionId, organizationId } = payload;

    try {
      triggerLogger.info(`Starting completion check for session ${sessionId}`);

      // Initialize service
      const emailCampaignsService = new EmailCampaignsService();

      // Check and update campaign completion status
      await emailCampaignsService.checkAndUpdateCampaignCompletion(sessionId, organizationId);

      triggerLogger.info(`Completed check for session ${sessionId}`);

      return {
        success: true,
        sessionId,
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      triggerLogger.error(
        `Failed to check campaign completion for session ${sessionId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );

      throw error;
    }
  },
});
