import { EmailReviewerService } from '@/app/lib/smart-email-generation/services/email-reviewer.service';
import {
  buildSystemPromptForEmailGeneration,
  buildDonorContext,
} from '@/app/lib/smart-email-generation/utils/email-context-builder';
import { logger } from '@/app/lib/logger';
import { getDonorById } from '@/app/lib/data/donors';
import { getOrganizationById } from '@/app/lib/data/organizations';
import { getStaffById } from '@/app/lib/data/staff';
import { getUserById } from '@/app/lib/data/users';
import { getDonorCommunicationHistory } from '@/app/lib/data/communications';
import { getDonorDonationsWithProjects } from '@/app/lib/data/donations';
import { getPersonResearchByDonor } from '@/app/lib/data/person-research';
import { getOrganizationMemories } from '@/app/lib/data/organizations';
import { db } from '@/app/lib/db';
import { generatedEmails, emailGenerationSessions } from '@/app/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';

export interface EmailReviewResult {
  emailId: number;
  result: 'OK' | 'NEEDS_IMPROVEMENT' | 'ERROR';
  feedback?: string;
  tokensUsed: number;
}

export interface ReviewEmailsOutput {
  reviews: EmailReviewResult[];
  totalTokensUsed: number;
}

export class EmailReviewService {
  private emailReviewerService: EmailReviewerService;

  constructor() {
    this.emailReviewerService = new EmailReviewerService();
  }

  async reviewEmails(emailIds: number[], organizationId: string): Promise<ReviewEmailsOutput> {
    logger.info('[EmailReviewService] Starting review for emails', {
      emailCount: emailIds.length,
      organizationId,
    });

    // Fetch organization details
    const organization = await getOrganizationById(organizationId);
    if (!organization) {
      throw new Error('Organization not found');
    }

    // Get organization memories
    const organizationMemories = await getOrganizationMemories(organizationId);

    const reviewResults = await Promise.all(
      emailIds.map((emailId) =>
        this.reviewSingleEmail(emailId, organizationId, organization, organizationMemories)
      )
    );

    const totalTokensUsed = reviewResults.reduce((sum, result) => sum + result.tokensUsed, 0);

    logger.info('[EmailReviewService] Review complete', {
      emailCount: reviewResults.length,
      totalTokensUsed,
    });

    return {
      reviews: reviewResults,
      totalTokensUsed,
    };
  }

  private async reviewSingleEmail(
    emailId: number,
    organizationId: string,
    organization: any,
    organizationMemories: string[]
  ): Promise<EmailReviewResult> {
    try {
      // Fetch email with session data
      const email = await this.getEmailWithSession(emailId, organizationId);
      if (!email) {
        return {
          emailId,
          result: 'ERROR',
          feedback: 'Email not found',
          tokensUsed: 0,
        };
      }

      // Fetch donor details
      const donor = await getDonorById(email.donorId, organizationId);
      if (!donor) {
        return {
          emailId,
          result: 'ERROR',
          feedback: 'Donor not found',
          tokensUsed: 0,
        };
      }

      // Build context
      const { systemPrompt, donorContext } = await this.buildReviewContext(
        email,
        donor,
        organization,
        organizationMemories,
        organizationId
      );

      // Review the email
      const reviewResult = await this.emailReviewerService.reviewEmail({
        systemPrompt,
        donorContext,
        chatHistory: email.session.chatHistory as Array<{
          role: 'user' | 'assistant';
          content: string;
        }>,
        generatedEmail: {
          subject: email.subject,
          content: email.emailContent || '',
        },
      });

      // Log individual review result and feedback
      logger.info(`[EmailReviewService] Email review completed`, {
        emailId: email.id,
        donorId: email.donorId,
        result: reviewResult.result,
        feedback: reviewResult.feedback || 'No feedback provided',
        tokensUsed: reviewResult.tokensUsed,
        subject: email.subject,
      });

      return {
        emailId: email.id,
        result: reviewResult.result,
        feedback: reviewResult.feedback,
        tokensUsed: reviewResult.tokensUsed,
      };
    } catch (error) {
      logger.error('[EmailReviewService] Failed to review email', {
        emailId,
        error,
      });

      return {
        emailId,
        result: 'ERROR',
        feedback: 'Failed to review email',
        tokensUsed: 0,
      };
    }
  }

  private async getEmailWithSession(emailId: number, organizationId: string) {
    const [email] = await db
      .select({
        id: generatedEmails.id,
        subject: generatedEmails.subject,
        emailContent: generatedEmails.emailContent,
        donorId: generatedEmails.donorId,
        session: {
          id: emailGenerationSessions.id,
          userId: emailGenerationSessions.userId,
          chatHistory: emailGenerationSessions.chatHistory,
        },
      })
      .from(generatedEmails)
      .innerJoin(emailGenerationSessions, eq(generatedEmails.sessionId, emailGenerationSessions.id))
      .where(
        and(
          eq(generatedEmails.id, emailId),
          eq(emailGenerationSessions.organizationId, organizationId)
        )
      );

    return email;
  }

  private async buildReviewContext(
    email: any,
    donor: any,
    organization: any,
    organizationMemories: string[],
    organizationId: string
  ) {
    // Fetch staff details if assigned
    let staffName = '';
    let writingInstructions: string | undefined;
    if (donor.assignedToStaffId) {
      const staff = await getStaffById(donor.assignedToStaffId, organizationId);
      if (staff) {
        staffName = `${staff.firstName} ${staff.lastName}`;
        writingInstructions = staff.writingInstructions || undefined;
      }
    }

    // Fetch user memories
    const user = await getUserById(email.session.userId);
    const userMemories = user?.memory || [];

    // Build system prompt
    const systemPrompt = buildSystemPromptForEmailGeneration({
      organizationName: organization.name,
      organizationDescription: organization.description,
      organizationWebsiteSummary: organization.websiteSummary,
      staffName,
      writingInstructions: writingInstructions || organization.writingInstructions || '',
      userMemories,
      organizationMemories,
      currentDate: new Date().toISOString().split('T')[0],
    });

    // Fetch data for donor context
    const [communicationThreads, donations, researchData] = await Promise.all([
      getDonorCommunicationHistory(donor.id, { organizationId }),
      getDonorDonationsWithProjects(donor.id),
      getPersonResearchByDonor(donor.id, organizationId, 5),
    ]);

    // Get latest research
    const research = researchData.length > 0 ? researchData[0] : null;

    // Build donor context
    const donorContext = buildDonorContext({
      donor: {
        id: donor.id,
        firstName: donor.firstName,
        lastName: donor.lastName,
        email: donor.email,
        notes: donor.notes,
      },
      donorHistory: {
        communications: communicationThreads,
        donations,
        personResearch: research ? [research] : undefined,
      },
    });

    return { systemPrompt, donorContext };
  }
}
