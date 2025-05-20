import { z } from "zod";
import { router, protectedProcedure } from "@/app/api/trpc/trpc";
import type { Context } from "@/app/api/trpc/context";
import { logger } from "@/app/lib/logger"; // Import logger
import { StageClassificationService } from "@/app/lib/analysis/stage-classification-service";
import { StageTransitionService } from "@/app/lib/analysis/stage-transition-service";
import { ActionPredictionService } from "@/app/lib/analysis/action-prediction-service";
import { db } from "@/app/lib/db"; // Assuming this is your Drizzle client
import { donors as donorSchema } from "@/app/lib/db/schema"; // Assuming donors schema for updates
import { eq } from "drizzle-orm";
import { TodoService } from "@/app/lib/services/todo-service";

// --- Placeholder Data Fetching Functions (replace with actual implementations) ---
import type { DonorJourney } from "@/app/lib/data/organizations";
import { getDonorJourney } from "@/app/lib/data/organizations"; // Using the actual function
import type { DonorAnalysisInfo, PredictedAction } from "@/app/lib/analysis/types";
import type { RawCommunicationThread } from "@/app/lib/utils/email-generator/types";
import type { DonationWithDetails } from "@/app/lib/data/donations";

// Mock/Placeholder: Fetches necessary donor details for analysis.
async function getDonorDetailsForAnalysis(
  donorId: string
): Promise<{ donorInfo: DonorAnalysisInfo; currentStageName: string | null } | null> {
  logger.info(`Placeholder: Fetching details for donor ${donorId}`);
  const donor = await db.query.donors.findFirst({ where: eq(donorSchema.id, Number(donorId)) });
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

// Mock/Placeholder: Fetches and transforms communication history.
async function getDonorFormattedCommunicationHistory(donorId: string): Promise<RawCommunicationThread[]> {
  logger.info(`Placeholder: Fetching communication history for donor ${donorId}`);
  return [];
}

// Mock/Placeholder: Fetches donation history.
async function getDonorFormattedDonationHistory(donorId: string): Promise<DonationWithDetails[]> {
  logger.info(`Placeholder: Fetching donation history for donor ${donorId}`);
  return [];
}
// --- End of Placeholder Data Fetching Functions ---

const todoService = new TodoService();

export const analysisRouter = router({
  analyzeDonors: protectedProcedure
    .input(
      z.object({
        donorIds: z.array(z.string()),
      })
    )
    .mutation(async ({ ctx, input }: { ctx: Context; input: { donorIds: string[] } }) => {
      const { donorIds } = input;
      const { user } = ctx.auth;

      if (!user || !user.id) {
        logger.error("User not authenticated or user ID missing for analyzeDonors mutation.");
        throw new Error("User not authenticated or user ID missing.");
      }

      // @ts-ignore - Assuming user.organizationId will exist on the user object in Context
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

      const classificationService = new StageClassificationService();
      const transitionService = new StageTransitionService();
      const predictionService = new ActionPredictionService();

      const results = await Promise.all(
        donorIds.map(async (donorId: string) => {
          logger.info(`Starting analysis pipeline for donor ${donorId}`);
          try {
            const donorDetails = await getDonorDetailsForAnalysis(donorId);
            if (!donorDetails) {
              logger.error(`Donor ${donorId} not found or essential data missing.`);
              throw new Error(`Donor ${donorId} not found.`);
            }
            const { donorInfo, currentStageName: initialStageName } = donorDetails;
            let currentStageName: string | null = initialStageName;

            const communicationHistory = await getDonorFormattedCommunicationHistory(donorId);
            const donationHistory = await getDonorFormattedDonationHistory(donorId);
            logger.info(
              `Donor ${donorId}: Initial Stage: ${currentStageName || "None"}, Comm History: ${
                communicationHistory.length
              } threads, Donation History: ${donationHistory.length} records`
            );

            if (!currentStageName) {
              logger.info(`No current stage for donor ${donorId}. Performing stage classification.`);
              const classificationResult = await classificationService.classifyStage({
                donorInfo,
                donorJourneyGraph,
                communicationHistory,
                donationHistory,
              });
              const classifiedStage = donorJourneyGraph.nodes.find(
                (node) => node.id === classificationResult.classifiedStageId
              );
              if (!classifiedStage) {
                throw new Error(
                  `Invalid stage ID returned from classification: ${classificationResult.classifiedStageId}`
                );
              }
              currentStageName = classifiedStage.label;
              logger.info(
                `Donor ${donorId} classified to stage "${currentStageName}". Reasoning: ${
                  classificationResult.reasoning || "N/A"
                }`
              );
              await db
                .update(donorSchema)
                .set({
                  currentStageName: currentStageName,
                  classificationReasoning: classificationResult.reasoning,
                })
                .where(eq(donorSchema.id, Number(donorId)));
              logger.info(`Updated stage and reasoning for donor ${donorId} to "${currentStageName}" in database.`);
            } else {
              logger.info(
                `Donor ${donorId} has current stage "${currentStageName}". Performing stage transition analysis.`
              );
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
                `Stage transition analysis for donor ${donorId}: Can transition: ${
                  transitionResult.canTransition
                }, Next stage: ${nextStageName || "N/A"}, Reasoning: ${transitionResult.reasoning || "N/A"}`
              );
              if (transitionResult.canTransition && nextStageName) {
                currentStageName = nextStageName;
                logger.info(`Donor ${donorId} transitioned to new stage "${currentStageName}".`);
                await db
                  .update(donorSchema)
                  .set({
                    currentStageName: currentStageName,
                    classificationReasoning: transitionResult.reasoning,
                  })
                  .where(eq(donorSchema.id, Number(donorId)));
                logger.info(`Updated stage and reasoning for donor ${donorId} to "${currentStageName}" in database.`);
              }
            }

            if (!currentStageName) {
              logger.warn(
                `Cannot predict actions for donor ${donorId} as currentStageName is still null after classification/transition.`
              );
              return {
                donorId,
                status: "error" as const,
                error: "Failed to determine donor stage for action prediction.",
                stage: null,
                actions: [] as PredictedAction[],
              };
            }

            const currentStage = donorJourneyGraph.nodes.find((node) => node.label === currentStageName);
            if (!currentStage) {
              throw new Error(`Invalid stage name: ${currentStageName}`);
            }

            logger.info(`Performing action prediction for donor ${donorId} (current stage: "${currentStageName}").`);
            const actionPredictionResult = await predictionService.predictActions({
              donorInfo,
              currentStageId: currentStage.id,
              donorJourneyGraph,
              communicationHistory,
              donationHistory,
            });

            // Create TODOs from predicted actions
            logger.info(
              `Creating ${actionPredictionResult.predictedActions.length} TODOs from predicted actions for donor ${donorId}`
            );
            await todoService.createTodosFromPredictedActions(
              Number(donorId),
              organizationId,
              actionPredictionResult.predictedActions
            );

            // Update donor with predicted actions (keeping this for backward compatibility)
            await db
              .update(donorSchema)
              .set({ predictedActions: actionPredictionResult.predictedActions })
              .where(eq(donorSchema.id, Number(donorId)));

            logger.info(
              `Successfully completed analysis pipeline for donor ${donorId}. Final Stage: "${currentStageName}"`
            );
            return {
              donorId,
              status: "success" as const,
              stage: currentStageName,
              actions: actionPredictionResult.predictedActions,
            };
          } catch (error: any) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            logger.error(
              `Error in analysis pipeline for donor ${donorId}. Error: ${errorMessage}, Stack: ${
                error instanceof Error ? error.stack : "N/A"
              }`
            );
            return {
              donorId,
              status: "error" as const,
              error: errorMessage,
              stage: null,
              actions: [] as PredictedAction[],
            };
          }
        })
      );

      const successfulAnalyses = results.filter((r) => r.status === "success").length;
      const failedAnalyses = results.length - successfulAnalyses;
      logger.info(
        `Completed analyzeDonors mutation for user ${user.id}. Total donors: ${donorIds.length}, Successful: ${successfulAnalyses}, Failed: ${failedAnalyses}`
      );
      return {
        message: `Analysis process completed. Successful: ${successfulAnalyses}, Failed: ${failedAnalyses}`,
        results,
      };
    }),
});

// Placeholder for transformation function if needed - this depends on actual DB structure of communication history
// function transformToRawCommunicationThread(dbThread: any): RawCommunicationThread {
//   return {
//     content: dbThread.messages?.map((msg: any) => ({ content: msg.text })) || [],
//     // map other fields if RawCommunicationThread is expanded
//   };
// }
