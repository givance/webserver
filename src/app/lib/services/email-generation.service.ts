import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/app/lib/db";
import { organizations, donors as donorsSchema, staff } from "@/app/lib/db/schema";
import { logger } from "@/app/lib/logger";
import { getDonorCommunicationHistory } from "@/app/lib/data/communications";
import { DonationWithDetails, listDonations, getMultipleComprehensiveDonorStats } from "@/app/lib/data/donations";
import { getOrganizationMemories } from "@/app/lib/data/organizations";
import { getDismissedMemories, getUserMemories, getUserById } from "@/app/lib/data/users";
import { generateSmartDonorEmails } from "@/app/lib/utils/email-generator";
import { processProjectMentions } from "@/app/lib/utils/email-generator/mention-processor";
import { RawCommunicationThread } from "@/app/lib/utils/email-generator/types";

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
    const { instruction, donors, organizationWritingInstructions, previousInstruction } = input;
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
      userMemories,
      organizationMemories,
      currentDate,
      user?.emailSignature || undefined,
      previousInstruction // Pass the previous instruction to enable stateful refinement
    );

    // Get primary staff for fallback
    const primaryStaff = await db.query.staff.findFirst({
      where: and(eq(staff.organizationId, organizationId), eq(staff.isPrimary, true)),
    });

    // Add staff signatures to each generated email
    const emailsWithSignatures = result.emails.map((email) => {
      // Find the donor to get their assigned staff info
      const donor = fullDonorData.find((d) => d.id === email.donorId);
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
        signature = user?.emailSignature || `Best,\n${user?.firstName || "Team"}`;
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
}
