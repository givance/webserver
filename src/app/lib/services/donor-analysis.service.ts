import { logger } from '@/app/lib/logger';
import { wrapDatabaseOperation } from '@/app/lib/utils/error-handler';
import type { PredictedAction } from '@/app/lib/analysis/types';
import {
  updateDonorStageClassification as updateDonorStageClassificationData,
  updateDonorPredictedActions as updateDonorPredictedActionsData,
} from '@/app/lib/data/donors';

/**
 * Service for handling donor analysis database operations
 */
export class DonorAnalysisService {
  /**
   * Updates a donor's stage classification in the database
   */
  async updateDonorStageClassification(
    donorId: number,
    stageName: string,
    reasoning?: string
  ): Promise<void> {
    return await wrapDatabaseOperation(async () => {
      await updateDonorStageClassificationData(donorId, stageName, reasoning);
      logger.info(
        `Updated stage and reasoning for donor ${donorId} to "${stageName}" in database.`
      );
    });
  }

  /**
   * Updates a donor's stage transition in the database
   */
  async updateDonorStageTransition(
    donorId: number,
    newStageName: string,
    reasoning?: string
  ): Promise<void> {
    return await wrapDatabaseOperation(async () => {
      await updateDonorStageClassificationData(donorId, newStageName, reasoning);
      logger.info(`Donor ${donorId} transitioned to new stage "${newStageName}".`);
    });
  }

  /**
   * Updates a donor's predicted actions in the database
   */
  async updateDonorPredictedActions(
    donorId: number,
    predictedActions: PredictedAction[]
  ): Promise<void> {
    return await wrapDatabaseOperation(async () => {
      await updateDonorPredictedActionsData(donorId, predictedActions);
      logger.info(`Updated predicted actions for donor ${donorId} in database.`);
    });
  }
}
