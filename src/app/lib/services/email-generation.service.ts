import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/app/lib/db";
import { organizations, donors as donorsSchema, staff, generatedEmails } from "@/app/lib/db/schema";
import { logger } from "@/app/lib/logger";
import { getDonorCommunicationHistory } from "@/app/lib/data/communications";
import { DonationWithDetails, listDonations, getMultipleComprehensiveDonorStats } from "@/app/lib/data/donations";
import { getOrganizationMemories } from "@/app/lib/data/organizations";
import { getDismissedMemories, getUserMemories, getUserById } from "@/app/lib/data/users";
import { generateSmartDonorEmails } from "@/app/lib/utils/email-generator";
import { processProjectMentions } from "@/app/lib/utils/email-generator/mention-processor";
import { RawCommunicationThread, Organization, DonorStatistics } from "@/app/lib/utils/email-generator/types";
import { PersonResearchService } from "./person-research.service";
import { PersonResearchResult } from "./person-research/types";
import { EmailEnhancementService } from "./email-enhancement.service";

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
    const { instruction, donors, organizationWritingInstructions, previousInstruction, chatHistory } = input;
    const currentDate = new Date().toDateString();

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

    // Fetch comprehensive donor statistics
    logger.info(`Fetching comprehensive donor statistics for ${donorIds.length} donors`);
    const donorStatistics = await getMultipleComprehensiveDonorStats(donorIds, organizationId);

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
      donationHistoriesMap[donor.id] = donationHistory;
    });

    // Call the main email generator with all the data
    const result = await generateSmartDonorEmails(
      donorInfos,
      processedInstruction,
      input.organizationName,
      emailGeneratorOrg,
      organizationWritingInstructions,
      communicationHistories,
      donationHistoriesMap,
      donorStatistics, // Pass donor statistics
      personResearchResults, // Pass person research results
      userMemories,
      organizationMemories,
      currentDate,
      input.signature || user?.emailSignature || undefined, // Use provided signature or fallback to user signature
      previousInstruction, // Pass the previous instruction to enable stateful refinement
      chatHistory // Pass the chat history to the refinement agent
    );

    // Get primary staff for fallback
    const primaryStaff = await db.query.staff.findFirst({
      where: and(eq(staff.organizationId, organizationId), eq(staff.isPrimary, true)),
    });

    // Add signatures to each generated email
    const emailsWithSignatures = result.emails.map((email) => {
      // Find the donor to get their assigned staff info
      const donor = fullDonorData.find((d) => d.id === email.donorId);
      const assignedStaff = donor?.assignedStaff;

      // Create the appropriate signature
      let signature: string;
      let signatureSource: string;

      if (input.signature && input.signature.trim()) {
        // Use provided signature from WriteInstructionStep if available
        signature = input.signature;
        signatureSource = "provided custom signature";
      } else if (assignedStaff?.signature && assignedStaff.signature.trim()) {
        // Use custom signature if it exists and is not empty
        signature = assignedStaff.signature;
        signatureSource = `custom signature from assigned staff ${assignedStaff.firstName} ${assignedStaff.lastName}`;
      } else if (assignedStaff) {
        // Default signature format: "Best, firstname"
        signature = `Best,\n${assignedStaff.firstName}`;
        signatureSource = `default format for assigned staff ${assignedStaff.firstName} ${assignedStaff.lastName}`;
      } else if (primaryStaff?.signature && primaryStaff.signature.trim()) {
        // Use primary staff signature if available and not empty
        signature = primaryStaff.signature;
        signatureSource = `custom signature from primary staff ${primaryStaff.firstName} ${primaryStaff.lastName}`;
      } else if (primaryStaff) {
        // Default signature format for primary staff: "Best, firstname"
        signature = `Best,\n${primaryStaff.firstName}`;
        signatureSource = `default format for primary staff ${primaryStaff.firstName} ${primaryStaff.lastName}`;
      } else {
        // Fallback to user signature if no staff assigned and no primary staff
        signature = user?.emailSignature || `Best,\n${user?.firstName || "Team"}`;
        signatureSource = user?.emailSignature ? "user email signature" : "default fallback signature";
      }

      // Log signature usage for debugging
      logger.info(`Email for donor ${donor?.displayName || donor?.firstName}: Using ${signatureSource}`);

      // Append signature to the structured content
      const enhancedStructuredContent = [
        ...email.structuredContent,
        {
          piece: signature,
          references: ["signature"], // Mark as signature content
          addNewlineAfter: false,
        },
      ];

      return {
        ...email,
        structuredContent: enhancedStructuredContent,
      };
    });

    // Log comprehensive token usage summary
    logger.info(`Successfully generated ${emailsWithSignatures.length} emails for organization ${organizationId}`);

    logger.info(
      `Token usage summary for organization ${organizationId} email generation: Instruction Refinement: ${result.tokenUsage.instructionRefinement.totalTokens} tokens (${result.tokenUsage.instructionRefinement.promptTokens} input, ${result.tokenUsage.instructionRefinement.completionTokens} output), Email Generation: ${result.tokenUsage.emailGeneration.totalTokens} tokens (${result.tokenUsage.emailGeneration.promptTokens} input, ${result.tokenUsage.emailGeneration.completionTokens} output), TOTAL: ${result.tokenUsage.total.totalTokens} tokens (${result.tokenUsage.total.promptTokens} input, ${result.tokenUsage.total.completionTokens} output)`
    );

    return {
      ...result,
      emails: emailsWithSignatures,
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
        donor: true,
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

    // Extract signature from the original email if it exists
    const originalSignaturePiece = emailData.structuredContent?.find((piece: any) =>
      piece.references?.includes("signature")
    );

    // Re-append signature to enhanced content if it existed
    let finalStructuredContent = result.structuredContent;
    if (originalSignaturePiece) {
      finalStructuredContent = [...result.structuredContent, originalSignaturePiece];
    }

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
    const service = new EmailEnhancementService();
    return await service.enhanceEmail(options);
  }
}
