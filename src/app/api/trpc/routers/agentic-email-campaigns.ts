import { z } from 'zod';
import { protectedProcedure, router } from '../trpc';
import type { AgenticEmailGenerationInput } from '@/app/lib/services/agentic-email-generation.service';
import { env } from '@/app/lib/env';
import { isFeatureEnabledForOrganization } from '@/app/lib/feature-flags/utils';

// Input validation schemas for agentic flow
const startAgenticFlowSchema = z.object({
  donors: z.array(
    z.object({
      id: z.number(),
      firstName: z.string(),
      lastName: z.string(),
      email: z.string(),
    })
  ),
  organizationName: z.string().min(1),
  organizationWritingInstructions: z.string().optional(),
  currentDate: z.string().optional(),
});

const continueAgenticFlowSchema = z.object({
  sessionId: z.string(),
  userResponse: z.string().min(1),
});

const generateFinalPromptSchema = z.object({
  sessionId: z.string(),
});

const executeEmailGenerationSchema = z.object({
  sessionId: z.string(),
  confirmedPrompt: z.string().min(1),
});

const getSessionStateSchema = z.object({
  sessionId: z.string(),
});

/**
 * Router for agentic email campaign management
 * Handles the iterative conversation flow for email generation
 */
export const agenticEmailCampaignsRouter = router({
  /**
   * Starts a new agentic email generation flow
   */
  startFlow: protectedProcedure
    .input(startAgenticFlowSchema)
    .mutation(async ({ ctx, input }: { ctx: any; input: AgenticEmailGenerationInput }) => {
      // Check if agentic flow is enabled
      const useAgenticFlow = await isFeatureEnabledForOrganization(
        ctx.auth.user.organizationId,
        'use_agentic_flow'
      );
      if (!useAgenticFlow) {
        throw new Error('Agentic flow is not enabled for your organization.');
      }

      return await ctx.services.agenticEmailGeneration.startAgenticFlow(
        input,
        ctx.auth.user.organizationId,
        ctx.auth.user.id
      );
    }),

  /**
   * Continues an existing agentic conversation
   */
  continueFlow: protectedProcedure
    .input(continueAgenticFlowSchema)
    .mutation(async ({ ctx, input }) => {
      const useAgenticFlow = await isFeatureEnabledForOrganization(
        ctx.auth.user.organizationId,
        'use_agentic_flow'
      );
      if (!useAgenticFlow) {
        throw new Error('Agentic flow is not enabled for your organization.');
      }

      return await ctx.services.agenticEmailGeneration.continueAgenticFlow(
        input.sessionId,
        input.userResponse
      );
    }),

  /**
   * Generates the final prompt for user confirmation
   */
  generateFinalPrompt: protectedProcedure
    .input(generateFinalPromptSchema)
    .mutation(async ({ ctx, input }) => {
      const useAgenticFlow = await isFeatureEnabledForOrganization(
        ctx.auth.user.organizationId,
        'use_agentic_flow'
      );
      if (!useAgenticFlow) {
        throw new Error('Agentic flow is not enabled for your organization.');
      }

      return await ctx.services.agenticEmailGeneration.generateFinalPrompt(input.sessionId);
    }),

  /**
   * Executes email generation using the confirmed prompt
   */
  executeGeneration: protectedProcedure
    .input(executeEmailGenerationSchema)
    .mutation(async ({ ctx, input }) => {
      const useAgenticFlow = await isFeatureEnabledForOrganization(
        ctx.auth.user.organizationId,
        'use_agentic_flow'
      );
      if (!useAgenticFlow) {
        throw new Error('Agentic flow is not enabled for your organization.');
      }

      return await ctx.services.agenticEmailGeneration.executeEmailGeneration(
        input.sessionId,
        input.confirmedPrompt
      );
    }),

  /**
   * Gets the current state of an agentic session
   */
  getSessionState: protectedProcedure.input(getSessionStateSchema).query(async ({ ctx, input }) => {
    const useAgenticFlow = await isFeatureEnabledForOrganization(
      ctx.auth.user.organizationId,
      'use_agentic_flow'
    );
    if (!useAgenticFlow) {
      throw new Error('Agentic flow is not enabled for your organization.');
    }

    return ctx.services.agenticEmailGeneration.getSessionState(input.sessionId);
  }),
});
