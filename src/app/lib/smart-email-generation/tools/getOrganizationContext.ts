import { getOrganizationById, getOrganizationMemories } from '@/app/lib/data/organizations';
import { getUserById, getUserMemories } from '@/app/lib/data/users';
import { getStaffByEmail } from '@/app/lib/data/staff';
import { logger } from '@/app/lib/logger';
import { ErrorHandler } from '@/app/lib/utils/error-handler';
import { z } from 'zod';

// Input schema for the tool
export const GetOrganizationContextInputSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  userId: z.string().min(1, 'User ID is required'),
});

export type GetOrganizationContextInput = z.infer<typeof GetOrganizationContextInputSchema>;

// Output interface
export interface GetOrganizationContextOutput {
  organization: {
    id: string;
    name: string;
    description: string | null;
    shortDescription: string | null;
    websiteUrl: string | null;
    websiteSummary: string | null;
    writingInstructions: string | null;
    donorJourneyText: string | null;
    memories: string[];

    // Calculated insights
    keyTopics: string[];
    writingStyle: string;
    brandTone: string;
  };

  userContext: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    fullName: string;
    emailSignature: string | null;
    memories: string[];

    // Staff information (if applicable)
    staff?: {
      id: number;
      firstName: string | null;
      lastName: string | null;
      writingInstructions: string | null;
      position: string | null;
      personalizedSignature: string | null;
    };

    // Calculated insights
    preferredStyle: string;
    personalTouch: string[];
  };

  // Combined context analysis
  contextAnalysis: {
    recommendedTone: string;
    keyMessagingPoints: string[];
    writingGuidelines: string[];
    personalizationOpportunities: string[];
  };
}

/**
 * AI Agent Tool: Get Organization Context
 *
 * This tool retrieves comprehensive organizational and user context including:
 * - Organization details, mission, and brand voice
 * - Writing instructions and style guidelines
 * - Website summary and key messaging
 * - Organizational memories and insights
 * - User/staff information and preferences
 * - Personal writing style and signature
 * - Combined context analysis for email generation
 */
export class GetOrganizationContextTool {
  /**
   * Execute the tool to get organization and user context
   */
  async execute(input: GetOrganizationContextInput): Promise<GetOrganizationContextOutput> {
    try {
      // Validate input
      const validatedInput = GetOrganizationContextInputSchema.parse(input);

      logger.info(
        `[GetOrganizationContextTool] Fetching context for org ${validatedInput.organizationId} and user ${validatedInput.userId}`
      );

      // Fetch organization data
      const [organization, orgMemories] = await Promise.all([
        getOrganizationById(validatedInput.organizationId),
        getOrganizationMemories(validatedInput.organizationId),
      ]);

      if (!organization) {
        throw ErrorHandler.createError(
          'NOT_FOUND',
          `Organization ${validatedInput.organizationId} not found`
        );
      }

      // Fetch user data
      const [user, userMemories] = await Promise.all([
        getUserById(validatedInput.userId),
        getUserMemories(validatedInput.userId),
      ]);

      if (!user) {
        throw ErrorHandler.createError('NOT_FOUND', `User ${validatedInput.userId} not found`);
      }

      // Fetch staff information (if user is staff)
      let staffInfo = undefined;
      try {
        const staff = await getStaffByEmail(user.email, validatedInput.organizationId);
        if (staff) {
          staffInfo = {
            id: staff.id,
            firstName: staff.firstName || null,
            lastName: staff.lastName || null,
            writingInstructions: staff.writingInstructions,
            position: null, // staff table doesn't have position field
            personalizedSignature: staff.signature,
          };
        }
      } catch (error) {
        // Staff not found - user might not be staff, which is okay
        logger.info(
          `[GetOrganizationContextTool] No staff record found for user ${validatedInput.userId}`
        );
      }

      // Analyze organization context
      const orgAnalysis = this.analyzeOrganizationContext(organization, orgMemories);

      // Analyze user context
      const userAnalysis = this.analyzeUserContext(user, userMemories, staffInfo);

      // Generate combined context analysis
      const contextAnalysis = this.generateContextAnalysis(
        organization,
        user,
        staffInfo,
        orgMemories,
        userMemories
      );

      const result: GetOrganizationContextOutput = {
        organization: {
          id: organization.id,
          name: organization.name,
          description: organization.description,
          shortDescription: organization.shortDescription,
          websiteUrl: organization.websiteUrl,
          websiteSummary: organization.websiteSummary,
          writingInstructions: organization.writingInstructions,
          donorJourneyText: organization.donorJourneyText,
          memories: orgMemories,
          keyTopics: orgAnalysis.keyTopics,
          writingStyle: orgAnalysis.writingStyle,
          brandTone: orgAnalysis.brandTone,
        },
        userContext: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          fullName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
          emailSignature: user.emailSignature,
          memories: userMemories,
          staff: staffInfo,
          preferredStyle: userAnalysis.preferredStyle,
          personalTouch: userAnalysis.personalTouch,
        },
        contextAnalysis,
      };

      logger.info(
        `[GetOrganizationContextTool] Successfully retrieved context for ${organization.name}`
      );
      return result;
    } catch (error) {
      logger.error('[GetOrganizationContextTool] Failed to get organization context:', error);
      throw error;
    }
  }

  /**
   * Analyze organization context to extract key insights
   */
  private analyzeOrganizationContext(
    organization: any,
    memories: string[]
  ): { keyTopics: string[]; writingStyle: string; brandTone: string } {
    const keyTopics: string[] = [];
    let writingStyle = 'Professional and warm';
    let brandTone = 'Compassionate and inspiring';

    // Extract key topics from description and memories
    const allText = [
      organization.description || '',
      organization.shortDescription || '',
      organization.websiteSummary || '',
      organization.donorJourneyText || '',
      ...memories,
    ]
      .join(' ')
      .toLowerCase();

    // Look for common nonprofit themes
    if (
      allText.includes('education') ||
      allText.includes('school') ||
      allText.includes('student')
    ) {
      keyTopics.push('Education');
    }
    if (allText.includes('health') || allText.includes('medical') || allText.includes('hospital')) {
      keyTopics.push('Healthcare');
    }
    if (
      allText.includes('environment') ||
      allText.includes('climate') ||
      allText.includes('conservation')
    ) {
      keyTopics.push('Environment');
    }
    if (
      allText.includes('poverty') ||
      allText.includes('homeless') ||
      allText.includes('housing')
    ) {
      keyTopics.push('Social Services');
    }
    if (allText.includes('animal') || allText.includes('rescue') || allText.includes('shelter')) {
      keyTopics.push('Animal Welfare');
    }
    if (allText.includes('arts') || allText.includes('culture') || allText.includes('museum')) {
      keyTopics.push('Arts & Culture');
    }
    if (
      allText.includes('research') ||
      allText.includes('innovation') ||
      allText.includes('science')
    ) {
      keyTopics.push('Research & Innovation');
    }

    // Analyze writing style from instructions
    const writingInstructions = organization.writingInstructions || '';
    if (writingInstructions.includes('formal')) {
      writingStyle = 'Formal and professional';
    } else if (writingInstructions.includes('casual') || writingInstructions.includes('friendly')) {
      writingStyle = 'Casual and friendly';
    } else if (writingInstructions.includes('personal') || writingInstructions.includes('warm')) {
      writingStyle = 'Personal and warm';
    }

    // Analyze brand tone
    if (allText.includes('urgent') || allText.includes('crisis') || allText.includes('emergency')) {
      brandTone = 'Urgent and compelling';
    } else if (
      allText.includes('hope') ||
      allText.includes('inspiring') ||
      allText.includes('uplifting')
    ) {
      brandTone = 'Hopeful and inspiring';
    } else if (
      allText.includes('professional') ||
      allText.includes('expertise') ||
      allText.includes('research')
    ) {
      brandTone = 'Professional and authoritative';
    }

    return { keyTopics, writingStyle, brandTone };
  }

  /**
   * Analyze user context to extract personal preferences
   */
  private analyzeUserContext(
    user: any,
    memories: string[],
    staffInfo: any
  ): { preferredStyle: string; personalTouch: string[] } {
    let preferredStyle = 'Professional and approachable';
    const personalTouch: string[] = [];

    // Check staff writing instructions
    if (staffInfo?.writingInstructions) {
      const instructions = staffInfo.writingInstructions.toLowerCase();
      if (instructions.includes('formal')) {
        preferredStyle = 'Formal and structured';
      } else if (instructions.includes('casual') || instructions.includes('conversational')) {
        preferredStyle = 'Casual and conversational';
      } else if (instructions.includes('personal') || instructions.includes('storytelling')) {
        preferredStyle = 'Personal and story-driven';
      }
    }

    // Extract personal touches from memories
    for (const memory of memories) {
      const memoryLower = memory.toLowerCase();
      if (memoryLower.includes('story') || memoryLower.includes('experience')) {
        personalTouch.push('Uses personal stories');
      }
      if (memoryLower.includes('data') || memoryLower.includes('statistics')) {
        personalTouch.push('Includes data and statistics');
      }
      if (memoryLower.includes('question') || memoryLower.includes('ask')) {
        personalTouch.push('Asks engaging questions');
      }
      if (memoryLower.includes('gratitude') || memoryLower.includes('thank')) {
        personalTouch.push('Emphasizes gratitude');
      }
    }

    // Add staff position context
    if (staffInfo?.position) {
      personalTouch.push(`Writes as ${staffInfo.position}`);
    }

    return { preferredStyle, personalTouch: [...new Set(personalTouch)] };
  }

  /**
   * Generate combined context analysis
   */
  private generateContextAnalysis(
    organization: any,
    user: any,
    staffInfo: any,
    orgMemories: string[],
    userMemories: string[]
  ): {
    recommendedTone: string;
    keyMessagingPoints: string[];
    writingGuidelines: string[];
    personalizationOpportunities: string[];
  } {
    const keyMessagingPoints: string[] = [];
    const writingGuidelines: string[] = [];
    const personalizationOpportunities: string[] = [];

    // Determine recommended tone
    const orgInstructions = organization.writingInstructions || '';
    const staffInstructions = staffInfo?.writingInstructions || '';

    let recommendedTone = 'Warm and professional';
    if (staffInstructions.includes('formal') || orgInstructions.includes('formal')) {
      recommendedTone = 'Formal and respectful';
    } else if (staffInstructions.includes('casual') || orgInstructions.includes('casual')) {
      recommendedTone = 'Friendly and conversational';
    } else if (staffInstructions.includes('personal') || orgInstructions.includes('personal')) {
      recommendedTone = 'Personal and heartfelt';
    }

    // Extract key messaging points
    if (organization.shortDescription) {
      keyMessagingPoints.push(`Mission: ${organization.shortDescription}`);
    }
    if (organization.websiteSummary) {
      keyMessagingPoints.push('Reference website insights');
    }
    keyMessagingPoints.push('Emphasize donor impact');
    keyMessagingPoints.push('Express genuine gratitude');

    // Generate writing guidelines
    writingGuidelines.push(`Use ${recommendedTone.toLowerCase()} tone throughout`);
    if (orgInstructions) {
      writingGuidelines.push('Follow organizational writing guidelines');
    }
    if (staffInstructions) {
      writingGuidelines.push('Incorporate personal writing style');
    }
    writingGuidelines.push('Keep emails concise and actionable');
    writingGuidelines.push('Use specific examples and stories when possible');

    // Identify personalization opportunities
    if (user.firstName && user.lastName) {
      personalizationOpportunities.push(`Sign as ${user.firstName} ${user.lastName}`);
    }
    if (staffInfo?.position) {
      personalizationOpportunities.push(`Reference role as ${staffInfo.position}`);
    }
    if (userMemories.length > 0) {
      personalizationOpportunities.push('Incorporate personal memories and insights');
    }
    if (orgMemories.length > 0) {
      personalizationOpportunities.push('Reference organizational achievements and stories');
    }
    personalizationOpportunities.push('Mention specific donor contributions and impact');

    return {
      recommendedTone,
      keyMessagingPoints,
      writingGuidelines,
      personalizationOpportunities,
    };
  }
}
