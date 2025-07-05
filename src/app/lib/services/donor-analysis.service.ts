import { db } from "@/app/lib/db";
import { donors as donorSchema } from "@/app/lib/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/app/lib/logger";
import { wrapDatabaseOperation } from "@/app/lib/utils/error-handler";
import type { PredictedAction } from "@/app/lib/analysis/types";

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
      await db
        .update(donorSchema)
        .set({
          currentStageName: stageName,
          classificationReasoning: reasoning,
        })
        .where(eq(donorSchema.id, donorId));

      logger.info(`Updated stage and reasoning for donor ${donorId} to "${stageName}" in database.`);
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
      await db
        .update(donorSchema)
        .set({
          currentStageName: newStageName,
          classificationReasoning: reasoning,
        })
        .where(eq(donorSchema.id, donorId));

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
      await db
        .update(donorSchema)
        .set({
          predictedActions: predictedActions,
        })
        .where(eq(donorSchema.id, donorId));

      logger.info(`Updated predicted actions for donor ${donorId} in database.`);
    });
  }
}