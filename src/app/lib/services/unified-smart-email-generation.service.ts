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
} from '@/app/lib/data/email-campaigns';
import { getAllStaffByOrganization } from '@/app/lib/data/staff';
import { getDonorsByIds, getAllDonorsByOrganization } from '@/app/lib/data/donors';
import { getPersonResearchByDonor } from '@/app/lib/data/person-research';
import { getListMembers } from '@/app/lib/data/donor-lists';

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

export class UnifiedSmartEmailGenerationService {
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

    return { results, totalTokensUsed };
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
        },
        staffMembers: staffMembers.map((s) => ({
          id: s.id,
          userId: s.userId,
          writingInstructions: s.writingInstructions,
          firstName: s.firstName,
          lastName: s.lastName,
        })),
        donorHistory: {
          communications: communicationHistory,
          donations: donationHistory,
          statistics: donorStats,
          personResearch: researchResults,
        },
        memories: {
          user: memories.userMemories.split('\n').filter((m) => m.trim()),
          organization: memories.organizationMemories.split('\n').filter((m) => m.trim()),
        },
        chatHistory: chatHistory || [],
        currentDate,
      };

      const emailResult = await generateSingleEmail(emailParams);

      // Save the email to the database
      if (emailResult) {
        await this.saveGeneratedEmail({
          sessionId,
          donorId: donor.id,
          organizationId: organization.id,
          subject: emailResult.subject,
          content: emailResult.content,
          reasoning: emailResult.reasoning,
          response: emailResult.response,
        });
      }

      return {
        donor,
        email: emailResult
          ? {
              subject: emailResult.subject,
              content: emailResult.content,
              reasoning: emailResult.reasoning,
              response: emailResult.response,
            }
          : null,
        tokensUsed: emailResult?.tokensUsed || 0,
      };
    } catch (error) {
      console.error(`Error generating email for donor ${params.donor.id}:`, error);
      return {
        donor: params.donor,
        email: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        tokensUsed: 0,
      };
    }
  }

  /**
   * Helper methods for data fetching
   */
  private async getOrganization(organizationId: string): Promise<any | null> {
    return await getOrganizationById(organizationId);
  }

  private async getSession(sessionId: string, organizationId: string) {
    return await getEmailGenerationSessionById(Number(sessionId), organizationId);
  }

  private async getStaffMembers(organizationId: string): Promise<any[]> {
    return await getAllStaffByOrganization(organizationId);
  }

  private async getDonorsWithStaffAssignments(
    organizationId: string,
    donorIds?: number[]
  ): Promise<any[]> {
    if (donorIds && donorIds.length > 0) {
      return await getDonorsByIds(donorIds, organizationId);
    }
    return await getAllDonorsByOrganization(organizationId);
  }

  private async getCommunicationHistory(donorId: number, organizationId: string) {
    const threads = await getDonorCommunicationHistory(donorId, { organizationId });

    // Format communication history for email generation
    const formattedHistory: any[] = [];
    threads.forEach((thread) => {
      if (thread.content) {
        thread.content.forEach((msg) => {
          formattedHistory.push({
            content: [{ content: msg.content }],
          });
        });
      }
    });

    return formattedHistory;
  }

  private async getDonationHistory(donorId: number, organizationId: string) {
    return await getDonorDonationsWithProjects(donorId);
  }

  private async getDonorStats(donorId: number, organizationId: string) {
    return await getComprehensiveDonorStats(donorId, organizationId);
  }

  private async getPersonResearch(donorId: number, organizationId: string) {
    return await getPersonResearchByDonor(donorId, organizationId, 5);
  }

  private async getMemories(organizationId: string, userId: string) {
    const [userMemories, orgMemories] = await Promise.all([
      getUserMemories(userId),
      getOrganizationMemories(organizationId),
    ]);

    return {
      userMemories: userMemories.join('\n'),
      organizationMemories: orgMemories.join('\n'),
    };
  }

  private async saveGeneratedEmail(params: {
    sessionId: string;
    donorId: number;
    organizationId: string;
    subject: string;
    content: string;
    reasoning: string;
    response: string;
  }) {
    await saveGeneratedEmailData({
      sessionId: Number(params.sessionId),
      donorId: params.donorId,
      subject: params.subject,
      structuredContent: [
        {
          piece: params.content,
          references: ['email-content'],
          addNewlineAfter: false,
        },
      ],
      referenceContexts: { 'email-content': 'Generated email content' },
      emailContent: params.content,
      reasoning: params.reasoning,
      response: params.response,
      status: 'PENDING_APPROVAL',
      isPreview: false, // Default to false for all emails
    });
  }

  /**
   * Method for processing donors from a list
   */
  async generateSmartEmailsForList(params: {
    organizationId: string;
    listId: string;
    sessionId: string;
    chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  }): Promise<{
    results: SmartEmailGenerationResult[];
    totalTokensUsed: number;
  }> {
    // Get donor IDs from the list
    const listDonors = await getListMembers(Number(params.listId));

    const donorIds = listDonors.map((ld) => String(ld.donorId));

    return this.generateSmartEmailsForCampaign({
      organizationId: params.organizationId,
      sessionId: params.sessionId,
      chatHistory: params.chatHistory,
      donorIds,
    });
  }
}
