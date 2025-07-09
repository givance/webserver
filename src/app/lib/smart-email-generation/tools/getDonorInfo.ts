import { getDonorsByIds } from '@/app/lib/data/donors';
import { listDonations } from '@/app/lib/data/donations';
import { getDonorCommunicationHistory } from '@/app/lib/data/communications';
import { PersonResearchService } from '@/app/lib/services/person-research.service';
import { DonorStatistics } from '@/app/lib/utils/email-generator/types';
import { logger } from '@/app/lib/logger';
import { ErrorHandler } from '@/app/lib/utils/error-handler';
import { z } from 'zod';

// Input schema for the tool
export const GetDonorInfoInputSchema = z.object({
  donorIds: z.array(z.number()).min(1, 'At least one donor ID is required'),
});

export type GetDonorInfoInput = z.infer<typeof GetDonorInfoInputSchema>;

// Output interface
export interface GetDonorInfoOutput {
  donors: Array<{
    id: number;
    name: string;
    email: string | null;
    firstName: string;
    lastName: string;
    notes: string[];

    // Financial information
    totalDonations: number;
    totalAmount: number; // in cents
    lastDonation: {
      amount: number;
      date: Date;
      projectName?: string;
    } | null;

    // Donation history
    donationHistory: Array<{
      id: number;
      amount: number; // in cents
      date: Date;
      projectName?: string;
      projectId?: number;
    }>;

    // Communication history
    communicationHistory: Array<{
      id: number;
      channel: string;
      excerpt: string;
      date: Date;
      messageCount: number;
    }>;

    // Research data
    personResearch?: {
      answer: string;
      profession?: string;
      location?: string;
      keyInsights: string[];
      sources: number;
    };

    // Calculated statistics
    donorStatistics: {
      totalDonations: number;
      totalAmount: number;
      averageDonation: number;
      lastDonationDate: Date | null;
      firstDonationDate: Date | null;
      monthsSinceLastDonation: number | null;
      isRecurring: boolean;
    };

    // Donor stage and potential
    assignedStaffId?: number | null;
    highPotentialDonor?: boolean | null;
  }>;
}

/**
 * AI Agent Tool: Get Donor Information
 *
 * This tool retrieves comprehensive information about selected donors including:
 * - Basic donor details (name, email, notes)
 * - Complete donation history with amounts and projects
 * - Communication history and previous interactions
 * - Person research data and insights
 * - Calculated statistics and donor metrics
 * - Staff assignments and potential ratings
 */
export class GetDonorInfoTool {
  private personResearchService = new PersonResearchService();

  /**
   * Execute the tool to get donor information
   */
  async execute(input: GetDonorInfoInput, organizationId: string): Promise<GetDonorInfoOutput> {
    try {
      // Validate input
      const validatedInput = GetDonorInfoInputSchema.parse(input);

      logger.info(`[GetDonorInfoTool] Fetching info for ${validatedInput.donorIds.length} donors`);

      // Fetch basic donor data
      const donors = await getDonorsByIds(validatedInput.donorIds, organizationId);

      if (donors.length === 0) {
        logger.warn(
          `[GetDonorInfoTool] No donors found for IDs: ${validatedInput.donorIds.join(', ')}`
        );
        return { donors: [] };
      }

      // Process each donor
      const donorResults = await Promise.all(
        donors.map(async (donor) => {
          try {
            // Get donation history
            const donations = await listDonations(
              { donorId: donor.id, includeDonor: false, includeProject: true },
              organizationId
            );

            // Get communication history
            const communications = await getDonorCommunicationHistory(donor.id, { organizationId });

            // Get person research data
            const researchData = await this.personResearchService.getPersonResearch(
              donor.id,
              organizationId
            );

            // Calculate statistics
            const donorStatistics = this.calculateDonorStatistics(donations.donations);

            // Format donation history
            const donationHistory = donations.donations.map((donation) => ({
              id: donation.id,
              amount: donation.amount,
              date: donation.date,
              projectName: donation.project?.name,
              projectId: donation.project?.id,
            }));

            // Format communication history
            const communicationHistory = communications.slice(0, 5).map((thread) => ({
              id: thread.id,
              channel: thread.channel,
              excerpt:
                thread.content && thread.content.length > 0
                  ? thread.content[0].content.substring(0, 200) + '...'
                  : 'No content',
              date: thread.createdAt,
              messageCount: thread.content?.length || 0,
            }));

            // Format research data
            const personResearch = researchData
              ? {
                  answer: researchData.answer,
                  profession: researchData.personIdentity?.profession,
                  location: researchData.personIdentity?.location,
                  keyInsights: this.extractKeyInsights(researchData.answer),
                  sources: researchData.totalSources || 0,
                }
              : undefined;

            // Format notes
            const notes = donor.notes ? donor.notes.map((note) => note.content) : [];

            return {
              id: donor.id,
              name: `${donor.firstName} ${donor.lastName}`.trim(),
              email: donor.email,
              firstName: donor.firstName,
              lastName: donor.lastName,
              notes,
              totalDonations: donorStatistics.totalDonations,
              totalAmount: donorStatistics.totalAmount,
              lastDonation: donorStatistics.lastDonationDate
                ? {
                    amount:
                      donationHistory.find(
                        (d) => d.date.getTime() === donorStatistics.lastDonationDate?.getTime()
                      )?.amount || 0,
                    date: donorStatistics.lastDonationDate,
                    projectName: donationHistory.find(
                      (d) => d.date.getTime() === donorStatistics.lastDonationDate?.getTime()
                    )?.projectName,
                  }
                : null,
              donationHistory,
              communicationHistory,
              personResearch,
              donorStatistics,
              assignedStaffId: donor.assignedToStaffId,
              highPotentialDonor: donor.highPotentialDonor,
            };
          } catch (error) {
            logger.error(`[GetDonorInfoTool] Error processing donor ${donor.id}:`, error);
            // Return minimal data for failed donors
            return {
              id: donor.id,
              name: `${donor.firstName} ${donor.lastName}`.trim(),
              email: donor.email,
              firstName: donor.firstName,
              lastName: donor.lastName,
              notes: [],
              totalDonations: 0,
              totalAmount: 0,
              lastDonation: null,
              donationHistory: [],
              communicationHistory: [],
              donorStatistics: {
                totalDonations: 0,
                totalAmount: 0,
                averageDonation: 0,
                lastDonationDate: null,
                firstDonationDate: null,
                monthsSinceLastDonation: null,
                isRecurring: false,
              },
              assignedStaffId: donor.assignedToStaffId,
              highPotentialDonor: donor.highPotentialDonor,
            };
          }
        })
      );

      logger.info(`[GetDonorInfoTool] Successfully processed ${donorResults.length} donors`);

      return { donors: donorResults };
    } catch (error) {
      logger.error('[GetDonorInfoTool] Failed to get donor info:', error);
      throw ErrorHandler.createError(
        'INTERNAL_SERVER_ERROR',
        'Failed to retrieve donor information'
      );
    }
  }

  /**
   * Calculate donor statistics from donation history
   */
  private calculateDonorStatistics(donations: any[]): {
    totalDonations: number;
    totalAmount: number;
    averageDonation: number;
    lastDonationDate: Date | null;
    firstDonationDate: Date | null;
    monthsSinceLastDonation: number | null;
    isRecurring: boolean;
  } {
    if (donations.length === 0) {
      return {
        totalDonations: 0,
        totalAmount: 0,
        averageDonation: 0,
        lastDonationDate: null,
        firstDonationDate: null,
        monthsSinceLastDonation: null,
        isRecurring: false,
      };
    }

    const sortedDonations = donations.sort((a, b) => b.date.getTime() - a.date.getTime());
    const totalAmount = donations.reduce((sum, donation) => sum + donation.amount, 0);
    const totalDonations = donations.length;
    const averageDonation = totalAmount / totalDonations;

    const lastDonationDate = sortedDonations[0]?.date || null;
    const firstDonationDate = sortedDonations[sortedDonations.length - 1]?.date || null;

    const monthsSinceLastDonation = lastDonationDate
      ? Math.floor((Date.now() - lastDonationDate.getTime()) / (30 * 24 * 60 * 60 * 1000))
      : null;

    // Simple heuristic: recurring if 3+ donations over 6+ months
    const isRecurring =
      totalDonations >= 3 &&
      firstDonationDate &&
      lastDonationDate &&
      lastDonationDate.getTime() - firstDonationDate.getTime() > 6 * 30 * 24 * 60 * 60 * 1000;

    return {
      totalDonations,
      totalAmount,
      averageDonation,
      lastDonationDate,
      firstDonationDate,
      monthsSinceLastDonation,
      isRecurring,
    };
  }

  /**
   * Extract key insights from research text
   */
  private extractKeyInsights(researchText: string): string[] {
    if (!researchText) return [];

    // Simple insight extraction - look for key phrases
    const insights: string[] = [];
    const text = researchText.toLowerCase();

    // Look for profession mentions
    if (text.includes('ceo') || text.includes('founder') || text.includes('president')) {
      insights.push('Leadership position');
    }
    if (text.includes('doctor') || text.includes('physician') || text.includes('md')) {
      insights.push('Medical professional');
    }
    if (text.includes('lawyer') || text.includes('attorney') || text.includes('legal')) {
      insights.push('Legal professional');
    }
    if (
      text.includes('entrepreneur') ||
      text.includes('startup') ||
      text.includes('business owner')
    ) {
      insights.push('Business owner/entrepreneur');
    }

    // Look for wealth indicators
    if (text.includes('million') || text.includes('wealthy') || text.includes('philanthropist')) {
      insights.push('High net worth individual');
    }

    // Look for community involvement
    if (text.includes('board') || text.includes('trustee') || text.includes('volunteer')) {
      insights.push('Community involvement');
    }

    return insights.slice(0, 5); // Limit to 5 key insights
  }
}
