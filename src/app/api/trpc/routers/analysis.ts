import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import type { Context } from "../context";
import { logger } from "@/app/lib/logger";
import { StageClassificationService } from "@/app/lib/analysis/stage-classification-service";
import { StageTransitionService } from "@/app/lib/analysis/stage-transition-service";
import { ActionPredictionService } from "@/app/lib/analysis/action-prediction-service";
import { db } from "@/app/lib/db";
import { donors as donorSchema } from "@/app/lib/db/schema";
import { eq } from "drizzle-orm";
import { TodoService } from "@/app/lib/services/todo-service";
import { getDonorById } from "@/app/lib/data/donors";
import { getDonorCommunicationHistory, type CommunicationThreadWithDetails } from "@/app/lib/data/communications";
import { listDonations } from "@/app/lib/data/donations";
import type { DonorJourney } from "@/app/lib/data/organizations";
import { getDonorJourney } from "@/app/lib/data/organizations";
import type { DonorAnalysisInfo, PredictedAction } from "@/app/lib/analysis/types";
import type { RawCommunicationThread } from "@/app/lib/utils/email-generator/types";
import type { DonationWithDetails } from "@/app/lib/data/donations";

/**
 * Service for handling donor analysis operations
 */
class DonorAnalysisService {
  private todoService = new TodoService();

  /**
   * Fetches donor details formatted for analysis
   */
  async getDonorDetailsForAnalysis(
    donorId: string,
    organizationId: string
  ): Promise<{ donorInfo: DonorAnalysisInfo; currentStageName: string | null } | null> {
    const donor = await getDonorById(Number(donorId), organizationId);
    if (!donor) return null;

    return {
      donorInfo: {
        id: donor.id.toString(),
        name: `${donor.firstName} ${donor.lastName}`,
        email: donor.email,
      },
      currentStageName: donor.currentStageName,
    };
  }

  /**
   * Fetches and transforms communication history for analysis
   */
  async getDonorFormattedCommunicationHistory(
    donorId: string,
    organizationId: string
  ): Promise<RawCommunicationThread[]> {
    const threads = await getDonorCommunicationHistory(Number(donorId), {
      includeStaff: true,
      messagesPerThread: 25,
      organizationId,
    });

    return threads.map((thread: CommunicationThreadWithDetails) => ({
      content:
        thread.content?.map((message) => ({
          content: message.content,
        })) || [],
    }));
  }

  /**
   * Fetches donation history formatted for analysis
   */
  async getDonorFormattedDonationHistory(donorId: string, organizationId: string): Promise<DonationWithDetails[]> {
    const { donations } = await listDonations({
      donorId: Number(donorId),
      includeDonor: true,
      includeProject: true,
      orderBy: "date",
      orderDirection: "desc",
      limit: 50,
    });
    return donations;
  }

  /**
   * Analyzes a single donor through the complete analysis pipeline
   */
  async analyzeSingleDonor(
    donorId: string,
    organizationId: string,
    donorJourneyGraph: DonorJourney,
    userId: string
  ): Promise<any> {
    logger.info(`Starting analysis pipeline for donor ${donorId}`);

    const donorDetails = await this.getDonorDetailsForAnalysis(donorId, organizationId);
    if (!donorDetails) {
      logger.error(`Donor ${donorId} not found or essential data missing.`);
      throw new Error(`Donor ${donorId} not found.`);
    }

    const { donorInfo, currentStageName: initialStageName } = donorDetails;
    let currentStageName: string | null = initialStageName;

    const communicationHistory = await this.getDonorFormattedCommunicationHistory(donorId, organizationId);
    const donationHistory = await this.getDonorFormattedDonationHistory(donorId, organizationId);

    logger.info(
      `Donor ${donorId}: Initial Stage: ${currentStageName || "None"}, Comm History: ${
        communicationHistory.length
      } threads, Donation History: ${donationHistory.length} records`
    );

    const classificationService = new StageClassificationService();
    const transitionService = new StageTransitionService();
    const predictionService = new ActionPredictionService();

    // Stage classification or transition logic
    if (!currentStageName) {
      currentStageName = await this.performStageClassification(
        donorId,
        donorInfo,
        donorJourneyGraph,
        communicationHistory,
        donationHistory,
        classificationService
      );
    } else {
      currentStageName = await this.performStageTransition(
        donorId,
        donorInfo,
        currentStageName,
        donorJourneyGraph,
        communicationHistory,
        donationHistory,
        transitionService
      );
    }

    // Action prediction
    const predictedActions = await this.performActionPrediction(
      donorId,
      donorInfo,
      currentStageName,
      donorJourneyGraph,
      communicationHistory,
      donationHistory,
      predictionService,
      organizationId,
      userId
    );

    return {
      donorId,
      currentStageName,
      predictedActions,
    };
  }

  private async performStageClassification(
    donorId: string,
    donorInfo: DonorAnalysisInfo,
    donorJourneyGraph: DonorJourney,
    communicationHistory: RawCommunicationThread[],
    donationHistory: DonationWithDetails[],
    classificationService: StageClassificationService
  ): Promise<string> {
    logger.info(`No current stage for donor ${donorId}. Performing stage classification.`);

    const classificationResult = await classificationService.classifyStage({
      donorInfo,
      donorJourneyGraph,
      communicationHistory,
      donationHistory,
    });

    const classifiedStage = donorJourneyGraph.nodes.find((node) => node.id === classificationResult.classifiedStageId);

    if (!classifiedStage) {
      throw new Error(`Invalid stage ID returned from classification: ${classificationResult.classifiedStageId}`);
    }

    const stageName = classifiedStage.label;
    logger.info(
      `Donor ${donorId} classified to stage "${stageName}". Reasoning: ${classificationResult.reasoning || "N/A"}`
    );

    await db
      .update(donorSchema)
      .set({
        currentStageName: stageName,
        classificationReasoning: classificationResult.reasoning,
      })
      .where(eq(donorSchema.id, Number(donorId)));

    logger.info(`Updated stage and reasoning for donor ${donorId} to "${stageName}" in database.`);
    return stageName;
  }

  private async performStageTransition(
    donorId: string,
    donorInfo: DonorAnalysisInfo,
    currentStageName: string,
    donorJourneyGraph: DonorJourney,
    communicationHistory: RawCommunicationThread[],
    donationHistory: DonationWithDetails[],
    transitionService: StageTransitionService
  ): Promise<string> {
    logger.info(`Donor ${donorId} has current stage "${currentStageName}". Performing stage transition analysis.`);

    const currentStage = donorJourneyGraph.nodes.find((node) => node.label === currentStageName);
    if (!currentStage) {
      throw new Error(`Invalid stage name in database: ${currentStageName}`);
    }

    const transitionResult = await transitionService.classifyStageTransition({
      donorInfo,
      currentStageId: currentStage.id,
      donorJourneyGraph,
      communicationHistory,
      donationHistory,
    });

    const nextStageName = transitionResult.nextStageId
      ? donorJourneyGraph.nodes.find((node) => node.id === transitionResult.nextStageId)?.label
      : null;

    logger.info(
      `Stage transition analysis for donor ${donorId}: Can transition: ${transitionResult.canTransition}, Next stage: ${
        nextStageName || "N/A"
      }, Reasoning: ${transitionResult.reasoning || "N/A"}`
    );

    if (transitionResult.canTransition && nextStageName) {
      await db
        .update(donorSchema)
        .set({
          currentStageName: nextStageName,
          classificationReasoning: transitionResult.reasoning,
        })
        .where(eq(donorSchema.id, Number(donorId)));

      logger.info(`Donor ${donorId} transitioned to new stage "${nextStageName}".`);
      return nextStageName;
    }

    return currentStageName;
  }

  private async performActionPrediction(
    donorId: string,
    donorInfo: DonorAnalysisInfo,
    currentStageName: string,
    donorJourneyGraph: DonorJourney,
    communicationHistory: RawCommunicationThread[],
    donationHistory: DonationWithDetails[],
    predictionService: ActionPredictionService,
    organizationId: string,
    userId: string
  ): Promise<PredictedAction[]> {
    const currentStage = donorJourneyGraph.nodes.find((node) => node.label === currentStageName);
    if (!currentStage) {
      logger.error(`Current stage "${currentStageName}" not found in donor journey for donor ${donorId}.`);
      return [];
    }

    logger.info(`Predicting actions for donor ${donorId} in stage "${currentStageName}".`);

    const predictionResult = await predictionService.predictActions({
      donorInfo,
      currentStageId: currentStage.id,
      donorJourneyGraph,
      communicationHistory,
      donationHistory,
    });

    logger.info(
      `Action prediction for donor ${donorId}: ${predictionResult.predictedActions.length} actions predicted.`
    );

    // Update predicted actions in database
    await db
      .update(donorSchema)
      .set({
        predictedActions: predictionResult.predictedActions,
      })
      .where(eq(donorSchema.id, Number(donorId)));

    // Create todos for predicted actions using the dedicated method
    await this.todoService.createTodosFromPredictedActions(
      Number(donorId),
      organizationId,
      predictionResult.predictedActions
    );

    logger.info(`Created ${predictionResult.predictedActions.length} todos for donor ${donorId}.`);
    return predictionResult.predictedActions;
  }
}

/**
 * Input validation schemas
 */
const analyzeDonorsSchema = z.object({
  donorIds: z.array(z.string()),
});

/**
 * Analysis router for donor analysis operations
 */
export const analysisRouter = router({
  /**
   * Analyzes multiple donors through the complete analysis pipeline
   */
  analyzeDonors: protectedProcedure
    .input(analyzeDonorsSchema)
    .mutation(async ({ ctx, input }: { ctx: Context; input: { donorIds: string[] } }) => {
      const { donorIds } = input;
      const { user } = ctx.auth;

      if (!user?.id) {
        logger.error("User not authenticated or user ID missing for analyzeDonors mutation.");
        throw new Error("User not authenticated or user ID missing.");
      }

      // @ts-ignore - Assuming user.organizationId exists on the user object
      const organizationId = user.organizationId as string | undefined;
      if (!organizationId) {
        logger.error(`User ${user.id} is not associated with an organization. Cannot fetch donor journey.`);
        throw new Error("User is not associated with an organization. Donor journey graph is required for analysis.");
      }

      logger.info(
        `Starting analyzeDonors mutation for ${donorIds.length} donors by user ${
          user.id
        } (org: ${organizationId}). Donor IDs: ${donorIds.join(", ")}`
      );

      const donorJourneyGraph = await getDonorJourney(organizationId);
      if (!donorJourneyGraph) {
        logger.error(`Donor journey graph not found for organization ${organizationId}. Cannot proceed with analysis.`);
        throw new Error(`Donor journey graph not found for organization ${organizationId}. Analysis cannot proceed.`);
      }

      logger.info(
        `Using donor journey graph for org ${organizationId} with ${donorJourneyGraph.nodes.length} nodes and ${donorJourneyGraph.edges.length} edges.`
      );

      const analysisService = new DonorAnalysisService();
      const results = await Promise.all(
        donorIds.map((donorId) =>
          analysisService.analyzeSingleDonor(donorId, organizationId, donorJourneyGraph, user.id)
        )
      );

      logger.info(`Analysis completed for ${results.length} donors.`);
      return { results };
    }),
});
