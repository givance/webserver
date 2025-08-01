import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, validateNotNullish, createTRPCError } from '../trpc';
import { db } from '@/app/lib/db';
import { staffIntegrations, staff } from '@/app/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { env } from '@/app/lib/env';
import { logger } from '@/app/lib/logger';
import { crmManager } from '@/app/lib/services/crm';

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
   * Get all integrations for staff in the current organization
   */
  getStaffIntegrations: protectedProcedure
    .input(
      z.object({
        staffId: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // If staffId is provided, verify it belongs to the organization
      if (input.staffId) {
        const staffMember = await db.query.staff.findFirst({
          where: and(
            eq(staff.id, input.staffId),
            eq(staff.organizationId, ctx.auth.user.organizationId)
          ),
        });

        if (!staffMember) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Staff member not found',
          });
        }

        const integrations = await db.query.staffIntegrations.findMany({
          where: eq(staffIntegrations.staffId, input.staffId),
        });

        return integrations.map((integration) => ({
          id: integration.id,
          staffId: integration.staffId,
          provider: integration.provider,
          isActive: integration.isActive,
          lastSyncAt: integration.lastSyncAt,
          syncStatus: integration.syncStatus,
          syncError: integration.syncError,
          createdAt: integration.createdAt,
          metadata: integration.metadata,
        }));
      }

      // Get all staff integrations for the organization
      const staffMembers = await db.query.staff.findMany({
        where: eq(staff.organizationId, ctx.auth.user.organizationId),
        with: {
          integrations: true,
        },
      });

      return staffMembers.flatMap((staffMember) =>
        staffMember.integrations.map((integration) => ({
          id: integration.id,
          staffId: integration.staffId,
          staffName: `${staffMember.firstName} ${staffMember.lastName}`,
          staffEmail: staffMember.email,
          provider: integration.provider,
          isActive: integration.isActive,
          lastSyncAt: integration.lastSyncAt,
          syncStatus: integration.syncStatus,
          syncError: integration.syncError,
          createdAt: integration.createdAt,
          metadata: integration.metadata,
        }))
      );
    }),

  /**
   * Get OAuth authorization URL for a provider
   */
  getIntegrationAuthUrl: protectedProcedure
    .input(
      z.object({
        provider: z.string(),
        staffId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify staff belongs to organization
      const staffMember = await db.query.staff.findFirst({
        where: and(
          eq(staff.id, input.staffId),
          eq(staff.organizationId, ctx.auth.user.organizationId)
        ),
      });

      if (!staffMember) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Staff member not found',
        });
      }

      // Check if integration already exists for this staff member
      const existingIntegration = await db.query.staffIntegrations.findFirst({
        where: and(
          eq(staffIntegrations.staffId, input.staffId),
          eq(staffIntegrations.provider, input.provider)
        ),
      });

      if (existingIntegration && existingIntegration.isActive) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `${input.provider} integration already exists for this staff member`,
        });
      }

      // Check if staff member already has another CRM connected
      const activeCrmIntegrations = await db.query.staffIntegrations.findMany({
        where: and(
          eq(staffIntegrations.staffId, input.staffId),
          eq(staffIntegrations.isActive, true)
        ),
      });

      // Filter for CRM providers (Salesforce and Blackbaud)
      const crmProviders = ['salesforce', 'blackbaud'];
      const activeCrm = activeCrmIntegrations.find(
        (integration) =>
          crmProviders.includes(integration.provider) && integration.provider !== input.provider
      );

      if (activeCrm) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `This staff member is already connected to ${activeCrm.provider}. Please disconnect it before connecting to ${input.provider}.`,
        });
      }

      // Generate state with user, organization, and staff info
      const state = JSON.stringify({
        provider: input.provider,
        organizationId: ctx.auth.user.organizationId,
        userId: ctx.auth.user.id,
        staffId: input.staffId,
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
      } else if (input.provider === 'salesforce') {
        // ALWAYS use SALESFORCE_REDIRECT_URI for Salesforce
        if (!env.SALESFORCE_REDIRECT_URI) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'SALESFORCE_REDIRECT_URI not configured',
          });
        }
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
        const authUrl = await crmManager.getAuthorizationUrl(
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
        let redirectUri: string;

        // Use provider-specific redirect URIs when available
        if (input.provider === 'salesforce') {
          if (!env.SALESFORCE_REDIRECT_URI) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'SALESFORCE_REDIRECT_URI not configured',
            });
          }
          redirectUri = env.SALESFORCE_REDIRECT_URI;
        } else if (input.provider === 'blackbaud' && env.BLACKBAUD_REDIRECT_URI) {
          redirectUri = env.BLACKBAUD_REDIRECT_URI;
        } else {
          redirectUri = `${baseUrl}/settings/integrations/${input.provider}/callback`;
        }

        logger.info('OAuth callback processing', {
          provider: input.provider,
          codeLength: input.code.length,
          codePrefix: input.code.substring(0, 20) + '...',
          stateLength: input.state.length,
          statePrefix: input.state.substring(0, 50) + '...',
          redirectUri,
          decodedState: stateData,
        });

        // Exchange code for tokens
        const tokens = await crmManager.handleOAuthCallback(
          input.provider,
          input.code,
          redirectUri,
          input.state
        );

        // Verify staff member from state
        if (!stateData.staffId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Missing staff ID in state',
          });
        }

        const staffMember = await db.query.staff.findFirst({
          where: and(
            eq(staff.id, stateData.staffId),
            eq(staff.organizationId, ctx.auth.user.organizationId)
          ),
        });

        if (!staffMember) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Staff member not found',
          });
        }

        // Check if integration exists
        const existingIntegration = await db.query.staffIntegrations.findFirst({
          where: and(
            eq(staffIntegrations.staffId, stateData.staffId),
            eq(staffIntegrations.provider, input.provider)
          ),
        });

        if (existingIntegration) {
          // Update existing integration
          await db
            .update(staffIntegrations)
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
            .where(eq(staffIntegrations.id, existingIntegration.id));
        } else {
          // Create new integration
          await db.insert(staffIntegrations).values({
            staffId: stateData.staffId,
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
        integrationId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Find the integration and verify it belongs to a staff member in the organization
      const integration = await db.query.staffIntegrations.findFirst({
        where: eq(staffIntegrations.id, input.integrationId),
        with: {
          staff: true,
        },
      });

      if (!integration || integration.staff.organizationId !== ctx.auth.user.organizationId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Integration not found',
        });
      }

      // Soft delete - mark as inactive
      await db
        .update(staffIntegrations)
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where(eq(staffIntegrations.id, integration.id));

      return { success: true };
    }),

  /**
   * Trigger sync for a specific integration
   */
  syncIntegrationData: protectedProcedure
    .input(
      z.object({
        integrationId: z.number(),
        usePerDonorGiftTransactions: z.boolean().optional().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Find the integration and verify it belongs to a staff member in the organization
      const integration = await db.query.staffIntegrations.findFirst({
        where: and(
          eq(staffIntegrations.id, input.integrationId),
          eq(staffIntegrations.isActive, true)
        ),
        with: {
          staff: true,
        },
      });

      if (!integration || integration.staff.organizationId !== ctx.auth.user.organizationId) {
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

      try {
        // Update sync status to 'syncing'
        await db
          .update(staffIntegrations)
          .set({
            syncStatus: 'syncing',
            syncError: null,
            updatedAt: new Date(),
          })
          .where(eq(staffIntegrations.id, integration.id));

        logger.info('Starting CRM sync', {
          organizationId: ctx.auth.user.organizationId,
          staffId: integration.staffId,
          provider: integration.provider,
          integrationId: integration.id,
        });

        // Sync data directly using the CRM manager
        const result = await crmManager.syncData(
          ctx.auth.user.organizationId,
          integration.staffId,
          integration.provider,
          input.usePerDonorGiftTransactions
        );

        logger.info('CRM sync completed successfully', {
          organizationId: ctx.auth.user.organizationId,
          staffId: integration.staffId,
          provider: integration.provider,
          donorsTotal: result.donors.total,
          donorsCreated: result.donors.created,
          donorsUpdated: result.donors.updated,
          donorsUnchanged: result.donors.unchanged,
          donorsFailed: result.donors.failed,
          donationsTotal: result.donations.total,
          donationsCreated: result.donations.created,
          donationsUpdated: result.donations.updated,
          donationsUnchanged: result.donations.unchanged,
          donationsFailed: result.donations.failed,
          totalTime: result.totalTime,
        });

        // Log any errors
        if (result.donors.errors.length > 0) {
          logger.warn('Donor sync errors', {
            errors: result.donors.errors.slice(0, 10), // Log first 10 errors
            totalErrors: result.donors.errors.length,
          });
        }

        if (result.donations.errors.length > 0) {
          logger.warn('Donation sync errors', {
            errors: result.donations.errors.slice(0, 10), // Log first 10 errors
            totalErrors: result.donations.errors.length,
          });
        }

        // Update sync status to 'idle'
        await db
          .update(staffIntegrations)
          .set({
            syncStatus: 'idle',
            lastSyncAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(staffIntegrations.id, integration.id));

        return {
          success: true,
          message: 'Sync completed successfully',
          result,
        };
      } catch (error) {
        logger.error('CRM sync failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
          organizationId: ctx.auth.user.organizationId,
          staffId: integration.staffId,
          provider: integration.provider,
          integrationId: integration.id,
        });

        // Update integration status to error
        await db
          .update(staffIntegrations)
          .set({
            syncStatus: 'error',
            syncError: error instanceof Error ? error.message : 'Unknown error',
            updatedAt: new Date(),
          })
          .where(eq(staffIntegrations.id, integration.id));

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Sync failed',
        });
      }
    }),

  /**
   * Get sync status for a specific integration
   */
  getIntegrationSyncStatus: protectedProcedure
    .input(
      z.object({
        integrationId: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      const integration = await db.query.staffIntegrations.findFirst({
        where: eq(staffIntegrations.id, input.integrationId),
        with: {
          staff: true,
        },
      });

      if (!integration || integration.staff.organizationId !== ctx.auth.user.organizationId) {
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
