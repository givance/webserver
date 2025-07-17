import {
  refineSingleEmail,
  type SingleEmailRefinementParams,
} from '@/app/lib/utils/email-generator/single-email-refiner';
import {
  getComprehensiveDonorStats,
  getDonorDonationsWithProjects,
} from '@/app/lib/data/donations';
import { getUserMemories } from '@/app/lib/data/users';
import { getDonorCommunicationHistory } from '@/app/lib/data/communications';
import { getOrganizationById, getOrganizationMemories } from '@/app/lib/data/organizations';
import {
  saveGeneratedEmail as saveGeneratedEmailData,
  getEmailBySessionAndDonor,
  updateGeneratedEmail,
} from '@/app/lib/data/email-campaigns';
import { getAllStaffByOrganization } from '@/app/lib/data/staff';
import { getDonorsByIds } from '@/app/lib/data/donors';
import { getPersonResearchByDonor } from '@/app/lib/data/person-research';
import { logger } from '@/app/lib/logger';
import type { EmailReviewResult } from './email-review.service';

export interface EmailRefinementParams {
  organizationId: string;
  sessionId: string;
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  emailsToRefine: Array<{
    emailId: number;
    donorId: number;
    reviewResult: EmailReviewResult;
  }>;
}

export interface EmailRefinementResult {
  emailId: number;
  donorId: number;
  success: boolean;
  email?: {
    subject: string;
    content: string;
    reasoning: string;
    response: string;
  };
  error?: string;
  tokensUsed?: number;
}

export interface EmailRefinementServiceResult {
  results: EmailRefinementResult[];
  totalTokensUsed: number;
}

export class EmailRefinementService {
  /**
   * Refine emails that need improvement based on review feedback
   */
  async refineEmails(params: EmailRefinementParams): Promise<EmailRefinementServiceResult> {
    const { organizationId, sessionId, chatHistory, emailsToRefine } = params;

    logger.info('[EmailRefinementService] Starting email refinement', {
      organizationId,
      sessionId,
      emailCount: emailsToRefine.length,
    });

    // 1. Get organization details
    const organization = await getOrganizationById(organizationId);
    if (!organization) {
      throw new Error('Organization not found');
    }

    // 2. Get session details for userId (we need this for memories)
    const session = await this.getSession(sessionId, organizationId);
    if (!session) {
      throw new Error('Session not found');
    }

    // 3. Get staff members
    const staffMembers = await getAllStaffByOrganization(organizationId);

    // 4. Process each email refinement
    const results = await Promise.all(
      emailsToRefine.map((emailToRefine) =>
        this.refineEmailForDonor({
          emailToRefine,
          organization,
          staffMembers,
          sessionId,
          userId: session.userId,
          chatHistory,
          organizationId,
        })
      )
    );

    // Calculate total tokens used
    const totalTokensUsed = results.reduce((sum, result) => sum + (result.tokensUsed || 0), 0);

    logger.info('[EmailRefinementService] Refinement completed', {
      totalResults: results.length,
      successfulRefinements: results.filter((r) => r.success).length,
      totalTokensUsed,
    });

    return { results, totalTokensUsed };
  }

  /**
   * Refine a single email for a donor
   */
  private async refineEmailForDonor(params: {
    emailToRefine: {
      emailId: number;
      donorId: number;
      reviewResult: EmailReviewResult;
    };
    organization: any;
    staffMembers: any[];
    sessionId: string;
    userId: string;
    chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
    organizationId: string;
  }): Promise<EmailRefinementResult> {
    const {
      emailToRefine,
      organization,
      staffMembers,
      sessionId,
      userId,
      chatHistory,
      organizationId,
    } = params;

    try {
      // 1. Get the original email from database using the full generated emails query
      const { getGeneratedEmailsBySessionId } = await import('@/app/lib/data/email-campaigns');
      const sessionEmails = await getGeneratedEmailsBySessionId(Number(sessionId));
      const originalEmail = sessionEmails.find((email) => email.donorId === emailToRefine.donorId);

      if (!originalEmail) {
        return {
          emailId: emailToRefine.emailId,
          donorId: emailToRefine.donorId,
          success: false,
          error: 'Original email not found',
        };
      }

      // 2. Get donor details
      const donorsData = await getDonorsByIds([emailToRefine.donorId], organizationId);
      const donor = donorsData[0];
      if (!donor) {
        return {
          emailId: emailToRefine.emailId,
          donorId: emailToRefine.donorId,
          success: false,
          error: 'Donor not found',
        };
      }

      // 3. Get assigned staff if exists
      const assignedStaff = donor.assignedToStaffId
        ? staffMembers.find((s) => s.id === donor.assignedToStaffId)
        : null;

      // 4. Fetch donor-specific data
      const [communicationHistory, donationHistory, donorStats, researchResults, memories] =
        await Promise.all([
          this.getCommunicationHistory(donor.id, organizationId),
          this.getDonationHistory(donor.id),
          this.getDonorStats(donor.id, organizationId),
          this.getPersonResearch(donor.id, organizationId),
          this.getMemories(organizationId, assignedStaff?.userId || userId),
        ]);

      // 5. Build refinement parameters
      const refinementParams: SingleEmailRefinementParams = {
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
        currentDate: new Date().toISOString(),
        memories,
        existingEmail: {
          subject: originalEmail.subject,
          content: originalEmail.emailContent || '',
          reasoning: originalEmail.reasoning || undefined,
        },
        reviewFeedback: {
          result: 'NEEDS_IMPROVEMENT',
          feedback: emailToRefine.reviewResult.feedback || 'Email needs improvement',
        },
      };

      // 6. Refine the email
      const refinementResult = await refineSingleEmail(refinementParams);

      // 7. Update the email in the database
      const structuredContent = [
        {
          piece: refinementResult.content,
          references: [],
          addNewlineAfter: true,
        },
      ];

      await updateGeneratedEmail(emailToRefine.emailId, {
        subject: refinementResult.subject,
        emailContent: refinementResult.content,
        reasoning: refinementResult.reasoning,
        response: refinementResult.response,
        structuredContent,
      });

      logger.info('[EmailRefinementService] Successfully refined email', {
        emailId: emailToRefine.emailId,
        donorId: emailToRefine.donorId,
        tokensUsed: refinementResult.tokensUsed,
        originalContent: originalEmail.emailContent,
        refinedContent: refinementResult.content,
        subject: refinementResult.subject,
        reasoning: refinementResult.reasoning,
        response: refinementResult.response,
      });

      return {
        emailId: emailToRefine.emailId,
        donorId: emailToRefine.donorId,
        success: true,
        email: {
          subject: refinementResult.subject,
          content: refinementResult.content,
          reasoning: refinementResult.reasoning,
          response: refinementResult.response,
        },
        tokensUsed: refinementResult.tokensUsed,
      };
    } catch (error) {
      logger.error('[EmailRefinementService] Failed to refine email', {
        emailId: emailToRefine.emailId,
        donorId: emailToRefine.donorId,
        error,
      });

      return {
        emailId: emailToRefine.emailId,
        donorId: emailToRefine.donorId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Helper methods for data fetching (similar to unified service)
  private async getSession(sessionId: string, organizationId: string) {
    const { getEmailGenerationSessionById } = await import('@/app/lib/data/email-campaigns');
    const session = await getEmailGenerationSessionById(Number(sessionId), organizationId);
    return session;
  }

  private async getCommunicationHistory(donorId: number, organizationId: string) {
    return await getDonorCommunicationHistory(donorId, { organizationId });
  }

  private async getDonationHistory(donorId: number) {
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
}
