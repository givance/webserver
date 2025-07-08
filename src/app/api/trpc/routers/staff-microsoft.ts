import { z } from 'zod';
import { Client } from '@microsoft/microsoft-graph-client';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, check, ERROR_MESSAGES } from '../trpc';
import { db } from '@/app/lib/db';
import { staffMicrosoftTokens, staff } from '@/app/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { env } from '@/app/lib/env';
import { logger } from '@/app/lib/logger';
import 'isomorphic-fetch';

// Ensure you have these in your environment variables
const MICROSOFT_CLIENT_ID = env.MICROSOFT_CLIENT_ID;
const MICROSOFT_CLIENT_SECRET = env.MICROSOFT_CLIENT_SECRET;
const MICROSOFT_REDIRECT_URI = env.MICROSOFT_REDIRECT_URI;
// Staff-specific redirect URI (same domain, different path)
const STAFF_MICROSOFT_REDIRECT_URI = env.MICROSOFT_REDIRECT_URI.replace(
  '/settings/microsoft/callback',
  '/settings/microsoft/staff-callback'
);

if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET || !MICROSOFT_REDIRECT_URI) {
  console.error(
    'Missing Microsoft OAuth credentials in environment variables. Staff Microsoft integration will not work.'
  );
}

export const staffMicrosoftRouter = router({
  /**
   * Get Microsoft authentication URL for a specific staff member
   */
  getStaffMicrosoftAuthUrl: protectedProcedure
    .input(z.object({ staffId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!MICROSOFT_CLIENT_ID || !STAFF_MICROSOFT_REDIRECT_URI) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Microsoft OAuth client not configured.',
        });
      }

      // Verify staff member exists and belongs to user's organization
      const staffMember = await db.query.staff.findFirst({
        where: and(
          eq(staff.id, input.staffId),
          eq(staff.organizationId, ctx.auth.user.organizationId)
        ),
      });

      check(!staffMember, 'NOT_FOUND', 'Staff member not found');

      // Generate state parameter with user ID for security
      const state = JSON.stringify({
        staffId: input.staffId,
        organizationId: ctx.auth.user.organizationId,
        userId: ctx.auth.user.id,
      });

      // Microsoft OAuth authorization URL
      const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
      authUrl.searchParams.append('client_id', MICROSOFT_CLIENT_ID);
      authUrl.searchParams.append('response_type', 'code');
      authUrl.searchParams.append('redirect_uri', STAFF_MICROSOFT_REDIRECT_URI);
      authUrl.searchParams.append('scope', 'offline_access Mail.ReadWrite Mail.Send User.Read');
      authUrl.searchParams.append('state', state);
      authUrl.searchParams.append('prompt', 'consent');

      return { authUrl: authUrl.toString() };
    }),

  /**
   * Handle OAuth callback for staff Microsoft authentication
   */
  handleStaffMicrosoftOAuthCallback: protectedProcedure
    .input(z.object({ code: z.string(), state: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET || !STAFF_MICROSOFT_REDIRECT_URI) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Microsoft OAuth client not configured.',
        });
      }

      let stateData;
      try {
        stateData = JSON.parse(input.state);
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid state parameter',
        });
      }

      const { staffId, organizationId, userId } = stateData;

      // Verify user and staff member
      if (userId !== ctx.auth.user.id || organizationId !== ctx.auth.user.organizationId) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Unauthorized to link Microsoft for this staff member',
        });
      }

      const staffMember = await db.query.staff.findFirst({
        where: and(eq(staff.id, staffId), eq(staff.organizationId, organizationId)),
      });

      check(!staffMember, 'NOT_FOUND', 'Staff member not found');

      try {
        // Exchange code for tokens
        const tokenUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
        const tokenResponse = await fetch(tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            client_id: MICROSOFT_CLIENT_ID,
            client_secret: MICROSOFT_CLIENT_SECRET,
            code: input.code,
            redirect_uri: STAFF_MICROSOFT_REDIRECT_URI,
            grant_type: 'authorization_code',
          }).toString(),
        });

        if (!tokenResponse.ok) {
          const errorData = await tokenResponse.json();
          throw new Error(
            `Microsoft OAuth error: ${errorData.error_description || errorData.error || 'Unknown error'}`
          );
        }

        const tokens = await tokenResponse.json();

        // Get user's email from Microsoft Graph API
        const client = Client.init({
          authProvider: (done: any) => {
            done(null, tokens.access_token);
          },
        });

        const userInfo = await client.api('/me').select('mail,userPrincipalName').get();
        const emailAddress = userInfo.mail || userInfo.userPrincipalName;

        check(
          !emailAddress,
          'INTERNAL_SERVER_ERROR',
          'Failed to retrieve email address from Microsoft account.'
        );

        // Calculate token expiration time
        const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

        // Upsert the staff Microsoft token
        await db
          .insert(staffMicrosoftTokens)
          .values({
            staffId: staffId,
            email: emailAddress,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: expiresAt,
            scope: tokens.scope,
            tokenType: tokens.token_type || 'Bearer',
          })
          .onConflictDoUpdate({
            target: staffMicrosoftTokens.staffId,
            set: {
              email: emailAddress,
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token,
              expiresAt: expiresAt,
              scope: tokens.scope,
              tokenType: tokens.token_type || 'Bearer',
              updatedAt: new Date(),
            },
          });

        logger.info(`Staff Microsoft account connected for staff ${staffId}: ${emailAddress}`);

        return {
          success: true,
          message: `Microsoft account ${emailAddress} connected successfully for ${staffMember.firstName} ${staffMember.lastName}.`,
          email: emailAddress,
        };
      } catch (error: any) {
        console.error('Error handling staff Microsoft OAuth callback:', error);
        if (error.response && error.response.data && error.response.data.error_description) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Microsoft API Error: ${error.response.data.error_description}`,
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to process staff Microsoft OAuth callback.',
        });
      }
    }),

  /**
   * Get Microsoft connection status for a specific staff member
   */
  getStaffMicrosoftConnectionStatus: protectedProcedure
    .input(z.object({ staffId: z.number() }))
    .query(async ({ ctx, input }) => {
      // Verify staff member exists and belongs to user's organization
      const staffMember = await db.query.staff.findFirst({
        where: and(
          eq(staff.id, input.staffId),
          eq(staff.organizationId, ctx.auth.user.organizationId)
        ),
        with: {
          microsoftToken: true,
        },
      });

      check(!staffMember, 'NOT_FOUND', 'Staff member not found');

      if (staffMember.microsoftToken) {
        return {
          isConnected: true,
          email: staffMember.microsoftToken.email,
          message: `Connected with ${staffMember.microsoftToken.email}`,
        };
      }

      return {
        isConnected: false,
        email: null,
        message: 'Microsoft account not connected.',
      };
    }),

  /**
   * Disconnect Microsoft account for a specific staff member
   */
  disconnectStaffMicrosoft: protectedProcedure
    .input(z.object({ staffId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // Verify staff member exists and belongs to user's organization
      const staffMember = await db.query.staff.findFirst({
        where: and(
          eq(staff.id, input.staffId),
          eq(staff.organizationId, ctx.auth.user.organizationId)
        ),
      });

      check(!staffMember, 'NOT_FOUND', 'Staff member not found');

      // Delete the Microsoft token for this staff member
      await db.delete(staffMicrosoftTokens).where(eq(staffMicrosoftTokens.staffId, input.staffId));

      logger.info(`Staff Microsoft account disconnected for staff ${input.staffId}`);

      return {
        success: true,
        message: `Microsoft account disconnected for ${staffMember.firstName} ${staffMember.lastName}.`,
      };
    }),
});
