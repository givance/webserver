import { task, logger as triggerLogger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { db } from "@/app/lib/db";
import {
  emailGenerationSessions,
  generatedEmails,
  donors,
  organizations,
  users,
  staff,
  EmailGenerationSessionStatus,
} from "@/app/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { EmailGenerationService } from "@/app/lib/utils/email-generator/service";
import { getDonorCommunicationHistory } from "@/app/lib/data/communications";
import { listDonations, getMultipleComprehensiveDonorStats } from "@/app/lib/data/donations";
import { getOrganizationMemories } from "@/app/lib/data/organizations";
import { getUserMemories, getDismissedMemories } from "@/app/lib/data/users";
import type { RawCommunicationThread, GeneratedEmail } from "@/app/lib/utils/email-generator/types";

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
  selectedDonorIds: z.array(z.number()),
  previewDonorIds: z.array(z.number()),
  chatHistory: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })
  ),
  templateId: z.number().optional(),
  organizationWritingInstructions: z.string().optional(),
  staffWritingInstructions: z.string().optional(),
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
      selectedDonorIds,
      previewDonorIds,
      chatHistory,
      templateId,
      organizationWritingInstructions,
      staffWritingInstructions,
    } = payload;

    triggerLogger.info(
      `Starting bulk email generation for session ${sessionId} with ${selectedDonorIds.length} donors`
    );

    try {
      // Update session status to GENERATING
      await db
        .update(emailGenerationSessions)
        .set({
          status: EmailGenerationSessionStatus.GENERATING,
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

      // Check which donors already have ANY emails in this session (regardless of status)
      // This prevents regenerating emails that were already reviewed/generated
      const existingEmails = await db
        .select({ donorId: generatedEmails.donorId })
        .from(generatedEmails)
        .where(eq(generatedEmails.sessionId, sessionId));

      const donorsWithExistingEmails = new Set(existingEmails.map((email) => email.donorId));

      // Filter out donors who already have emails (approved or pending)
      const donorsToGenerate = selectedDonors.filter((donor) => !donorsWithExistingEmails.has(donor.id));

      if (donorsToGenerate.length === 0) {
        triggerLogger.info(
          `All donors already have generated emails for session ${sessionId}. Updating session status to COMPLETED.`
        );

        // Update session status to COMPLETED since all emails already exist
        await db
          .update(emailGenerationSessions)
          .set({
            status: EmailGenerationSessionStatus.COMPLETED,
            completedDonors: selectedDonorIds.length,
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(emailGenerationSessions.id, sessionId));

        return {
          status: "success",
          sessionId,
          emailsGenerated: 0,
          message: "All emails were already generated",
        };
      }

      triggerLogger.info(
        `Generating emails for ${donorsToGenerate.length} new donors (${donorsWithExistingEmails.size} already exist)`
      );

      // Convert organization to the email generator format
      const emailGeneratorOrg = {
        ...organization,
        rawWebsiteSummary: organization.websiteSummary,
      };

      // Fetch donor histories with concurrency limiting
      triggerLogger.info(`Fetching communication and donation histories for ${donorsToGenerate.length} donors`);

      const donorHistories = await processConcurrently(
        donorsToGenerate,
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
      const donorIds = donorsToGenerate.map((donor) => donor.id);
      triggerLogger.info(`Fetching comprehensive donor statistics for ${donorIds.length} donors`);
      const donorStatistics = await getMultipleComprehensiveDonorStats(donorIds, organizationId);

      // Fetch person research results for donors
      triggerLogger.info(`Fetching person research results for ${donorIds.length} donors`);
      const { PersonResearchService } = await import("@/app/lib/services/person-research.service");
      const personResearchService = new PersonResearchService();
      const personResearchResults: Record<number, any> = {};

      await Promise.all(
        donorIds.map(async (donorId) => {
          try {
            const research = await personResearchService.getPersonResearch(donorId, organizationId);
            if (research) {
              personResearchResults[donorId] = research;
              triggerLogger.info(`Found person research for donor ${donorId}: "${research.researchTopic}"`);
            }
          } catch (error) {
            triggerLogger.warn(
              `Failed to fetch person research for donor ${donorId}: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        })
      );

      // Convert donor histories to the required format
      const communicationHistories: Record<number, RawCommunicationThread[]> = {};
      const donationHistoriesMap: Record<number, any[]> = {};

      donorHistories.forEach(({ donor, communicationHistory, donationHistory }) => {
        communicationHistories[donor.id] = communicationHistory;
        donationHistoriesMap[donor.id] = donationHistory;
      });

      // Convert donors to the format expected by the email generator
      const donorInfos = donorsToGenerate.map((donor) => ({
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

      // Get primary staff for fallback writing instructions
      const primaryStaffForWriting = await db.query.staff.findFirst({
        where: and(eq(staff.organizationId, organizationId), eq(staff.isPrimary, true)),
      });

      // Generate emails in batches with concurrency limiting
      const { generateSmartDonorEmails } = await import("@/app/lib/utils/email-generator");
      const allEmailResults: GeneratedEmail[] = [];

      // Process donors in batches for email generation
      await processConcurrently(
        donorInfos,
        async (donorInfo) => {
          // Find the corresponding full donor data to get assigned staff
          const fullDonor = donorsToGenerate.find((d) => d.id === donorInfo.id);
          const assignedStaff = fullDonor?.assignedStaff;

          // Determine the appropriate staff writing instructions for this donor
          let donorStaffWritingInstructions: string | undefined;
          if (assignedStaff?.writingInstructions && assignedStaff.writingInstructions.trim()) {
            donorStaffWritingInstructions = assignedStaff.writingInstructions;
            triggerLogger.info(
              `Using assigned staff writing instructions for donor ${donorInfo.id} from ${assignedStaff.firstName} ${assignedStaff.lastName}`
            );
          } else if (primaryStaffForWriting?.writingInstructions && primaryStaffForWriting.writingInstructions.trim()) {
            donorStaffWritingInstructions = primaryStaffForWriting.writingInstructions;
            triggerLogger.info(
              `Using primary staff writing instructions for donor ${donorInfo.id} from ${primaryStaffForWriting.firstName} ${primaryStaffForWriting.lastName}`
            );
          } else {
            donorStaffWritingInstructions = undefined;
            triggerLogger.info(`No staff writing instructions available for donor ${donorInfo.id}`);
          }

          // Generate email for single donor using generateSmartDonorEmails directly
          const singleDonorResult = await generateSmartDonorEmails(
            [donorInfo], // Single donor
            "", // Empty instruction - chat history will be used instead
            organization.name,
            emailGeneratorOrg,
            organizationWritingInstructions,
            donorStaffWritingInstructions, // Pass donor-specific staff writing instructions
            { [donorInfo.id]: communicationHistories[donorInfo.id] || [] },
            { [donorInfo.id]: donationHistoriesMap[donorInfo.id] || [] },
            donorStatistics, // Pass donor statistics
            personResearchResults, // Pass person research results
            userMemories,
            organizationMemories,
            undefined, // currentDate - will use default
            undefined, // previousInstruction - not needed with chat history
            chatHistory // Pass the chat history to handle conversation context
          );

          // Log format verification for each generated email
          if (singleDonorResult.emails.length > 0) {
            const email = singleDonorResult.emails[0];
            triggerLogger.info(
              `[TRIGGER-FORMAT-CHECK] Donor ${
                donorInfo.id
              } - hasEmailContent: ${!!email.emailContent}, hasReasoning: ${!!email.reasoning}, hasResponse: ${!!email.response}, emailContentLength: ${
                email.emailContent?.length || 0
              }, reasoningLength: ${email.reasoning?.length || 0}, responseLength: ${email.response?.length || 0}`
            );
            triggerLogger.info(
              `[TRIGGER-FORMAT-CHECK] Donor ${
                donorInfo.id
              } - hasStructuredContent: ${!!email.structuredContent}, structuredContentLength: ${
                email.structuredContent?.length || 0
              }`
            );
          }

          // Add results to the main array (thread-safe since we're awaiting each batch)
          triggerLogger.info(
            `[DEBUG-PUSH] Before push - singleDonorResult.emails[0] response: ${
              singleDonorResult.emails[0]?.response
                ? `"${singleDonorResult.emails[0].response.substring(0, 50)}..."`
                : "undefined"
            }`
          );
          allEmailResults.push(...singleDonorResult.emails);
          triggerLogger.info(
            `[DEBUG-PUSH] After push - allEmailResults last item response: ${
              allEmailResults[allEmailResults.length - 1]?.response
                ? `"${allEmailResults[allEmailResults.length - 1].response?.substring(0, 50)}..."`
                : "undefined"
            }`
          );
          return singleDonorResult.emails;
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
      const emailInserts = allEmailResults.map((email) => {
        // Log the email object to debug
        triggerLogger.info(`[DEBUG] Email object keys for donor ${email.donorId}: ${Object.keys(email).join(", ")}`);
        triggerLogger.info(
          `[DEBUG] Email object for donor ${email.donorId}: ${JSON.stringify({
            hasResponse: !!email.response,
            responseLength: email.response?.length || 0,
            responsePreview: email.response?.substring(0, 100),
          })}`
        );
        // Find the donor to get their assigned staff info
        const donor = donorsToGenerate.find((d) => d.id === email.donorId);
        const assignedStaff = donor?.assignedStaff;

        // Create the appropriate signature
        let signature: string;
        let signatureSource: string = "default";

        if (assignedStaff?.signature && assignedStaff.signature.trim()) {
          // Use custom signature if it exists and is not empty
          signature = assignedStaff.signature;
          signatureSource = `assigned staff (${assignedStaff.firstName} ${assignedStaff.lastName})`;
        } else if (assignedStaff) {
          // Default signature format: "Best, firstname"
          signature = `Best,\n${assignedStaff.firstName}`;
          signatureSource = `assigned staff default (${assignedStaff.firstName})`;
        } else if (primaryStaff?.signature && primaryStaff.signature.trim()) {
          // Use primary staff signature if available and not empty
          signature = primaryStaff.signature;
          signatureSource = `primary staff (${primaryStaff.firstName} ${primaryStaff.lastName})`;
        } else if (primaryStaff) {
          // Default signature format for primary staff: "Best, firstname"
          signature = `Best,\n${primaryStaff.firstName}`;
          signatureSource = `primary staff default (${primaryStaff.firstName})`;
        } else {
          // Fallback to user signature if no staff assigned and no primary staff
          signature = user.emailSignature || `Best,\n${user.firstName}`;
          signatureSource = user.emailSignature
            ? `user (${user.firstName} ${user.lastName})`
            : `user default (${user.firstName})`;
        }

        // Log detailed signature information
        triggerLogger.info(`[SIGNATURE] Donor ${email.donorId} - Using signature from: ${signatureSource}`);
        triggerLogger.info(`[SIGNATURE] Donor ${email.donorId} - Signature length: ${signature.length} chars`);
        triggerLogger.info(
          `[SIGNATURE] Donor ${email.donorId} - Contains <img>: ${signature.includes(
            "<img"
          )}, Contains src=: ${signature.includes("src=")}`
        );

        // Log first 500 chars of signature for debugging
        triggerLogger.info(
          `[SIGNATURE] Donor ${email.donorId} - First 500 chars: ${signature.substring(0, 500).replace(/\n/g, "\\n")}`
        );

        // Extract and log image tags if present
        const imgMatches = signature.match(/<img[^>]*>/gi);
        if (imgMatches) {
          triggerLogger.info(`[SIGNATURE] Donor ${email.donorId} - Found ${imgMatches.length} image tag(s)`);
          imgMatches.forEach((img, index) => {
            triggerLogger.info(`[SIGNATURE] Donor ${email.donorId} - Image ${index + 1}: ${img}`);
          });
        }

        // Append signature to the structured content
        // Provide fallback for undefined structuredContent
        const structuredContent = email.structuredContent || [];

        // Check if we need spacing before signature
        const needsSpacing =
          structuredContent.length > 0 && structuredContent[structuredContent.length - 1].addNewlineAfter === false;

        const signaturePieces = needsSpacing
          ? [
              {
                piece: "", // Empty piece for spacing only if needed
                references: [],
                addNewlineAfter: true,
              },
              {
                piece: signature,
                references: ["signature"], // Mark as signature for proper HTML processing
                addNewlineAfter: false,
              },
            ]
          : [
              {
                piece: signature,
                references: ["signature"], // Mark as signature for proper HTML processing
                addNewlineAfter: false,
              },
            ];

        const enhancedStructuredContent = [...structuredContent, ...signaturePieces];

        const insertData = {
          sessionId,
          donorId: email.donorId,
          subject: email.subject,
          // Legacy format fields (for backward compatibility)
          structuredContent: enhancedStructuredContent,
          referenceContexts: email.referenceContexts,
          // New format fields
          emailContent: email.emailContent,
          reasoning: email.reasoning,
          response: email.response,
          status: "APPROVED",
          isPreview: false,
          isSent: false,
          sendStatus: "pending",
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        // Log what we're inserting
        triggerLogger.info(
          `[DEBUG] Insert data for donor ${email.donorId}: ${JSON.stringify({
            hasResponse: !!insertData.response,
            responseLength: insertData.response?.length || 0,
          })}`
        );

        return insertData;
      });

      await db.insert(generatedEmails).values(emailInserts);

      // Update session status to COMPLETED since all emails are now generated
      const totalCompletedDonors = selectedDonorIds.length; // All selected donors now have emails
      await db
        .update(emailGenerationSessions)
        .set({
          status: EmailGenerationSessionStatus.COMPLETED,
          completedDonors: totalCompletedDonors,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(emailGenerationSessions.id, sessionId));

      triggerLogger.info(`Bulk email generation completed for session ${sessionId}`);

      return {
        status: "success",
        sessionId,
        emailsGenerated: allEmailResults.length,
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
          errorMessage: error instanceof Error ? error.message : "Unknown error",
          updatedAt: new Date(),
        })
        .where(eq(emailGenerationSessions.id, sessionId));

      throw error;
    }
  },
});
