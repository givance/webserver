import { logger } from "@/app/lib/logger";
import { env } from "@/app/lib/env";
import {
  AgenticEmailGenerationOrchestrator,
  AgenticFlowContext,
  AgenticFlowStep,
  AgenticFlowResult,
} from "../utils/email-generator/agentic-flow";
import { EmailGenerationService, GenerateEmailsInput } from "./email-generation.service";
import fs from "fs/promises";
import path from "path";

export interface AgenticEmailGenerationInput {
  instruction: string;
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
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  stepType?: AgenticFlowStep["type"];
}

/**
 * Agentic Email Generation Service
 * Manages the iterative conversation flow for email generation
 */
export class AgenticEmailGenerationService {
  private orchestrator: AgenticEmailGenerationOrchestrator;
  private emailGenerationService: EmailGenerationService;
  private activeSessions: Map<string, AgenticFlowState> = new Map();

  constructor() {
    this.orchestrator = new AgenticEmailGenerationOrchestrator();
    this.emailGenerationService = new EmailGenerationService();
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
    logger.info(`[AGENTIC SERVICE] Organization: ${organizationId}, User: ${userId}, Session: ${sessionId}`);
    logger.info(`[AGENTIC SERVICE] Instruction: ${input.instruction}`);
    logger.info(`[AGENTIC SERVICE] Donors count: ${input.donors.length}`);
    logger.info(`[AGENTIC SERVICE] Has writing instructions: ${!!input.organizationWritingInstructions}`);

    try {
      // Build minimal context for now
      const context = await this.buildMinimalContext(input, organizationId, userId);
      logger.info(`[AGENTIC SERVICE] Context built successfully`);
      logger.info(`[AGENTIC SERVICE] Best practices length: ${context.bestPractices.length} chars`);
      logger.info(`[AGENTIC SERVICE] User memories: ${context.userMemories.length}`);
      logger.info(`[AGENTIC SERVICE] Organization memories: ${context.organizationMemories.length}`);

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
      logger.error(`[AGENTIC SERVICE ERROR] Error: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error("Failed to start agentic email generation flow");
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
      throw new Error("Session not found or expired");
    }

    logger.info(`[AGENTIC SERVICE] Session found - previous steps: ${flowState.steps.length}`);

    try {
      // Continue the conversation
      const result = await this.orchestrator.continueFlow(flowState.context, userResponse, flowState.steps);

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
      logger.error(`[AGENTIC SERVICE ERROR] Error: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error("Failed to continue agentic flow");
    }
  }

  /**
   * Generates the final prompt for user confirmation
   */
  async generateFinalPrompt(sessionId: string): Promise<{
    finalPrompt: string;
    summary: string;
    estimatedComplexity: "low" | "medium" | "high";
  }> {
    logger.info(`[AGENTIC SERVICE] Generating final prompt`);
    logger.info(`[AGENTIC SERVICE] Session: ${sessionId}`);

    const flowState = this.activeSessions.get(sessionId);
    if (!flowState) {
      logger.error(`[AGENTIC SERVICE ERROR] Session not found for final prompt: ${sessionId}`);
      throw new Error("Session not found or expired");
    }

    logger.info(`[AGENTIC SERVICE] Session found - steps to process: ${flowState.steps.length}`);

    try {
      const result = await this.orchestrator.generateFinalPrompt(flowState.context, flowState.steps);

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
      logger.error(`[AGENTIC SERVICE ERROR] Error: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error("Failed to generate final prompt");
    }
  }

  /**
   * Executes email generation using the confirmed prompt
   */
  async executeEmailGeneration(sessionId: string, confirmedPrompt: string): Promise<any> {
    logger.info(`[AGENTIC SERVICE] Executing email generation`);
    logger.info(`[AGENTIC SERVICE] Session: ${sessionId}`);
    logger.info(`[AGENTIC SERVICE] Confirmed prompt length: ${confirmedPrompt.length} chars`);

    const flowState = this.activeSessions.get(sessionId);
    if (!flowState) {
      logger.error(`[AGENTIC SERVICE ERROR] Session not found for execution: ${sessionId}`);
      throw new Error("Session not found or expired");
    }

    logger.info(`[AGENTIC SERVICE] Session found - donors: ${flowState.context.donors.length}`);

    try {
      // Convert context back to the format expected by the regular email generation service
      const generateEmailsInput: GenerateEmailsInput = {
        instruction: confirmedPrompt,
        donors: flowState.context.donors.map((donor) => ({
          id: donor.id,
          firstName: donor.firstName || "",
          lastName: donor.lastName || "",
          email: donor.email,
        })),
        organizationName: flowState.context.organizationName,
        organizationWritingInstructions: flowState.context.organizationWritingInstructions,
        currentDate: flowState.context.currentDate,
      };

      logger.info(`[AGENTIC SERVICE] Calling traditional email generation service`);

      // Use the regular email generation service
      const result = await this.emailGenerationService.generateSmartEmails(
        generateEmailsInput,
        flowState.context.organization?.id || "",
        "" // userId - we'll need to pass this through the context
      );

      // Clean up the session
      this.activeSessions.delete(sessionId);

      logger.info(`[AGENTIC SERVICE] Email generation completed successfully`);
      logger.info(`[AGENTIC SERVICE] Session cleaned up: ${sessionId}`);
      logger.info(`[AGENTIC SERVICE] Generated emails count: ${result.emails?.length || 0}`);

      return result;
    } catch (error) {
      logger.error(`[AGENTIC SERVICE ERROR] Failed to execute email generation`);
      logger.error(`[AGENTIC SERVICE ERROR] Session: ${sessionId}`);
      logger.error(`[AGENTIC SERVICE ERROR] Error: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error("Failed to execute email generation");
    }
  }

  /**
   * Gets the current state of an agentic session
   */
  getSessionState(sessionId: string): AgenticFlowState | null {
    return this.activeSessions.get(sessionId) || null;
  }

  /**
   * Builds a minimal context for the agentic flow (simplified version)
   */
  private async buildMinimalContext(
    input: AgenticEmailGenerationInput,
    organizationId: string,
    userId: string
  ): Promise<AgenticFlowContext> {
    logger.info(`Building minimal agentic context for ${input.donors.length} donors`);

    // Load best practices from file
    const bestPractices = await this.loadBestPractices();

    // Create minimal donor info
    const donorInfos = input.donors.map((donor) => ({
      id: donor.id,
      email: donor.email,
      firstName: donor.firstName,
      lastName: donor.lastName,
      notes: null,
      displayName: null,
      hisTitle: null,
      hisFirstName: null,
      hisInitial: null,
      hisLastName: null,
      herTitle: null,
      herFirstName: null,
      herInitial: null,
      herLastName: null,
      isCouple: null,
    }));

    const context: AgenticFlowContext = {
      userInstruction: input.instruction,
      donors: donorInfos,
      organizationName: input.organizationName,
      organization: null, // Simplified for now
      organizationWritingInstructions: input.organizationWritingInstructions,
      donationHistories: {}, // Empty for now
      personResearchResults: {}, // Empty for now
      bestPractices,
      userMemories: [], // Empty for now
      organizationMemories: [], // Empty for now
      currentDate: input.currentDate,
    };

    logger.info(`Minimal agentic context built successfully`);

    return context;
  }

  /**
   * Loads best practices from the markdown file
   */
  private async loadBestPractices(): Promise<string> {
    try {
      const bestPracticesPath = path.join(process.cwd(), "src", "data", "best_practice.md");
      const bestPractices = await fs.readFile(bestPracticesPath, "utf-8");
      return bestPractices;
    } catch (error) {
      logger.error(`Error loading best practices: ${error}`);
      return "Best practices file not found. Please follow general email best practices.";
    }
  }

  /**
   * Converts flow steps to conversation messages
   */
  private convertStepsToMessages(steps: AgenticFlowStep[]): AgenticConversationMessage[] {
    const messages: AgenticConversationMessage[] = [];

    steps.forEach((step, index) => {
      messages.push({
        role: "assistant",
        content: step.content,
        timestamp: new Date(),
        stepType: step.type,
      });

      // Add questions as separate messages if they exist
      if (step.questions && step.questions.length > 0) {
        step.questions.forEach((question) => {
          messages.push({
            role: "assistant",
            content: question,
            timestamp: new Date(),
            stepType: "question",
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
