import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, validateNotNullish, createTRPCError } from '../trpc';
import { db } from '@/app/lib/db';
import { organizationIntegrations } from '@/app/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { env } from '@/app/lib/env';
import { logger } from '@/app/lib/logger';
import { crmManager } from '@/app/lib/services/crm';
import { syncCrmDataTask } from '@/trigger/jobs/syncCrmData';

export const integrationsRouter = router({
  /**
   * Debug endpoint to check Salesforce configuration
   */
  debugSalesforceConfig: protectedProcedure.query(async ({ ctx }) => {
    // Only allow admins to view this debug info
    const hasClientId = !!env.SALESFORCE_CLIENT_ID;
    const hasClientSecret = !!env.SALESFORCE_CLIENT_SECRET;

    return {
      configured: hasClientId && hasClientSecret,
      details: {
        hasClientId,
        clientIdLength: env.SALESFORCE_CLIENT_ID?.length || 0,
        clientIdPrefix: env.SALESFORCE_CLIENT_ID
          ? env.SALESFORCE_CLIENT_ID.substring(0, 10) + '...'
          : 'Not set',
        hasClientSecret,
        clientSecretLength: env.SALESFORCE_CLIENT_SECRET?.length || 0,
        isSandbox: env.SALESFORCE_USE_SANDBOX,
        envRedirectUri: env.SALESFORCE_REDIRECT_URI || 'Not set',
        baseUrl: env.BASE_URL,
        expectedRedirectUri: `${env.BASE_URL}/settings/integrations/salesforce/callback`,
      },
      message:
        !hasClientId || !hasClientSecret
          ? 'Missing required Salesforce environment variables. Check server logs for details.'
          : 'Salesforce configuration appears complete.',
    };
  }),
  /**
   * Debug endpoint to check Blackbaud configuration
   */
  debugBlackbaudConfig: protectedProcedure.query(async ({ ctx }) => {
    // Only allow admins to view this debug info
    const hasClientId = !!env.BLACKBAUD_CLIENT_ID;
    const hasClientSecret = !!env.BLACKBAUD_CLIENT_SECRET;
    const hasSubscriptionKey = !!env.BLACKBAUD_SUBSCRIPTION_KEY;

    return {
      configured: hasClientId && hasClientSecret && hasSubscriptionKey,
      details: {
        hasClientId,
        clientIdLength: env.BLACKBAUD_CLIENT_ID?.length || 0,
        clientIdPrefix: env.BLACKBAUD_CLIENT_ID
          ? env.BLACKBAUD_CLIENT_ID.substring(0, 8) + '...'
          : 'Not set',
        hasClientSecret,
        clientSecretLength: env.BLACKBAUD_CLIENT_SECRET?.length || 0,
        hasSubscriptionKey,
        subscriptionKeyLength: env.BLACKBAUD_SUBSCRIPTION_KEY?.length || 0,
        subscriptionKeyPrefix: env.BLACKBAUD_SUBSCRIPTION_KEY
          ? env.BLACKBAUD_SUBSCRIPTION_KEY.substring(0, 8) + '...'
          : 'Not set',
        isSandbox: env.BLACKBAUD_USE_SANDBOX,
        envRedirectUri: env.BLACKBAUD_REDIRECT_URI || 'Not set',
        baseUrl: env.BASE_URL,
        expectedRedirectUri: `${env.BASE_URL}/settings/integrations/blackbaud/callback`,
      },
      message:
        !hasClientId || !hasClientSecret || !hasSubscriptionKey
          ? 'Missing required Blackbaud environment variables. Check server logs for details.'
          : 'Blackbaud configuration appears complete.',
    };
  }),
  /**
   * Get all available CRM providers
   */
  getAvailableProviders: protectedProcedure.query(async () => {
    const providers = crmManager.getAvailableProviders();

    // Add sandbox information for providers that support it
    return providers.map((provider) => ({
      ...provider,
      isSandbox:
        (provider.name === 'blackbaud' && env.BLACKBAUD_USE_SANDBOX) ||
        (provider.name === 'salesforce' && env.SALESFORCE_USE_SANDBOX),
    }));
  }),

  /**
   * Get all integrations for the current organization
   */
  getOrganizationIntegrations: protectedProcedure.query(async ({ ctx }) => {
    const integrations = await db.query.organizationIntegrations.findMany({
      where: eq(organizationIntegrations.organizationId, ctx.auth.user.organizationId),
    });

    // Don't expose sensitive tokens to the client
    return integrations.map((integration) => ({
      id: integration.id,
      provider: integration.provider,
      isActive: integration.isActive,
      lastSyncAt: integration.lastSyncAt,
      syncStatus: integration.syncStatus,
      syncError: integration.syncError,
      createdAt: integration.createdAt,
      metadata: integration.metadata,
    }));
  }),

  /**
   * Get OAuth authorization URL for a provider
   */
  getIntegrationAuthUrl: protectedProcedure
    .input(
      z.object({
        provider: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check if integration already exists
      const existingIntegration = await db.query.organizationIntegrations.findFirst({
        where: and(
          eq(organizationIntegrations.organizationId, ctx.auth.user.organizationId),
          eq(organizationIntegrations.provider, input.provider)
        ),
      });

      if (existingIntegration && existingIntegration.isActive) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `${input.provider} integration already exists`,
        });
      }

      // Generate state with user and organization info
      const state = JSON.stringify({
        provider: input.provider,
        organizationId: ctx.auth.user.organizationId,
        userId: ctx.auth.user.id,
      });

      // Get the redirect URI based on provider
      let redirectUri: string;
      const baseUrl = env.BASE_URL;

      if (input.provider === 'blackbaud' && env.BLACKBAUD_REDIRECT_URI) {
        // Use the exact redirect URI from environment for Blackbaud
        redirectUri = env.BLACKBAUD_REDIRECT_URI;

        logger.info('Using Blackbaud redirect URI from environment', {
          redirectUri,
          hasClientId: !!env.BLACKBAUD_CLIENT_ID,
          hasClientSecret: !!env.BLACKBAUD_CLIENT_SECRET,
          hasSubscriptionKey: !!env.BLACKBAUD_SUBSCRIPTION_KEY,
          isSandbox: env.BLACKBAUD_USE_SANDBOX,
        });
      } else if (input.provider === 'salesforce' && env.SALESFORCE_REDIRECT_URI) {
        // Use the exact redirect URI from environment for Salesforce
        redirectUri = env.SALESFORCE_REDIRECT_URI;

        logger.info('Using Salesforce redirect URI from environment', {
          redirectUri,
          hasClientId: !!env.SALESFORCE_CLIENT_ID,
          hasClientSecret: !!env.SALESFORCE_CLIENT_SECRET,
          isSandbox: env.SALESFORCE_USE_SANDBOX,
        });
      } else {
        // Generate redirect URI for other providers
        redirectUri = `${baseUrl}/settings/integrations/${input.provider}/callback`;

        logger.info('Using generated redirect URI', {
          provider: input.provider,
          baseUrl,
          redirectUri,
        });
      }

      logger.info('Generating integration auth URL', {
        provider: input.provider,
        redirectUri,
        organizationId: ctx.auth.user.organizationId,
        userId: ctx.auth.user.id,
      });

      try {
        const authUrl = crmManager.getAuthorizationUrl(
          input.provider,
          Buffer.from(state).toString('base64'),
          redirectUri
        );

        logger.info('Successfully generated auth URL', {
          provider: input.provider,
          authUrlLength: authUrl.length,
          authUrlPrefix: authUrl.substring(0, 50) + '...',
        });

        return { authUrl };
      } catch (error) {
        logger.error('Failed to generate auth URL', {
          error,
          provider: input.provider,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          baseUrl,
          redirectUri,
        });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate authorization URL. Check server logs for details.',
        });
      }
    }),

  /**
   * Handle OAuth callback
   */
  handleIntegrationCallback: protectedProcedure
    .input(
      z.object({
        provider: z.string(),
        code: z.string(),
        state: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Decode and validate state
        const stateData = JSON.parse(Buffer.from(input.state, 'base64').toString());

        if (stateData.organizationId !== ctx.auth.user.organizationId) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Invalid state parameter',
          });
        }

        const baseUrl = env.BASE_URL;
        const redirectUri = `${baseUrl}/settings/integrations/${input.provider}/callback`;

        // Exchange code for tokens
        const tokens = await crmManager.handleOAuthCallback(
          input.provider,
          input.code,
          redirectUri
        );

        // Check if integration exists
        const existingIntegration = await db.query.organizationIntegrations.findFirst({
          where: and(
            eq(organizationIntegrations.organizationId, ctx.auth.user.organizationId),
            eq(organizationIntegrations.provider, input.provider)
          ),
        });

        if (existingIntegration) {
          // Update existing integration
          await db
            .update(organizationIntegrations)
            .set({
              accessToken: tokens.accessToken,
              refreshToken: tokens.refreshToken,
              expiresAt: tokens.expiresAt,
              tokenType: tokens.tokenType || null,
              scope: tokens.scope || null,
              metadata: tokens.metadata || existingIntegration.metadata,
              isActive: true,
              syncStatus: 'idle',
              syncError: null,
              updatedAt: new Date(),
            })
            .where(eq(organizationIntegrations.id, existingIntegration.id));
        } else {
          // Create new integration
          await db.insert(organizationIntegrations).values({
            organizationId: ctx.auth.user.organizationId,
            provider: input.provider,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresAt: tokens.expiresAt,
            tokenType: tokens.tokenType || null,
            scope: tokens.scope || null,
            metadata: tokens.metadata || {},
            isActive: true,
            syncStatus: 'idle',
          });
        }

        return { success: true };
      } catch (error) {
        logger.error('OAuth callback failed', { error, provider: input.provider });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to complete OAuth flow',
        });
      }
    }),

  /**
   * Disconnect an integration
   */
  disconnectIntegration: protectedProcedure
    .input(
      z.object({
        provider: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const integration = await db.query.organizationIntegrations.findFirst({
        where: and(
          eq(organizationIntegrations.organizationId, ctx.auth.user.organizationId),
          eq(organizationIntegrations.provider, input.provider)
        ),
      });

      if (!integration) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Integration not found',
        });
      }

      // Soft delete - mark as inactive
      await db
        .update(organizationIntegrations)
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where(eq(organizationIntegrations.id, integration.id));

      return { success: true };
    }),

  /**
   * Trigger sync for a specific integration
   */
  syncIntegrationData: protectedProcedure
    .input(
      z.object({
        provider: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const integration = await db.query.organizationIntegrations.findFirst({
        where: and(
          eq(organizationIntegrations.organizationId, ctx.auth.user.organizationId),
          eq(organizationIntegrations.provider, input.provider),
          eq(organizationIntegrations.isActive, true)
        ),
      });

      if (!integration) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Active integration not found',
        });
      }

      if (integration.syncStatus === 'syncing') {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Sync already in progress',
        });
      }

      // Trigger background job
      await syncCrmDataTask.trigger({
        organizationId: ctx.auth.user.organizationId,
        provider: input.provider,
        integrationId: integration.id,
      });

      return { success: true, message: 'Sync initiated' };
    }),

  /**
   * Get sync status for a specific integration
   */
  getIntegrationSyncStatus: protectedProcedure
    .input(
      z.object({
        provider: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const integration = await db.query.organizationIntegrations.findFirst({
        where: and(
          eq(organizationIntegrations.organizationId, ctx.auth.user.organizationId),
          eq(organizationIntegrations.provider, input.provider)
        ),
      });

      if (!integration) {
        return null;
      }

      return {
        syncStatus: integration.syncStatus,
        lastSyncAt: integration.lastSyncAt,
        syncError: integration.syncError,
        isActive: integration.isActive,
      };
    }),
});
