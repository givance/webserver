import { task, logger } from '@trigger.dev/sdk/v3';
import { crmManager } from '@/app/lib/services/crm';
import { db } from '@/app/lib/db';
import { staffIntegrations } from '@/app/lib/db/schema';
import { eq } from 'drizzle-orm';

export const syncCrmDataTask = task({
  id: 'sync-crm-data',
  maxDuration: 3600, // 1 hour max
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 30000, // 30 seconds
    maxTimeoutInMs: 300000, // 5 minutes
    factor: 2,
    randomize: true,
  },
  run: async (
    payload: {
      organizationId: string;
      staffId: number;
      provider: string;
      integrationId: number;
    },
    { ctx }
  ) => {
    const { organizationId, staffId, provider, integrationId } = payload;

    logger.info('Starting CRM sync', {
      organizationId,
      staffId,
      provider,
      integrationId,
      runId: ctx.run.id,
    });

    try {
      // Sync data using the CRM manager
      const result = await crmManager.syncData(organizationId, staffId, provider);

      logger.info('CRM sync completed successfully', {
        organizationId,
        provider,
        donorsCreated: result.donors.created,
        donorsUpdated: result.donors.updated,
        donorsFailed: result.donors.failed,
        donationsCreated: result.donations.created,
        donationsUpdated: result.donations.updated,
        donationsFailed: result.donations.failed,
        totalTime: result.totalTime,
      });

      // Log any errors
      if (result.donors.errors.length > 0) {
        logger.warn('Donor sync errors', {
          errors: result.donors.errors.slice(0, 10), // Log first 10 errors
          totalErrors: result.donors.errors.length,
        });
      }

      if (result.donations.errors.length > 0) {
        logger.warn('Donation sync errors', {
          errors: result.donations.errors.slice(0, 10), // Log first 10 errors
          totalErrors: result.donations.errors.length,
        });
      }

      return {
        success: true,
        result,
      };
    } catch (error) {
      logger.error('CRM sync failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        organizationId,
        staffId,
        provider,
        integrationId,
      });

      // Update integration status to error
      await db
        .update(staffIntegrations)
        .set({
          syncStatus: 'error',
          syncError: error instanceof Error ? error.message : 'Unknown error',
          updatedAt: new Date(),
        })
        .where(eq(staffIntegrations.id, integrationId));

      throw error;
    }
  },
});
