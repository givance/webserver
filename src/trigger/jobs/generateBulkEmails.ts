import { task, logger as triggerLogger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { db } from "@/app/lib/db";
import { emailGenerationSessions, generatedEmails, donors, organizations, users, staff } from "@/app/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { EmailGenerationService } from "@/app/lib/utils/email-generator/service";
import { getDonorCommunicationHistory } from "@/app/lib/data/communications";
import { listDonations, getMultipleComprehensiveDonorStats } from "@/app/lib/data/donations";
import { getOrganizationMemories } from "@/app/lib/data/organizations";
import { getUserMemories, getDismissedMemories } from "@/app/lib/data/users";
import type { RawCommunicationThread } from "@/app/lib/utils/email-generator/types";

// Maximum number of concurrent operations
const MAX_CONCURRENCY = 50;

/**
 * Process items in batches with limited concurrency
 */
async function processConcurrently<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  maxConcurrency: number = MAX_CONCURRENCY
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += maxConcurrency) {
    const batch = items.slice(i, i + maxConcurrency);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);

    // Log progress for large batches
    if (items.length > maxConcurrency) {
      triggerLogger.info(`Processed ${Math.min(i + maxConcurrency, items.length)}/${items.length} items`);
    }
  }

  return results;
}

// Define the payload schema using Zod
const generateBulkEmailsPayloadSchema = z.object({
  sessionId: z.number(),
  organizationId: z.string(),
  userId: z.string(),
  instruction: z.string(),
  refinedInstruction: z.string().optional(),
  selectedDonorIds: z.array(z.number()),
  previewDonorIds: z.array(z.number()),
  chatHistory: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })
  ),
  templateId: z.number().optional(),
});

type GenerateBulkEmailsPayload = z.infer<typeof generateBulkEmailsPayloadSchema>;

/**
 * Trigger job for generating bulk emails for all selected donors
 */
export const generateBulkEmailsTask = task({
  id: "generate-bulk-emails",
  run: async (payload: GenerateBulkEmailsPayload, { ctx }) => {
    const {
      sessionId,
      organizationId,
      userId,
      instruction,
      refinedInstruction,
      selectedDonorIds,
      previewDonorIds,
      chatHistory,
      templateId,
    } = payload;

    triggerLogger.info(
      `Starting bulk email generation for session ${sessionId} with ${selectedDonorIds.length} donors`
    );

    try {
      // Update session status to IN_PROGRESS
      await db
        .update(emailGenerationSessions)
        .set({
          status: "IN_PROGRESS",
          triggerJobId: ctx.run.id,
          updatedAt: new Date(),
        })
        .where(eq(emailGenerationSessions.id, sessionId));

      // Get organization data
      const [organization] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);

      if (!organization) {
        throw new Error(`Organization ${organizationId} not found`);
      }

      // Get user data including email signature
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      // Get all donor data with assigned staff information
      const donorData = await db.query.donors.findMany({
        where: eq(donors.organizationId, organizationId),
        with: {
          assignedStaff: true, // Include staff assignment and signature
        },
      });

      const selectedDonors = donorData.filter((donor) => selectedDonorIds.includes(donor.id));

      if (selectedDonors.length !== selectedDonorIds.length) {
        throw new Error(`Some donors not found. Expected ${selectedDonorIds.length}, found ${selectedDonors.length}`);
      }

      // Convert organization to the email generator format
      const emailGeneratorOrg = {
        ...organization,
        rawWebsiteSummary: organization.websiteSummary,
      };

      // Fetch donor histories with concurrency limiting
      triggerLogger.info(`Fetching communication and donation histories for ${selectedDonors.length} donors`);

      const donorHistories = await processConcurrently(
        selectedDonors,
        async (donor) => {
          const [communicationHistory, donationHistory] = await Promise.all([
            getDonorCommunicationHistory(donor.id, { organizationId }),
            listDonations({
              donorId: donor.id,
              limit: 50,
              orderBy: "date",
              orderDirection: "desc",
              includeProject: true,
            }),
          ]);

          return {
            donor,
            communicationHistory: communicationHistory.map((thread) => ({
              content: thread.content?.map((message) => ({ content: message.content })) || [],
            })) as RawCommunicationThread[],
            donationHistory: donationHistory.donations,
          };
        },
        MAX_CONCURRENCY
      );

      // Get organization and user memories
      const [organizationMemories, userMemories, dismissedMemories] = await Promise.all([
        getOrganizationMemories(organizationId),
        getUserMemories(userId),
        getDismissedMemories(userId),
      ]);

      // Fetch comprehensive donor statistics
      const donorIds = selectedDonors.map((donor) => donor.id);
      triggerLogger.info(`Fetching comprehensive donor statistics for ${donorIds.length} donors`);
      const donorStatistics = await getMultipleComprehensiveDonorStats(donorIds, organizationId);

      // Convert donor histories to the required format
      const communicationHistories: Record<number, RawCommunicationThread[]> = {};
      const donationHistoriesMap: Record<number, any[]> = {};

      donorHistories.forEach(({ donor, communicationHistory, donationHistory }) => {
        communicationHistories[donor.id] = communicationHistory;
        donationHistoriesMap[donor.id] = donationHistory;
      });

      // Convert donors to the format expected by the email generator
      const donorInfos = selectedDonors.map((donor) => ({
        id: donor.id,
        email: donor.email,
        notes: donor.notes,
        // Include all the new name fields
        displayName: donor.displayName,
        hisTitle: donor.hisTitle,
        hisFirstName: donor.hisFirstName,
        hisInitial: donor.hisInitial,
        hisLastName: donor.hisLastName,
        herTitle: donor.herTitle,
        herFirstName: donor.herFirstName,
        herInitial: donor.herInitial,
        herLastName: donor.herLastName,
        isCouple: donor.isCouple,
        // Keep deprecated fields for fallback
        firstName: donor.firstName,
        lastName: donor.lastName,
      }));

      triggerLogger.info(
        `Generating emails for ${donorInfos.length} donors with concurrency limit of ${MAX_CONCURRENCY}`
      );

      // Generate emails in batches with concurrency limiting
      const emailService = new EmailGenerationService();
      const allEmailResults: any[] = [];

      // Process donors in batches for email generation
      await processConcurrently(
        donorInfos,
        async (donorInfo) => {
          // Generate email for single donor
          const singleDonorResults = await emailService.generateEmails(
            [donorInfo], // Single donor
            refinedInstruction || instruction,
            organization.name,
            emailGeneratorOrg,
            organization.writingInstructions ?? undefined,
            communicationHistories,
            donationHistoriesMap,
            donorStatistics, // Pass donor statistics
            userMemories,
            organizationMemories,
            undefined, // currentDate - will use default
            user.emailSignature ?? undefined // Pass user's email signature
          );

          // Add results to the main array (thread-safe since we're awaiting each batch)
          allEmailResults.push(...singleDonorResults);
          return singleDonorResults;
        },
        MAX_CONCURRENCY
      );

      triggerLogger.info(`Successfully generated ${allEmailResults.length} emails`);

      // Log token usage summary for bulk generation
      const totalTokenUsage = allEmailResults.reduce(
        (acc, email) => {
          if (email.tokenUsage) {
            acc.promptTokens += email.tokenUsage.promptTokens;
            acc.completionTokens += email.tokenUsage.completionTokens;
            acc.totalTokens += email.tokenUsage.totalTokens;
          }
          return acc;
        },
        { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
      );

      triggerLogger.info(
        `Token usage summary for bulk email generation session ${sessionId}: ${totalTokenUsage.totalTokens} tokens (${totalTokenUsage.promptTokens} input, ${totalTokenUsage.completionTokens} output) across ${allEmailResults.length} emails`
      );

      // Get primary staff for fallback if no staff is assigned
      const primaryStaff = await db.query.staff.findFirst({
        where: and(eq(staff.organizationId, organizationId), eq(staff.isPrimary, true)),
      });

      // Store generated emails in database with staff signatures automatically appended
      const emailInserts = allEmailResults.map((email: any) => {
        // Find the donor to get their assigned staff info
        const donor = selectedDonors.find((d) => d.id === email.donorId);
        const assignedStaff = donor?.assignedStaff;

        // Create the appropriate signature
        let signature: string;
        if (assignedStaff?.signature) {
          signature = assignedStaff.signature;
        } else if (assignedStaff) {
          // Default signature format: "Best, firstname"
          signature = `Best,\n${assignedStaff.firstName}`;
        } else if (primaryStaff?.signature) {
          // Use primary staff signature if available
          signature = primaryStaff.signature;
        } else if (primaryStaff) {
          // Default signature format for primary staff: "Best, firstname"
          signature = `Best,\n${primaryStaff.firstName}`;
        } else {
          // Fallback to user signature if no staff assigned and no primary staff
          signature = user.emailSignature || `Best,\n${user.firstName}`;
        }

        // Append signature to the structured content
        const enhancedStructuredContent = [
          ...email.structuredContent,
          {
            piece: signature,
            references: [],
            addNewlineAfter: false,
          },
        ];

        return {
          sessionId,
          donorId: email.donorId,
          subject: email.subject,
          structuredContent: enhancedStructuredContent,
          referenceContexts: email.referenceContexts,
          isPreview: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      });

      await db.insert(generatedEmails).values(emailInserts);

      // Update session status to COMPLETED
      await db
        .update(emailGenerationSessions)
        .set({
          status: "COMPLETED",
          completedDonors: selectedDonorIds.length,
          refinedInstruction: refinedInstruction || instruction,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(emailGenerationSessions.id, sessionId));

      triggerLogger.info(`Bulk email generation completed for session ${sessionId}`);

      return {
        status: "success",
        sessionId,
        emailsGenerated: allEmailResults.length,
        refinedInstruction: refinedInstruction || instruction,
      };
    } catch (error) {
      triggerLogger.error(
        `Error in bulk email generation for session ${sessionId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );

      // Update session status to FAILED
      await db
        .update(emailGenerationSessions)
        .set({
          status: "FAILED",
          errorMessage: error instanceof Error ? error.message : "Unknown error",
          updatedAt: new Date(),
        })
        .where(eq(emailGenerationSessions.id, sessionId));

      throw error;
    }
  },
});
