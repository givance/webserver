import { logger } from '@/app/lib/logger';
import { ErrorHandler } from '@/app/lib/utils/error-handler';
import {
  GetDonorInfoTool,
  GetDonorInfoInput,
  GetDonorInfoOutput,
  GetDonorInfoInputSchema,
} from './getDonorInfo';
import {
  GetOrganizationContextTool,
  GetOrganizationContextInput,
  GetOrganizationContextOutput,
  GetOrganizationContextInputSchema,
} from './getOrganizationContext';
import {
  SummarizeForGenerationTool,
  SummarizeForGenerationInput,
  SummarizeForGenerationOutput,
  SummarizeForGenerationInputSchema,
} from './summarizeForGeneration';
import {
  GenerateInstructionTool,
  GenerateInstructionInput,
  GenerateInstructionOutput,
  GenerateInstructionInputSchema,
} from './generateInstruction';
import {
  RefineInstructionTool,
  RefineInstructionInput,
  RefineInstructionOutput,
  RefineInstructionInputSchema,
} from './refineInstruction';

// Tool definitions - Use the Zod schemas from the tool files
export const TOOL_DEFINITIONS = {
  getDonorInfo: {
    name: 'getDonorInfo',
    description:
      'Get comprehensive information about selected donors including donation history, communication history, person research, and calculated statistics',
    parameters: GetDonorInfoInputSchema,
  },
  getOrganizationContext: {
    name: 'getOrganizationContext',
    description:
      'Get organizational context including mission, writing guidelines, brand voice, and user preferences',
    parameters: GetOrganizationContextInputSchema,
  },
  generateInstruction: {
    name: 'generateInstruction',
    description:
      'Generate a comprehensive email generation instruction based on conversation, donor analysis, and organizational context. Use this to create a draft instruction for user review.',
    parameters: GenerateInstructionInputSchema,
  },
  refineInstruction: {
    name: 'refineInstruction',
    description:
      'Refine an existing email generation instruction based on user feedback. Use this when the user wants to modify or improve the generated instruction.',
    parameters: RefineInstructionInputSchema,
  },
  summarizeForGeneration: {
    name: 'summarizeForGeneration',
    description:
      'Synthesize conversation, donor analysis, and organizational context into comprehensive final instructions for email generation',
    parameters: SummarizeForGenerationInputSchema,
  },
} as const;

// Tool call interface
export interface ToolCall {
  id: string;
  name: keyof typeof TOOL_DEFINITIONS;
  arguments: any;
}

// Tool result interface
export interface ToolResult {
  toolCallId: string;
  result: any;
  error?: string;
}

// Tool execution context
export interface ToolExecutionContext {
  organizationId: string;
  userId: string;
  sessionId: string;
}

/**
 * Tool Registry and Execution Engine
 *
 * This class manages the registration and execution of AI agent tools.
 * It provides a unified interface for tool calling and result handling.
 */
export class ToolRegistry {
  private tools: Map<string, any> = new Map();

  constructor() {
    // Register all available tools
    this.registerTool('getDonorInfo', new GetDonorInfoTool());
    this.registerTool('getOrganizationContext', new GetOrganizationContextTool());
    this.registerTool('generateInstruction', new GenerateInstructionTool());
    this.registerTool('refineInstruction', new RefineInstructionTool());
    this.registerTool('summarizeForGeneration', new SummarizeForGenerationTool());
  }

  /**
   * Register a tool with the registry
   */
  private registerTool(name: string, tool: any): void {
    this.tools.set(name, tool);
    // Don't log on every import - tools are registered once at startup
  }

  /**
   * Get available tool definitions for AI
   */
  getToolDefinitions(): typeof TOOL_DEFINITIONS {
    return TOOL_DEFINITIONS;
  }

  /**
   * Execute a single tool call
   */
  async executeTool(toolCall: ToolCall, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      logger.info(`[ToolRegistry] Executing tool: ${toolCall.name} with ID: ${toolCall.id}`);

      const tool = this.tools.get(toolCall.name);
      if (!tool) {
        throw ErrorHandler.createError('NOT_FOUND', `Tool ${toolCall.name} not found in registry`);
      }

      // Validate and execute based on tool type
      let result: any;

      switch (toolCall.name) {
        case 'getDonorInfo':
          const donorInfoInput = GetDonorInfoInputSchema.parse(toolCall.arguments);
          result = await tool.execute(donorInfoInput, context.organizationId);
          break;

        case 'getOrganizationContext':
          const orgContextInput = GetOrganizationContextInputSchema.parse(toolCall.arguments);
          result = await tool.execute(orgContextInput);
          break;

        case 'generateInstruction':
          const generateInput = GenerateInstructionInputSchema.parse(toolCall.arguments);
          result = await tool.execute(generateInput);
          break;

        case 'refineInstruction':
          const refineInput = RefineInstructionInputSchema.parse(toolCall.arguments);
          result = await tool.execute(refineInput);
          break;

        case 'summarizeForGeneration':
          const summarizeInput = SummarizeForGenerationInputSchema.parse(toolCall.arguments);
          result = await tool.execute(summarizeInput);
          break;

        default:
          throw ErrorHandler.createError('BAD_REQUEST', `Tool ${toolCall.name} is not supported`);
      }

      logger.info(`[ToolRegistry] Successfully executed tool: ${toolCall.name}`);

      return {
        toolCallId: toolCall.id,
        result,
      };
    } catch (error) {
      logger.error(`[ToolRegistry] Failed to execute tool ${toolCall.name}:`, error);

      return {
        toolCallId: toolCall.id,
        result: null,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Execute multiple tool calls in parallel
   */
  async executeToolCalls(
    toolCalls: ToolCall[],
    context: ToolExecutionContext
  ): Promise<ToolResult[]> {
    if (toolCalls.length === 0) {
      return [];
    }

    logger.info(`[ToolRegistry] Executing ${toolCalls.length} tool calls`);

    try {
      const results = await Promise.all(
        toolCalls.map((toolCall) => this.executeTool(toolCall, context))
      );

      const successCount = results.filter((r) => !r.error).length;
      const errorCount = results.filter((r) => r.error).length;

      logger.info(
        `[ToolRegistry] Tool execution completed: ${successCount} succeeded, ${errorCount} failed`
      );

      return results;
    } catch (error) {
      logger.error('[ToolRegistry] Failed to execute tool calls:', error);
      throw error;
    }
  }

  /**
   * Validate tool call arguments
   */
  validateToolCall(toolCall: ToolCall): boolean {
    try {
      const toolDef = TOOL_DEFINITIONS[toolCall.name];
      if (!toolDef) {
        return false;
      }

      // Basic validation - could be enhanced with more sophisticated schema validation
      return true;
    } catch (error) {
      logger.error(`[ToolRegistry] Tool call validation failed:`, error);
      return false;
    }
  }

  /**
   * Get tool by name
   */
  getTool(name: string): any | null {
    return this.tools.get(name) || null;
  }

  /**
   * Check if tool exists
   */
  hasToolCalled(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all registered tool names
   */
  getRegisteredToolNames(): string[] {
    return Array.from(this.tools.keys());
  }
}

// Export singleton instance
export const toolRegistry = new ToolRegistry();
