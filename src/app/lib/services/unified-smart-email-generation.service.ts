import {
  generateSingleEmail,
  type SingleEmailGeneratorParams,
} from '@/app/lib/utils/email-generator/single-email-generator';
import {
  getComprehensiveDonorStats,
  getDonorDonationsWithProjects,
} from '@/app/lib/data/donations';
import { getUserMemories } from '@/app/lib/data/users';
import { getDonorCommunicationHistory } from '@/app/lib/data/communications';
import { getOrganizationById, getOrganizationMemories } from '@/app/lib/data/organizations';
import {
  getEmailGenerationSessionById,
  saveGeneratedEmail as saveGeneratedEmailData,
  getEmailBySessionAndDonor,
} from '@/app/lib/data/email-campaigns';
import { getAllStaffByOrganization } from '@/app/lib/data/staff';
import { getDonorsByIds, getAllDonorsByOrganization } from '@/app/lib/data/donors';
import { getPersonResearchByDonor } from '@/app/lib/data/person-research';
import { getListMembers } from '@/app/lib/data/donor-lists';
import { EmailReviewService, type EmailReviewResult } from './email-review.service';
import { EmailRefinementService } from './email-refinement.service';
import { logger } from '@/app/lib/logger';

interface GenerateSmartEmailsParams {
  organizationId: string;
  sessionId: string;
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  donorIds?: string[];
}

interface SmartEmailGenerationResult {
  donor: any; // Will be properly typed from DB query
  email: {
    subject: string;
    content: string;
    reasoning: string;
    response: string;
  } | null;
  error?: string;
  tokensUsed?: number;
}

export type EmailGenerationStreamUpdate = {
  status: 'generating' | 'generated' | 'reviewing' | 'refining' | 'refined';
  message?: string;
  result?: {
    results: SmartEmailGenerationResult[];
    totalTokensUsed: number;
  };
};

export class UnifiedSmartEmailGenerationService {
  private emailReviewService: EmailReviewService;
  private emailRefinementService: EmailRefinementService;

  constructor() {
    this.emailReviewService = new EmailReviewService();
    this.emailRefinementService = new EmailRefinementService();
  }

  /**
   * Main entry point that fetches all necessary data and generates emails for all donors
   */
  async generateSmartEmailsForCampaign(params: GenerateSmartEmailsParams): Promise<{
    results: SmartEmailGenerationResult[];
    totalTokensUsed: number;
  }> {
    // 1. Query organizational settings
    const organization = await this.getOrganization(params.organizationId);
    if (!organization) {
      throw new Error('Organization not found');
    }

    // 2. Query the user who created the session
    const session = await this.getSession(params.sessionId, params.organizationId);
    if (!session) {
      throw new Error('Session not found');
    }

    // 3. Query all staff members
    const staffMembers = await this.getStaffMembers(params.organizationId);

    // 4. Query all donors (with optional filtering)
    const donorsData = await this.getDonorsWithStaffAssignments(
      params.organizationId,
      params.donorIds?.map((id) => Number(id))
    );

    // 5. Run Promise.all on the generation function
    const currentDate = new Date().toISOString();
    const results = await Promise.all(
      donorsData.map((donor) =>
        this.generateSmartEmailForDonor({
          donor,
          organization,
          staffMembers,
          sessionId: params.sessionId,
          userId: session.userId,
          currentDate,
          chatHistory: params.chatHistory,
        })
      )
    );

    // Calculate total tokens used
    const totalTokensUsed = results.reduce((sum, result) => sum + (result.tokensUsed || 0), 0);

    // Fetch updated results from database to ensure consistency with any potential refinements
    const finalResults = await this.buildResultsFromDatabase(params.sessionId, results);

    return { results: finalResults, totalTokensUsed };
  }

  /**
   * Streaming version of email generation with status updates
   */
  async *generateSmartEmailsForCampaignStream(
    params: GenerateSmartEmailsParams
  ): AsyncGenerator<EmailGenerationStreamUpdate> {
    try {
      // Emit generating status
      yield {
        status: 'generating' as const,
        message: 'Starting email generation...',
      };

      // 1. Query organizational settings
      const organization = await this.getOrganization(params.organizationId);
      if (!organization) {
        throw new Error('Organization not found');
      }

      // 2. Query the user who created the session
      const session = await this.getSession(params.sessionId, params.organizationId);
      if (!session) {
        throw new Error('Session not found');
      }

      // 3. Query all staff members
      const staffMembers = await this.getStaffMembers(params.organizationId);

      // 4. Query all donors (with optional filtering)
      const donorsData = await this.getDonorsWithStaffAssignments(
        params.organizationId,
        params.donorIds?.map((id) => Number(id))
      );

      // 5. Run Promise.all on the generation function
      const currentDate = new Date().toISOString();
      const results = await Promise.all(
        donorsData.map((donor) =>
          this.generateSmartEmailForDonor({
            donor,
            organization,
            staffMembers,
            sessionId: params.sessionId,
            userId: session.userId,
            currentDate,
            chatHistory: params.chatHistory,
          })
        )
      );

      // Calculate total tokens used
      const totalTokensUsed = results.reduce((sum, result) => sum + (result.tokensUsed || 0), 0);

      // Emit generated status with results
      yield {
        status: 'generated' as const,
        result: { results, totalTokensUsed },
      };

      // Start review process
      yield {
        status: 'reviewing' as const,
        message: 'Reviewing generated emails...',
      };

      // Get successfully generated email IDs for review
      const emailIdsToReview: number[] = [];
      for (const result of results) {
        if (result.email && 'id' in result.donor) {
          // Assume saved emails have IDs - in real implementation, we'd need to fetch them
          const savedEmail = await this.getEmailBySessionAndDonor(
            params.sessionId,
            result.donor.id,
            params.organizationId
          );
          if (savedEmail?.id) {
            emailIdsToReview.push(savedEmail.id);
          }
        }
      }

      if (emailIdsToReview.length > 0) {
        // Review the generated emails
        const reviewResults = await this.emailReviewService.reviewEmails(
          emailIdsToReview,
          params.organizationId
        );

        logger.info('[generateSmartEmailsForCampaignStream] Review completed', {
          reviewCount: reviewResults.reviews.length,
          tokensUsed: reviewResults.totalTokensUsed,
        });

        // Check if any emails need refinement
        const emailsNeedingRefinement = reviewResults.reviews.filter(
          (review) => review.result === 'NEEDS_IMPROVEMENT'
        );

        if (emailsNeedingRefinement.length > 0) {
          // Emit refining status
          yield {
            status: 'refining' as const,
            message: `Refining ${emailsNeedingRefinement.length} email(s) based on reviewer feedback`,
          };

          // Prepare emails for refinement
          const emailsToRefine: Array<{
            emailId: number;
            donorId: number;
            reviewResult: EmailReviewResult;
          }> = [];

          // Get donor IDs for emails that need refinement from the generated emails in session
          const { getGeneratedEmailsBySessionId } = await import('@/app/lib/data/email-campaigns');
          const sessionEmails = await getGeneratedEmailsBySessionId(Number(params.sessionId));

          for (const review of emailsNeedingRefinement) {
            const sessionEmail = sessionEmails.find((email) => email.id === review.emailId);
            if (sessionEmail) {
              emailsToRefine.push({
                emailId: review.emailId,
                donorId: sessionEmail.donorId,
                reviewResult: review,
              });
            } else {
              logger.error(
                '[generateSmartEmailsForCampaignStream] Could not find email in session',
                {
                  emailId: review.emailId,
                  sessionId: params.sessionId,
                }
              );
            }
          }

          // Perform refinement
          const refinementResults = await this.emailRefinementService.refineEmails({
            organizationId: params.organizationId,
            sessionId: params.sessionId,
            chatHistory: params.chatHistory,
            emailsToRefine,
          });

          logger.info('[generateSmartEmailsForCampaignStream] Refinement completed', {
            refinementCount: refinementResults.results.length,
            successfulRefinements: refinementResults.results.filter((r) => r.success).length,
            tokensUsed: refinementResults.totalTokensUsed,
          });

          // Update the total tokens used to include refinement
          const refinementTokensUsed = refinementResults.totalTokensUsed;
          const updatedTotalTokensUsed = totalTokensUsed + refinementTokensUsed;

          // After refinement, fetch updated emails from database and emit results
          const updatedResults = await this.buildResultsFromDatabase(params.sessionId, results);
          yield {
            status: 'refined' as const,
            result: { results: updatedResults, totalTokensUsed: updatedTotalTokensUsed },
          };
        } else {
          // No refinement needed - still fetch from database to ensure consistency
          const dbResults = await this.buildResultsFromDatabase(params.sessionId, results);
          yield {
            status: 'refined' as const,
            result: { results: dbResults, totalTokensUsed },
          };
        }
      } else {
        // No review performed - still fetch from database to ensure consistency
        const dbResults = await this.buildResultsFromDatabase(params.sessionId, results);
        yield {
          status: 'refined' as const,
          result: { results: dbResults, totalTokensUsed },
        };
      }
    } catch (error) {
      logger.error('[generateSmartEmailsForCampaignStream] Error during generation', { error });
      throw error;
    }
  }

  /**
   * Generate a smart email for a single donor with all logic contained within
   */
  private async generateSmartEmailForDonor(params: {
    donor: any;
    organization: any;
    staffMembers: any[];
    sessionId: string;
    userId: string;
    currentDate: string;
    chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  }): Promise<SmartEmailGenerationResult> {
    try {
      const { donor, organization, staffMembers, sessionId, userId, currentDate, chatHistory } =
        params;

      // Get assigned staff if exists
      const assignedStaff = donor.assignedToStaffId
        ? staffMembers.find((s) => s.id === donor.assignedToStaffId)
        : null;

      // Fetch donor-specific data
      const [communicationHistory, donationHistory, donorStats, researchResults, memories] =
        await Promise.all([
          this.getCommunicationHistory(donor.id, organization.id),
          this.getDonationHistory(donor.id, organization.id),
          this.getDonorStats(donor.id, organization.id),
          this.getPersonResearch(donor.id, organization.id),
          this.getMemories(organization.id, assignedStaff?.userId || userId),
        ]);

      // Generate the email using the pure function
      const emailParams: SingleEmailGeneratorParams = {
        donor: {
          id: donor.id,
          firstName: donor.firstName,
          lastName: donor.lastName,
          email: donor.email,
          notes: donor.notes,
          assignedUserId: assignedStaff?.userId,
        },
        organization: {
          id: organization.id,
          name: organization.name,
          description: organization.description,
          websiteSummary: organization.websiteSummary,
          writingInstructions: organization.writingInstructions,
          featureFlags: organization.featureFlags,
        },
        staffMembers,
        donorHistory: {
          communications: communicationHistory,
          donations: donationHistory,
          statistics: donorStats,
          personResearch: researchResults,
        },
        chatHistory,
        currentDate,
        memories,
      };

      const result = await generateSingleEmail(emailParams);

      // Save the generated email
      // For backward compatibility, convert plain text to structured content
      const structuredContent = [
        {
          piece: result.content,
          references: [],
          addNewlineAfter: true,
        },
      ];

      await this.saveGeneratedEmail({
        sessionId: Number(sessionId),
        donorId: donor.id,
        subject: result.subject,
        emailContent: result.content,
        reasoning: result.reasoning,
        response: result.response,
        structuredContent,
        referenceContexts: {},
      });

      return {
        donor,
        email: {
          subject: result.subject,
          content: result.content,
          reasoning: result.reasoning,
          response: result.response,
        },
        tokensUsed: result.tokensUsed,
      };
    } catch (error) {
      console.error(`Failed to generate email for donor ${params.donor.id}:`, error);
      return {
        donor: params.donor,
        email: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Helper methods for data fetching
  private async getOrganization(organizationId: string) {
    return await getOrganizationById(organizationId);
  }

  private async getSession(sessionId: string, organizationId: string) {
    const session = await getEmailGenerationSessionById(Number(sessionId), organizationId);
    if (!session) {
      return null;
    }
    return session;
  }

  private async getStaffMembers(organizationId: string) {
    return await getAllStaffByOrganization(organizationId);
  }

  private async getDonorsWithStaffAssignments(organizationId: string, donorIds?: number[]) {
    if (donorIds && donorIds.length > 0) {
      // Get specific donors
      return await getDonorsByIds(donorIds, organizationId);
    } else {
      // Get all donors in the organization
      return await getAllDonorsByOrganization(organizationId);
    }
  }

  private async getCommunicationHistory(donorId: number, organizationId: string) {
    return await getDonorCommunicationHistory(donorId, { organizationId });
  }

  private async getDonationHistory(donorId: number, organizationId: string) {
    return await getDonorDonationsWithProjects(donorId);
  }

  private async getDonorStats(donorId: number, organizationId: string) {
    return await getComprehensiveDonorStats(donorId, organizationId);
  }

  private async getPersonResearch(donorId: number, organizationId: string) {
    return await getPersonResearchByDonor(donorId, organizationId);
  }

  private async getMemories(organizationId: string, userId: string) {
    const [userMemories, orgMemories] = await Promise.all([
      getUserMemories(userId),
      getOrganizationMemories(organizationId),
    ]);
    return {
      user: userMemories,
      organization: orgMemories,
    };
  }

  private async saveGeneratedEmail(emailData: {
    sessionId: number;
    donorId: number;
    subject: string;
    emailContent: string;
    reasoning: string;
    response: string;
    structuredContent: Array<{
      piece: string;
      references: string[];
      addNewlineAfter: boolean;
    }>;
    referenceContexts: Record<string, string>;
  }) {
    return await saveGeneratedEmailData(emailData);
  }

  private async getEmailBySessionAndDonor(
    sessionId: string,
    donorId: number,
    organizationId: string
  ) {
    return await getEmailBySessionAndDonor(Number(sessionId), donorId);
  }

  // Helper methods for refinement
  private getDonorIdFromEmailId(
    emailId: number,
    results: SmartEmailGenerationResult[]
  ): number | null {
    // For now, we'll need to use a different approach since we don't have a direct mapping
    // This is a limitation - in a real implementation, we'd need to query the database
    // or maintain a mapping of email IDs to donor IDs
    // For now, return null and let the filter handle it
    return null;
  }

  private getDonorIdFromResult(result: SmartEmailGenerationResult): number {
    return result.donor.id;
  }

  /**
   * Helper method to fetch emails from database and merge with results
   * This ensures frontend gets the latest email content including any refinements
   */
  private async buildResultsFromDatabase(
    sessionId: string,
    originalResults: SmartEmailGenerationResult[]
  ): Promise<SmartEmailGenerationResult[]> {
    try {
      const { getGeneratedEmailsBySessionId } = await import('@/app/lib/data/email-campaigns');
      const emailsFromDb = await getGeneratedEmailsBySessionId(Number(sessionId));

      // Build results from the database emails to ensure we have the latest content
      return originalResults.map((originalResult) => {
        const dbEmail = emailsFromDb.find((email) => email.donorId === originalResult.donor.id);
        if (dbEmail) {
          return {
            ...originalResult,
            email: {
              subject: dbEmail.subject,
              content: dbEmail.emailContent || '',
              reasoning: dbEmail.reasoning || originalResult.email?.reasoning || '',
              response: dbEmail.response || originalResult.email?.response || '',
            },
          };
        }
        return originalResult;
      });
    } catch (error) {
      logger.error('[buildResultsFromDatabase] Failed to fetch emails from database', {
        sessionId,
        error,
      });
      // Return original results as fallback
      return originalResults;
    }
  }
}
