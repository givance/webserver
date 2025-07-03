import { getDonorCommunicationHistory } from "@/app/lib/data/communications";
import {
  DonationWithDetails,
  getMultipleComprehensiveDonorStats,
  getMultipleComprehensiveDonorStatsExcludingExternal,
  listDonations,
} from "@/app/lib/data/donations";
import { getOrganizationMemories } from "@/app/lib/data/organizations";
import { getUserById, getUserMemories } from "@/app/lib/data/users";
import { db } from "@/app/lib/db";
import { donors as donorsSchema, generatedEmails, organizations, staff } from "@/app/lib/db/schema";
import { logger } from "@/app/lib/logger";
import { generateSmartDonorEmails } from "@/app/lib/utils/email-generator";
import { processProjectMentions } from "@/app/lib/utils/email-generator/mention-processor";
import { DonorStatistics, Organization, RawCommunicationThread } from "@/app/lib/utils/email-generator/types";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { PersonResearchService } from "./person-research.service";
import { PersonResearchResult } from "./person-research/types";

/**
 * Input types for email generation
 */
export interface DonorInput {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}

export interface GenerateEmailsInput {
  instruction: string;
  donors: DonorInput[];
  organizationName: string;
  organizationWritingInstructions?: string;
  previousInstruction?: string;
  currentDate?: string;
  chatHistory?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  signature?: string;
}

/**
 * Service for handling email generation business logic
 */
export class EmailGenerationService {
  /**
   * Generates smart donor emails based on instruction and donor data
   * @param input - Email generation parameters
   * @param organizationId - The organization ID
   * @param userId - The user ID for fetching user memories
   * @returns Generated emails for each donor
   */
  async generateSmartEmails(input: GenerateEmailsInput, organizationId: string, userId: string) {
    const { instruction, donors, organizationWritingInstructions, previousInstruction, chatHistory, signature } = input;
    const currentDate = new Date().toDateString();

    // Debug logging for chat history
    logger.info(`[EmailGenerationService] Chat history received: ${chatHistory ? chatHistory.length : 0} messages`);
    if (chatHistory && chatHistory.length > 0) {
      logger.info(
        `[EmailGenerationService] Latest message: ${chatHistory[chatHistory.length - 1]?.role}: "${
          chatHistory[chatHistory.length - 1]?.content
        }"`
      );
    }

    // Log signature usage
    if (signature && signature.trim()) {
      logger.info(`[EmailGenerationService] Using custom signature from UI: ${signature.length} characters`);
    } else {
      logger.info(`[EmailGenerationService] No custom signature provided, will use assigned staff signatures`);
    }

    // Process project mentions in the instruction
    const processedInstruction = await processProjectMentions(instruction, organizationId);

    if (processedInstruction !== instruction) {
      logger.info(
        `Processed project mentions in instruction for organization ${organizationId} (original: "${instruction}", processed: "${processedInstruction}")`
      );
    }

    // Get organization data
    const [organization] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);

    if (!organization) {
      logger.error(`Organization ${organizationId} not found for email generation`);
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Organization not found",
      });
    }

    // Fetch full donor data from database to include notes and assigned staff
    const donorIds = donors.map((d) => d.id);
    const fullDonorData = await db.query.donors.findMany({
      where: and(inArray(donorsSchema.id, donorIds), eq(donorsSchema.organizationId, organizationId)),
      with: {
        assignedStaff: true, // Include staff assignment and signature
      },
    });

    if (fullDonorData.length !== donorIds.length) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Some donors not found or don't belong to this organization",
      });
    }

    // Convert to DonorInfo format including notes
    const donorInfos = fullDonorData.map((donor) => ({
      id: donor.id,
      email: donor.email,
      notes: donor.notes, // Include user notes
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

    // Convert organization to the email generator format
    const emailGeneratorOrg = {
      ...organization,
      rawWebsiteSummary: organization.websiteSummary,
    };

    // Fetch all donor histories concurrently for better performance
    const historiesPromises = donorInfos.map(async (donor) => {
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
    });

    const donorHistories = await Promise.all(historiesPromises);

    // Fetch comprehensive donor statistics (excluding external donations for LLM)
    logger.info(`Fetching comprehensive donor statistics for ${donorIds.length} donors`);
    const donorStatistics = await getMultipleComprehensiveDonorStatsExcludingExternal(donorIds, organizationId);

    // Fetch person research results for donors
    logger.info(`Fetching person research results for ${donorIds.length} donors`);
    const personResearchService = new PersonResearchService();
    const personResearchResults: Record<number, PersonResearchResult> = {};

    await Promise.all(
      donorIds.map(async (donorId) => {
        try {
          const research = await personResearchService.getPersonResearch(donorId, organizationId);
          if (research) {
            personResearchResults[donorId] = research;
            logger.info(`Found person research for donor ${donorId}: "${research.researchTopic}"`);
          }
        } catch (error) {
          logger.warn(
            `Failed to fetch person research for donor ${donorId}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      })
    );

    // Get organizational and user memories
    const [organizationMemories, userMemories, user] = await Promise.all([
      getOrganizationMemories(organizationId),
      getUserMemories(userId),
      getUserById(userId),
    ]);

    logger.info(
      `Generating emails for ${donorInfos.length} donors in organization ${organizationId} with instruction: "${processedInstruction}"`
    );

    // Convert donor histories to the format expected by the email generator
    const communicationHistories: Record<number, RawCommunicationThread[]> = {};
    const donationHistoriesMap: Record<number, DonationWithDetails[]> = {};

    donorHistories.forEach(({ donor, communicationHistory, donationHistory }) => {
      communicationHistories[donor.id] = communicationHistory;
      // Filter out donations from external projects for LLM
      const nonExternalDonations = donationHistory.filter((donation) => !donation.project?.external);
      donationHistoriesMap[donor.id] = nonExternalDonations;
    });

    // Get primary staff for fallback writing instructions
    const primaryStaffForWriting = await db.query.staff.findFirst({
      where: and(eq(staff.organizationId, organizationId), eq(staff.isPrimary, true)),
    });

    // Since we need per-donor staff writing instructions, we'll generate emails individually
    // to ensure each donor gets their assigned staff's writing instructions
    const emailGenerationPromises = donorInfos.map(async (donorInfo) => {
      // Find the corresponding full donor data to get assigned staff
      const fullDonor = fullDonorData.find((d) => d.id === donorInfo.id);
      const assignedStaff = fullDonor?.assignedStaff;

      // Determine the appropriate staff writing instructions for this donor
      let donorStaffWritingInstructions: string | undefined;
      let staffName: string | undefined;

      if (assignedStaff?.writingInstructions && assignedStaff.writingInstructions.trim()) {
        donorStaffWritingInstructions = assignedStaff.writingInstructions;
        staffName = `${assignedStaff.firstName} ${assignedStaff.lastName}`;
        logger.info(
          `Using assigned staff writing instructions for donor ${donorInfo.id} from ${assignedStaff.firstName} ${assignedStaff.lastName}`
        );
      } else if (primaryStaffForWriting?.writingInstructions && primaryStaffForWriting.writingInstructions.trim()) {
        donorStaffWritingInstructions = primaryStaffForWriting.writingInstructions;
        staffName = `${primaryStaffForWriting.firstName} ${primaryStaffForWriting.lastName}`;
        logger.info(
          `Using primary staff writing instructions for donor ${donorInfo.id} from ${primaryStaffForWriting.firstName} ${primaryStaffForWriting.lastName}`
        );
      } else {
        // Use assigned staff name even if no writing instructions
        if (assignedStaff) {
          staffName = `${assignedStaff.firstName} ${assignedStaff.lastName}`;
        } else if (primaryStaffForWriting) {
          staffName = `${primaryStaffForWriting.firstName} ${primaryStaffForWriting.lastName}`;
        }
        donorStaffWritingInstructions = undefined;
        logger.info(
          `No staff writing instructions available for donor ${donorInfo.id}, using staff name: ${staffName || "None"}`
        );
      }

      // Generate email for this single donor with their specific staff writing instructions
      return await generateSmartDonorEmails(
        [donorInfo], // Single donor
        processedInstruction,
        input.organizationName,
        emailGeneratorOrg,
        organization.writingInstructions || undefined, // Use database value instead of input parameter
        donorStaffWritingInstructions, // Pass donor-specific staff writing instructions
        { [donorInfo.id]: communicationHistories[donorInfo.id] || [] },
        { [donorInfo.id]: donationHistoriesMap[donorInfo.id] || [] },
        { [donorInfo.id]: donorStatistics[donorInfo.id] },
        { [donorInfo.id]: personResearchResults[donorInfo.id] },
        userMemories,
        organizationMemories,
        currentDate,
        previousInstruction, // Pass the previous instruction to enable stateful refinement
        chatHistory, // Pass the chat history to the refinement agent
        staffName // Pass the staff name
      );
    });

    // Wait for all email generations to complete
    const individualResults = await Promise.all(emailGenerationPromises);

    // Combine all results into a single result
    const result = {
      refinedInstruction: individualResults[0]?.refinedInstruction || processedInstruction,
      reasoning: individualResults[0]?.reasoning || "",
      emails: individualResults.flatMap((result) => result.emails),
      suggestedMemories: individualResults[0]?.suggestedMemories || [],
      tokenUsage: individualResults.reduce(
        (totalUsage, result) => {
          return {
            instructionRefinement: {
              promptTokens:
                totalUsage.instructionRefinement.promptTokens + result.tokenUsage.instructionRefinement.promptTokens,
              completionTokens:
                totalUsage.instructionRefinement.completionTokens +
                result.tokenUsage.instructionRefinement.completionTokens,
              totalTokens:
                totalUsage.instructionRefinement.totalTokens + result.tokenUsage.instructionRefinement.totalTokens,
            },
            emailGeneration: {
              promptTokens: totalUsage.emailGeneration.promptTokens + result.tokenUsage.emailGeneration.promptTokens,
              completionTokens:
                totalUsage.emailGeneration.completionTokens + result.tokenUsage.emailGeneration.completionTokens,
              totalTokens: totalUsage.emailGeneration.totalTokens + result.tokenUsage.emailGeneration.totalTokens,
            },
            total: {
              promptTokens: totalUsage.total.promptTokens + result.tokenUsage.total.promptTokens,
              completionTokens: totalUsage.total.completionTokens + result.tokenUsage.total.completionTokens,
              totalTokens: totalUsage.total.totalTokens + result.tokenUsage.total.totalTokens,
            },
          };
        },
        {
          instructionRefinement: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          emailGeneration: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          total: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        }
      ),
    };

    // Return emails without signatures - signatures will be appended at display/send time
    const emailsWithoutSignatures = result.emails;

    // Log comprehensive token usage summary
    logger.info(`Successfully generated ${emailsWithoutSignatures.length} emails for organization ${organizationId}`);

    logger.info(
      `Token usage summary for organization ${organizationId} email generation: Instruction Refinement: ${result.tokenUsage.instructionRefinement.totalTokens} tokens (${result.tokenUsage.instructionRefinement.promptTokens} input, ${result.tokenUsage.instructionRefinement.completionTokens} output), Email Generation: ${result.tokenUsage.emailGeneration.totalTokens} tokens (${result.tokenUsage.emailGeneration.promptTokens} input, ${result.tokenUsage.emailGeneration.completionTokens} output), TOTAL: ${result.tokenUsage.total.totalTokens} tokens (${result.tokenUsage.total.promptTokens} input, ${result.tokenUsage.total.completionTokens} output)`
    );

    return {
      ...result,
      emails: emailsWithoutSignatures,
    };
  }

  /**
   * Enhances an existing email using AI based on user instructions
   * @param input - Enhancement parameters including email content and instruction
   * @param organizationId - The organization ID
   * @param userId - The user ID for fetching user memories
   * @returns Enhanced email with updated content
   */
  async enhanceEmail(
    input: {
      emailId: number;
      enhancementInstruction: string;
      currentSubject: string;
      currentStructuredContent: Array<{
        piece: string;
        references: string[];
        addNewlineAfter: boolean;
      }>;
      currentReferenceContexts: Record<string, string>;
    },
    organizationId: string,
    userId: string
  ) {
    const { emailId, enhancementInstruction, currentSubject, currentStructuredContent, currentReferenceContexts } =
      input;

    logger.info(
      `Enhancing email ${emailId} for organization ${organizationId} with instruction: "${enhancementInstruction}"`
    );

    // Get the email's associated donor and campaign information
    const emailData = await db.query.generatedEmails.findFirst({
      where: eq(generatedEmails.id, emailId),
      with: {
        donor: {
          with: {
            assignedStaff: true,
          },
        },
        session: true,
      },
    });

    if (!emailData) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Email not found",
      });
    }

    // Check that the email belongs to the user's organization
    if (emailData.session.organizationId !== organizationId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Email does not belong to your organization",
      });
    }

    if (emailData.sentAt) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Cannot enhance an email that has already been sent",
      });
    }

    // Get organization data
    const [organization] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);

    if (!organization) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Organization not found",
      });
    }

    // Fetch donor context for enhancement
    const [communicationHistory, donationHistory, donorStats] = await Promise.all([
      getDonorCommunicationHistory(emailData.donorId, { organizationId }),
      listDonations({
        donorId: emailData.donorId,
        limit: 50,
        orderBy: "date",
        orderDirection: "desc",
        includeProject: true,
      }),
      getMultipleComprehensiveDonorStats([emailData.donorId], organizationId),
    ]);

    // Get person research if available
    const personResearchService = new PersonResearchService();
    let personResearch: PersonResearchResult | undefined;
    try {
      const research = await personResearchService.getPersonResearch(emailData.donorId, organizationId);
      if (research) {
        personResearch = research;
      }
    } catch (error) {
      logger.warn(`Failed to fetch person research for donor ${emailData.donorId} during enhancement`);
    }

    // Get memories
    const [organizationMemories, userMemories] = await Promise.all([
      getOrganizationMemories(organizationId),
      getUserMemories(userId),
    ]);

    // Use the existing email generation service to enhance the email
    const emailService = new EmailGenerationService();
    const result = await emailService.enhanceSingleEmail({
      emailId,
      donorId: emailData.donorId,
      donor: emailData.donor,
      currentSubject,
      currentStructuredContent,
      currentReferenceContexts,
      enhancementInstruction,
      organizationName: organization.name,
      organization: {
        ...organization,
        rawWebsiteSummary: organization.websiteSummary,
      },
      organizationWritingInstructions: organization.writingInstructions || undefined,
      communicationHistory: communicationHistory.map((thread) => ({
        content: thread.content?.map((message) => ({ content: message.content })) || [],
      })) as RawCommunicationThread[],
      donationHistory: donationHistory.donations,
      donorStatistics: donorStats[emailData.donorId],
      personResearch,
      userMemories,
      organizationMemories,
      originalInstruction: emailData.session.instruction,
    });

    // Don't append signature - it will be added at display/send time
    const finalStructuredContent = result.structuredContent;

    // Update the email in the database with the enhanced content
    const [updatedEmail] = await db
      .update(generatedEmails)
      .set({
        subject: result.subject,
        structuredContent: finalStructuredContent,
        referenceContexts: result.referenceContexts,
        updatedAt: new Date(),
      })
      .where(eq(generatedEmails.id, emailId))
      .returning();

    logger.info(`Successfully enhanced and updated email ${emailId} for donor ${emailData.donorId}`);

    return {
      ...result,
      email: updatedEmail,
      sessionId: emailData.sessionId,
    };
  }

  /**
   * Internal method to enhance a single email using AI
   */
  private async enhanceSingleEmail(options: {
    emailId: number;
    donorId: number;
    donor: any;
    currentSubject: string;
    currentStructuredContent: Array<{
      piece: string;
      references: string[];
      addNewlineAfter: boolean;
    }>;
    currentReferenceContexts: Record<string, string>;
    enhancementInstruction: string;
    organizationName: string;
    organization: Organization | null;
    organizationWritingInstructions?: string;
    communicationHistory: RawCommunicationThread[];
    donationHistory: DonationWithDetails[];
    donorStatistics?: DonorStatistics;
    personResearch?: PersonResearchResult;
    userMemories: string[];
    organizationMemories: string[];
    originalInstruction: string;
  }) {
    const {
      emailId,
      donorId,
      donor,
      currentSubject,
      currentStructuredContent,
      currentReferenceContexts,
      enhancementInstruction,
      organizationName,
      organization,
      organizationWritingInstructions,
      communicationHistory,
      donationHistory,
      donorStatistics,
      personResearch,
      userMemories,
      organizationMemories,
      originalInstruction,
    } = options;

    // Filter out signature from current content before sending to AI
    const contentWithoutSignature = currentStructuredContent.filter(
      (piece) => !piece.references?.includes("signature")
    );

    // Build the current email content as a single string (without signature)
    const currentEmailContent = contentWithoutSignature
      .map((piece) => piece.piece + (piece.addNewlineAfter ? "\n\n" : ""))
      .join("")
      .trim();

    // Create an enhanced instruction that includes both the original instruction, current email, and enhancement request
    const combinedInstruction = `${originalInstruction}

CURRENT EMAIL TO ENHANCE:
Subject: ${currentSubject}
Content:
${currentEmailContent}

ENHANCEMENT REQUEST: ${enhancementInstruction}

Please regenerate this email following the original instruction while incorporating the enhancement request above. Maintain the same tone and style but apply the requested changes.`;

    // Use the smart generation flow with a single donor
    const result = await generateSmartDonorEmails(
      [{ id: donorId, firstName: donor.firstName, lastName: donor.lastName, email: donor.email }],
      combinedInstruction,
      organizationName,
      organization,
      organizationWritingInstructions,
      undefined, // staffWritingInstructions not available in enhancement context
      { [donorId]: communicationHistory },
      { [donorId]: donationHistory },
      donorStatistics ? { [donorId]: donorStatistics } : {},
      personResearch ? { [donorId]: personResearch } : {},
      userMemories,
      organizationMemories,
      new Date().toDateString(),
      originalInstruction, // Use original instruction as previous for context
      undefined // No chat history available in enhancement context
    );

    if (!result.emails || result.emails.length === 0) {
      throw new Error("Failed to generate enhanced email");
    }

    const enhancedEmail = result.emails[0];

    return {
      emailId,
      donorId,
      subject: enhancedEmail.subject,
      structuredContent: enhancedEmail.structuredContent,
      referenceContexts: enhancedEmail.referenceContexts,
      reasoning: result.reasoning,
      tokenUsage: enhancedEmail.tokenUsage,
    };
  }
}
