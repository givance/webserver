import { getDonorCommunicationHistory } from '@/app/lib/data/communications';
import { listDonations } from '@/app/lib/data/donations';
import { getOrganizationMemories, getOrganizationById } from '@/app/lib/data/organizations';
import { getUserMemories } from '@/app/lib/data/users';
import { getDonorsByIds } from '@/app/lib/data/donors';
import { logger } from '@/app/lib/logger';
import { PersonResearchService } from '@/app/lib/services/person-research.service';
import { ErrorHandler } from '@/app/lib/utils/error-handler';
import fs from 'fs/promises';
import path from 'path';
import {
  AgenticEmailGenerationOrchestrator,
  AgenticFlowContext,
  AgenticFlowStep,
} from '../utils/email-generator/agentic-flow';
import { UnifiedSmartEmailGenerationService } from './unified-smart-email-generation.service';

export interface AgenticEmailGenerationInput {
  donors: Array<{
    id: number;
    firstName: string;
    lastName: string;
    email: string;
  }>;
  organizationName: string;
  organizationWritingInstructions?: string;
  currentDate?: string;
}

export interface AgenticFlowState {
  sessionId: string;
  context: AgenticFlowContext;
  steps: AgenticFlowStep[];
  isComplete: boolean;
  needsUserInput: boolean;
  finalPrompt?: string;
}

export interface AgenticConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  stepType?: AgenticFlowStep['type'];
}

/**
 * Agentic Email Generation Service
 * Manages the iterative conversation flow for email generation
 */
export class AgenticEmailGenerationService {
  private orchestrator: AgenticEmailGenerationOrchestrator;
  private unifiedEmailService: UnifiedSmartEmailGenerationService;
  private activeSessions: Map<string, AgenticFlowState> = new Map();

  constructor() {
    this.orchestrator = new AgenticEmailGenerationOrchestrator();
    this.unifiedEmailService = new UnifiedSmartEmailGenerationService();
  }

  /**
   * Starts a new agentic email generation session
   */
  async startAgenticFlow(
    input: AgenticEmailGenerationInput,
    organizationId: string,
    userId: string
  ): Promise<{
    sessionId: string;
    needsUserInput: boolean;
    isComplete: boolean;
    conversation: AgenticConversationMessage[];
    canProceed?: boolean;
  }> {
    // Generate unique session ID
    const sessionId = this.generateSessionId();

    logger.info(`[AGENTIC SERVICE] Starting agentic email generation flow`);
    logger.info(
      `[AGENTIC SERVICE] Organization: ${organizationId}, User: ${userId}, Session: ${sessionId}`
    );
    logger.info(`[AGENTIC SERVICE] Donors count: ${input.donors.length}`);
    logger.info(
      `[AGENTIC SERVICE] Has writing instructions: ${!!input.organizationWritingInstructions}`
    );

    try {
      // Build minimal context for now
      const context = await this.buildMinimalContext(input, organizationId, userId);
      logger.info(`[AGENTIC SERVICE] Context built successfully`);
      logger.info(`[AGENTIC SERVICE] Best practices length: ${context.bestPractices.length} chars`);
      logger.info(`[AGENTIC SERVICE] User memories: ${context.userMemories.length}`);
      logger.info(
        `[AGENTIC SERVICE] Organization memories: ${context.organizationMemories.length}`
      );

      // Start the agentic flow
      const result = await this.orchestrator.startFlow(context);

      // Store the session state
      const flowState: AgenticFlowState = {
        sessionId,
        context,
        steps: result.steps,
        isComplete: result.isComplete,
        needsUserInput: result.needsUserInput,
        finalPrompt: result.finalPrompt,
      };

      this.activeSessions.set(sessionId, flowState);

      // Convert steps to conversation messages
      const conversation = this.convertStepsToMessages(result.steps);

      logger.info(`[AGENTIC SERVICE] Flow started successfully`);
      logger.info(`[AGENTIC SERVICE] Session: ${sessionId}`);
      logger.info(`[AGENTIC SERVICE] Needs user input: ${result.needsUserInput}`);
      logger.info(`[AGENTIC SERVICE] Is complete: ${result.isComplete}`);
      logger.info(`[AGENTIC SERVICE] Steps generated: ${result.steps.length}`);
      logger.info(`[AGENTIC SERVICE] Conversation messages: ${conversation.length}`);

      return {
        sessionId,
        needsUserInput: result.needsUserInput,
        isComplete: result.isComplete,
        conversation,
        canProceed: result.steps[result.steps.length - 1]?.canProceed,
      };
    } catch (error) {
      logger.error(`[AGENTIC SERVICE ERROR] Failed to start agentic flow`);
      logger.error(`[AGENTIC SERVICE ERROR] Session: ${sessionId}`);
      logger.error(
        `[AGENTIC SERVICE ERROR] Error: ${error instanceof Error ? error.message : String(error)}`
      );
      throw ErrorHandler.createError(
        'INTERNAL_SERVER_ERROR',
        'Failed to start agentic email generation flow',
        { operation: 'startAgenticFlow', organizationId, userId },
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Continues an existing agentic conversation
   */
  async continueAgenticFlow(
    sessionId: string,
    userResponse: string
  ): Promise<{
    needsUserInput: boolean;
    isComplete: boolean;
    conversation: AgenticConversationMessage[];
    canProceed?: boolean;
  }> {
    logger.info(`[AGENTIC SERVICE] Continuing agentic flow`);
    logger.info(`[AGENTIC SERVICE] Session: ${sessionId}`);
    logger.info(`[AGENTIC SERVICE] User response: ${userResponse}`);

    const flowState = this.activeSessions.get(sessionId);
    if (!flowState) {
      logger.error(`[AGENTIC SERVICE ERROR] Session not found: ${sessionId}`);
      throw new Error('Session not found or expired');
    }

    logger.info(`[AGENTIC SERVICE] Session found - previous steps: ${flowState.steps.length}`);

    try {
      // Continue the conversation
      const result = await this.orchestrator.continueFlow(
        flowState.context,
        userResponse,
        flowState.steps
      );

      // Update session state
      flowState.steps = result.steps;
      flowState.isComplete = result.isComplete;
      flowState.needsUserInput = result.needsUserInput;
      flowState.finalPrompt = result.finalPrompt;

      // Convert steps to conversation messages
      const conversation = this.convertStepsToMessages(result.steps);

      logger.info(`[AGENTIC SERVICE] Flow continued successfully`);
      logger.info(`[AGENTIC SERVICE] Needs user input: ${result.needsUserInput}`);
      logger.info(`[AGENTIC SERVICE] Is complete: ${result.isComplete}`);
      logger.info(`[AGENTIC SERVICE] Total steps: ${result.steps.length}`);
      logger.info(`[AGENTIC SERVICE] Conversation messages: ${conversation.length}`);

      return {
        needsUserInput: result.needsUserInput,
        isComplete: result.isComplete,
        conversation,
        canProceed: result.steps[result.steps.length - 1]?.canProceed,
      };
    } catch (error) {
      logger.error(`[AGENTIC SERVICE ERROR] Failed to continue agentic flow`);
      logger.error(`[AGENTIC SERVICE ERROR] Session: ${sessionId}`);
      logger.error(
        `[AGENTIC SERVICE ERROR] Error: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new Error('Failed to continue agentic flow');
    }
  }

  /**
   * Generates the final prompt for user confirmation
   */
  async generateFinalPrompt(sessionId: string): Promise<{
    finalPrompt: string;
    summary: string;
    estimatedComplexity: 'low' | 'medium' | 'high';
  }> {
    logger.info(`[AGENTIC SERVICE] Generating final prompt`);
    logger.info(`[AGENTIC SERVICE] Session: ${sessionId}`);

    const flowState = this.activeSessions.get(sessionId);
    if (!flowState) {
      logger.error(`[AGENTIC SERVICE ERROR] Session not found for final prompt: ${sessionId}`);
      throw new Error('Session not found or expired');
    }

    logger.info(`[AGENTIC SERVICE] Session found - steps to process: ${flowState.steps.length}`);

    try {
      const result = await this.orchestrator.generateFinalPrompt(
        flowState.context,
        flowState.steps
      );

      // Update the session with the final prompt
      flowState.finalPrompt = result.finalPrompt;

      logger.info(`[AGENTIC SERVICE] Final prompt generated successfully`);
      logger.info(`[AGENTIC SERVICE] Final prompt length: ${result.finalPrompt.length} chars`);
      logger.info(`[AGENTIC SERVICE] Summary length: ${result.summary.length} chars`);
      logger.info(`[AGENTIC SERVICE] Estimated complexity: ${result.estimatedComplexity}`);

      return result;
    } catch (error) {
      logger.error(`[AGENTIC SERVICE ERROR] Failed to generate final prompt`);
      logger.error(`[AGENTIC SERVICE ERROR] Session: ${sessionId}`);
      logger.error(
        `[AGENTIC SERVICE ERROR] Error: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new Error('Failed to generate final prompt');
    }
  }

  /**
   * Executes the final email generation based on the confirmed prompt
   */
  async executeEmailGeneration(sessionId: string, confirmedPrompt: string): Promise<any> {
    logger.info(`[AGENTIC SERVICE] Executing email generation for session: ${sessionId}`);

    const flowState = this.activeSessions.get(sessionId);
    if (!flowState) {
      logger.error(`[AGENTIC SERVICE ERROR] Session not found: ${sessionId}`);
      throw new Error('Session not found or expired');
    }

    logger.info(`[AGENTIC SERVICE] Session found - donors: ${flowState.context.donors.length}`);

    try {
      // Use the unified email generation service directly
      logger.info(`[AGENTIC SERVICE] Calling unified email generation service`);

      // Convert the donor format for the unified service
      const donorIds = flowState.context.donors.map((d) => String(d.id));

      // Build chat history from the final prompt
      const chatHistory = [
        {
          role: 'user' as const,
          content: confirmedPrompt,
        },
      ];

      const result = await this.unifiedEmailService.generateSmartEmailsForCampaign({
        organizationId: flowState.context.organization?.id || '',
        sessionId: sessionId, // Use the same sessionId
        chatHistory,
        donorIds,
      });

      // Clean up the session
      this.activeSessions.delete(sessionId);

      logger.info(`[AGENTIC SERVICE] Email generation completed successfully`);
      logger.info(`[AGENTIC SERVICE] Session cleaned up: ${sessionId}`);
      logger.info(`[AGENTIC SERVICE] Generated emails count: ${result.results?.length || 0}`);

      // Convert the result format to match expected output
      const emails = result.results
        .filter((r) => r.email !== null)
        .map((r) => ({
          donorId: r.donor.id,
          subject: r.email!.subject,
          emailContent: r.email!.content,
          reasoning: r.email!.reasoning,
          response: r.email!.response,
          structuredContent: [
            {
              piece: r.email!.content,
              references: ['email-content'],
              addNewlineAfter: false,
            },
          ],
          referenceContexts: { 'email-content': 'Generated email content' },
          tokenUsage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: r.tokensUsed || 0,
          },
        }));

      return {
        emails,
        sessionId: parseInt(sessionId), // Convert back to number if needed
        tokensUsed: result.totalTokensUsed,
      };
    } catch (error) {
      logger.error(`[AGENTIC SERVICE ERROR] Failed to execute email generation`);
      logger.error(`[AGENTIC SERVICE ERROR] Session: ${sessionId}`);
      logger.error(
        `[AGENTIC SERVICE ERROR] Error: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new Error('Failed to execute email generation');
    }
  }

  /**
   * Gets the current state of an agentic session
   */
  getSessionState(sessionId: string): AgenticFlowState | null {
    return this.activeSessions.get(sessionId) || null;
  }

  /**
   * Builds a complete context for the agentic flow (with real data like generateBulkEmails.ts)
   */
  private async buildMinimalContext(
    input: AgenticEmailGenerationInput,
    organizationId: string,
    userId: string
  ): Promise<AgenticFlowContext> {
    logger.info(`Building complete agentic context for ${input.donors.length} donors`);

    // Load best practices from file
    const bestPractices = await this.loadBestPractices();

    // Get organization data
    const organization = await getOrganizationById(organizationId);

    // Get full donor data from database
    const donorIds = input.donors.map((d) => d.id);
    const fullDonorData = await getDonorsByIds(donorIds, organizationId);

    // Convert to DonorInfo format including notes
    const donorInfos = fullDonorData.map((donor) => ({
      id: donor.id,
      email: donor.email,
      notes: donor.notes,
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
      firstName: donor.firstName,
      lastName: donor.lastName,
    }));

    // Fetch donor histories (same as generateBulkEmails.ts)

    logger.info(`Fetching communication and donation histories for ${donorInfos.length} donors`);

    const donorHistoriesPromises = donorInfos.map(async (donor) => {
      const [communicationHistory, donationHistory] = await Promise.all([
        getDonorCommunicationHistory(donor.id, { organizationId }),
        listDonations({
          donorId: donor.id,
          limit: 50,
          orderBy: 'date',
          orderDirection: 'desc',
          includeProject: true,
        }),
      ]);

      return {
        donor,
        communicationHistory: communicationHistory.map((thread) => ({
          content: thread.content?.map((message) => ({ content: message.content })) || [],
        })),
        donationHistory: donationHistory.donations,
      };
    });

    const donorHistories = await Promise.all(donorHistoriesPromises);

    // Get organization and user memories

    const [organizationMemories, userMemories] = await Promise.all([
      getOrganizationMemories(organizationId),
      getUserMemories(userId),
    ]);

    // Fetch person research results for donors (same as generateBulkEmails.ts)
    logger.info(`Fetching person research results for ${donorIds.length} donors`);
    const personResearchService = new PersonResearchService();
    const personResearchResults: Record<number, any> = {};

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

    // Convert donor histories to the required format
    const donationHistoriesMap: Record<number, any[]> = {};
    donorHistories.forEach(({ donor, donationHistory }) => {
      donationHistoriesMap[donor.id] = donationHistory;
    });

    // Convert organization to the email generator format
    const emailGeneratorOrg = organization
      ? {
          ...organization,
          rawWebsiteSummary: organization.websiteSummary,
        }
      : null;

    const context: AgenticFlowContext = {
      userInstruction: '',
      donors: donorInfos,
      organizationName: input.organizationName,
      organization: emailGeneratorOrg,
      organizationWritingInstructions: input.organizationWritingInstructions,
      donationHistories: donationHistoriesMap,
      personResearchResults,
      bestPractices,
      userMemories,
      organizationMemories,
      currentDate: input.currentDate,
    };

    logger.info(`Complete agentic context built successfully`);
    logger.info(`- Donors: ${donorInfos.length}`);
    logger.info(`- Donation histories: ${Object.keys(donationHistoriesMap).length}`);
    logger.info(`- Person research results: ${Object.keys(personResearchResults).length}`);
    logger.info(`- User memories: ${userMemories.length}`);
    logger.info(`- Organization memories: ${organizationMemories.length}`);

    return context;
  }

  /**
   * Loads best practices from the markdown file
   */
  private async loadBestPractices(): Promise<string> {
    try {
      const bestPracticesPath = path.join(process.cwd(), 'src', 'data', 'best_practice.md');
      const bestPractices = await fs.readFile(bestPracticesPath, 'utf-8');
      return bestPractices;
    } catch (error) {
      logger.error(`Error loading best practices: ${error}`);
      return 'Best practices file not found. Please follow general email best practices.';
    }
  }

  /**
   * Converts flow steps to conversation messages
   */
  private convertStepsToMessages(steps: AgenticFlowStep[]): AgenticConversationMessage[] {
    const messages: AgenticConversationMessage[] = [];

    steps.forEach((step, index) => {
      messages.push({
        role: 'assistant',
        content: step.content,
        timestamp: new Date(),
        stepType: step.type,
      });

      // Add questions as separate messages if they exist
      if (step.questions && step.questions.length > 0) {
        step.questions.forEach((question) => {
          messages.push({
            role: 'assistant',
            content: question,
            timestamp: new Date(),
            stepType: 'question',
          });
        });
      }
    });

    return messages;
  }

  /**
   * Generates a unique session ID
   */
  private generateSessionId(): string {
    return `agentic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleans up expired sessions (call periodically)
   */
  public cleanupExpiredSessions(maxAgeMinutes: number = 60): void {
    const cutoffTime = Date.now() - maxAgeMinutes * 60 * 1000;

    for (const [sessionId, state] of this.activeSessions.entries()) {
      // Sessions don't have timestamps yet, but we could add them
      // For now, just clean up completed sessions
      if (state.isComplete) {
        this.activeSessions.delete(sessionId);
      }
    }
  }
}
