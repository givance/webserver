import { createEmailTracker, createLinkTrackers } from '@/app/lib/data/email-tracking';
import { db } from '@/app/lib/db';
import { donors, generatedEmails, staff, users } from '@/app/lib/db/schema';
import { env } from '@/app/lib/env';
import { logger } from '@/app/lib/logger';
import {
  createHtmlEmail,
  processEmailContentWithTracking,
  formatSenderField,
} from '@/app/lib/utils/email-tracking/content-processor';
import { generateTrackingId } from '@/app/lib/utils/email-tracking/utils';
import { appendSignatureToEmail } from '@/app/lib/utils/email-with-signature';
import { Client } from '@microsoft/microsoft-graph-client';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import 'isomorphic-fetch';
import { z } from 'zod';
import {
  protectedProcedure,
  router,
  check,
  ERROR_MESSAGES,
  validateNotNullish,
  createTRPCError,
} from '../trpc';
import type { Context } from '../context';

// Ensure you have these in your environment variables
const MICROSOFT_CLIENT_ID = env.MICROSOFT_APPLICATION_ID;
const MICROSOFT_CLIENT_SECRET = env.MICROSOFT_CLIENT_SECRET;

// Construct redirect URI using the BASE_URL
const MICROSOFT_REDIRECT_URI = env.MICROSOFT_REDIRECT_URI; // e.g., https://app.givance.ai/settings/microsoft/callback

// No initialization logging needed

/**
 * Helper function to get authenticated Microsoft Graph client for user
 * @deprecated This function is deprecated as user-level OAuth tokens are no longer used.
 * Staff members should authenticate their Microsoft accounts directly.
 */
async function getMicrosoftClient(userId: string) {
  throw new TRPCError({
    code: 'UNAUTHORIZED',
    message:
      'User-level Microsoft OAuth is deprecated. Staff members should authenticate their Microsoft accounts directly.',
  });
}

/**
 * Enhanced helper function to get Microsoft client based on donor assignment
 * Returns Microsoft client, sender info, and signature based on business logic:
 * 1. If donor assigned to staff with linked email account → use staff's Microsoft account + staff signature
 * 2. If donor assigned to staff without linked email account → use org default Microsoft account + staff signature
 * 3. If donor not assigned → use org default Microsoft account & signature
 */
async function getMicrosoftClientForDonor(
  donorId: number,
  organizationId: string,
  fallbackUserId: string
) {
  // Get donor with staff assignment
  const donorInfo = await db.query.donors.findFirst({
    where: and(eq(donors.id, donorId), eq(donors.organizationId, organizationId)),
    with: {
      assignedStaff: {
        with: {
          microsoftToken: true,
        },
      },
    },
  });

  validateNotNullish(donorInfo, 'NOT_FOUND', 'Donor not found');

  // Step 1: Log donor information
  logger.info(
    `[Microsoft Client Selection] Donor: ${donorInfo.firstName} ${donorInfo.lastName} (ID: ${donorId}, Email: ${donorInfo.email})`
  );

  // Step 2: Log assigned staff information
  if (donorInfo.assignedStaff) {
    logger.info(
      `[Microsoft Client Selection] Assigned Staff: ${donorInfo.assignedStaff.firstName} ${
        donorInfo.assignedStaff.lastName
      } (ID: ${donorInfo.assignedStaff.id}, Email: ${donorInfo.assignedStaff.email}, Has Microsoft Token: ${!!donorInfo
        .assignedStaff.microsoftToken})`
    );
  } else {
    logger.info(`[Microsoft Client Selection] No staff assigned to donor ${donorId}`);
  }

  let microsoftClient;
  let senderInfo: { name: string; email: string | null; signature: string | null } = {
    name: 'Organization',
    email: null,
    signature: null,
  };
  let shouldUseStaffSignature = false;

  try {
    // Case 1: Donor assigned to staff with linked email account
    if (donorInfo.assignedStaff?.microsoftToken) {
      logger.info(
        `[Microsoft Client Selection] Case 1: Using assigned staff's Microsoft account - Staff: ${donorInfo.assignedStaff.firstName} ${donorInfo.assignedStaff.lastName} (${donorInfo.assignedStaff.email})`
      );

      const staffToken = donorInfo.assignedStaff.microsoftToken;

      // Create Microsoft Graph client with staff token
      microsoftClient = Client.init({
        authProvider: (done: (error: Error | null, accessToken: string | null) => void) => {
          // Check if token is expired and needs refresh
          const now = new Date();
          if (now >= staffToken.expiresAt) {
            // Token is expired, need to refresh
            // This would be implemented with the refresh token flow
            // For now, we'll just throw an error
            done(new Error('Token expired. Please reconnect your Microsoft account.'), null);
            return;
          }

          done(null, staffToken.accessToken);
        },
      });

      senderInfo = {
        name: `${donorInfo.assignedStaff.firstName} ${donorInfo.assignedStaff.lastName}`,
        email: donorInfo.assignedStaff.email,
        signature: donorInfo.assignedStaff.signature,
      };

      logger.info(
        `[Microsoft Client Selection] ✓ Successfully authenticated with assigned staff's Microsoft account for donor ${donorId} - Using email: ${donorInfo.assignedStaff.email}`
      );
    }
    // Case 2: Donor assigned to staff without linked email account
    else if (donorInfo.assignedStaff) {
      logger.info(
        `[Microsoft Client Selection] Case 2: Assigned staff ${donorInfo.assignedStaff.firstName} ${donorInfo.assignedStaff.lastName} (${donorInfo.assignedStaff.email}) has no linked Microsoft account - Will use organization default email with staff signature`
      );
      shouldUseStaffSignature = true;
    }
    // Case 3: Donor not assigned to staff - check for primary staff
    else {
      logger.info(
        `[Microsoft Client Selection] Case 3: Donor not assigned to any staff - Checking for primary staff`
      );

      // Try to get primary staff for the organization
      const primaryStaffInfo = await db.query.staff.findFirst({
        where: and(eq(staff.organizationId, organizationId), eq(staff.isPrimary, true)),
        with: {
          microsoftToken: true,
        },
      });

      if (primaryStaffInfo?.microsoftToken) {
        logger.info(
          `[Microsoft Client Selection] Found primary staff with Microsoft account - Staff: ${primaryStaffInfo.firstName} ${primaryStaffInfo.lastName} (${primaryStaffInfo.email})`
        );

        const primaryStaffToken = primaryStaffInfo.microsoftToken;

        // Create Microsoft Graph client with primary staff token
        microsoftClient = Client.init({
          authProvider: (done: (error: Error | null, accessToken: string | null) => void) => {
            // Check if token is expired and needs refresh
            const now = new Date();
            if (now >= primaryStaffToken.expiresAt) {
              // Token is expired, need to refresh
              // This would be implemented with the refresh token flow
              // For now, we'll just throw an error
              done(new Error('Token expired. Please reconnect your Microsoft account.'), null);
              return;
            }

            done(null, primaryStaffToken.accessToken);
          },
        });

        senderInfo = {
          name: `${primaryStaffInfo.firstName} ${primaryStaffInfo.lastName}`,
          email: primaryStaffInfo.email,
          signature: primaryStaffInfo.signature,
        };

        logger.info(
          `[Microsoft Client Selection] ✓ Successfully authenticated with primary staff's Microsoft account for donor ${donorId} - Using email: ${primaryStaffInfo.email}`
        );
      } else if (primaryStaffInfo) {
        logger.info(
          `[Microsoft Client Selection] Found primary staff ${primaryStaffInfo.firstName} ${primaryStaffInfo.lastName} (${primaryStaffInfo.email}) but no linked Microsoft account - Will use organization default email with primary staff signature`
        );
        shouldUseStaffSignature = true;
      } else {
        logger.info(
          `[Microsoft Client Selection] No primary staff found for organization ${organizationId} - Will use organization default email`
        );
      }
    }

    // If no client has been set yet, there's no fallback available
    if (!microsoftClient) {
      logger.error(
        `[Microsoft Client Selection] No Microsoft client available for donor ${donorId}. Staff must have Microsoft account connected.`
      );
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message:
          'No Microsoft account available. The assigned staff member or primary staff must have a Microsoft account connected.',
      });
    }

    validateNotNullish(
      microsoftClient,
      'INTERNAL_SERVER_ERROR',
      'Failed to initialize Microsoft client'
    );

    return { client: microsoftClient, senderInfo };
  } catch (error) {
    logger.error(
      `[Microsoft Client Selection] Error getting Microsoft client for donor ${donorId}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throw error;
  }
}

export const microsoftRouter = router({
  /**
   * Get Microsoft authentication URL
   * @deprecated User-level OAuth is deprecated. Staff should use staff-level authentication.
   */
  getMicrosoftAuthUrl: protectedProcedure.mutation(async ({ ctx }) => {
    throw createTRPCError({
      code: 'NOT_IMPLEMENTED',
      message:
        'User-level Microsoft OAuth is deprecated. Staff members should authenticate their Microsoft accounts through the staff settings.',
    });
  }),

  /**
   * Handle OAuth callback from Microsoft
   * @deprecated User-level OAuth is deprecated. Staff should use staff-level authentication.
   */
  handleOAuthCallback: protectedProcedure
    .input(
      z.object({
        code: z.string(),
        state: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET || !MICROSOFT_REDIRECT_URI) {
        throw createTRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Microsoft OAuth is not configured on the server.',
        });
      }

      // Parse state to verify user ID
      let stateData: { userId: string; organizationId: string } | null = null;
      try {
        if (input.state) {
          stateData = JSON.parse(input.state);
        }
      } catch (error) {
        logger.error(
          `Error parsing state: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      // Verify user ID from state matches authenticated user
      if (stateData && stateData.userId !== ctx.auth.user.id) {
        throw createTRPCError({
          code: 'UNAUTHORIZED',
          message: 'User ID mismatch in OAuth callback.',
        });
      }

      try {
        // Exchange code for tokens
        const tokenUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
        const tokenParams = {
          client_id: MICROSOFT_CLIENT_ID,
          client_secret: MICROSOFT_CLIENT_SECRET,
          code: input.code,
          redirect_uri: MICROSOFT_REDIRECT_URI,
          grant_type: 'authorization_code',
        };

        // Log token exchange request details (excluding sensitive data)
        logger.info('Exchanging Microsoft authorization code for tokens (Organization):', {
          tokenUrl,
          clientId: MICROSOFT_CLIENT_ID,
          redirectUri: MICROSOFT_REDIRECT_URI,
          codeLength: input.code.length,
          userId: ctx.auth.user.id,
        });

        const tokenResponse = await fetch(tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams(tokenParams).toString(),
        });

        if (!tokenResponse.ok) {
          const errorData = await tokenResponse.json();
          logger.error('Microsoft OAuth token exchange failed (Organization):', {
            status: tokenResponse.status,
            error: errorData,
            redirectUri: MICROSOFT_REDIRECT_URI,
            clientId: MICROSOFT_CLIENT_ID,
          });
          throw new Error(
            `Microsoft OAuth error: ${errorData.error_description || errorData.error || 'Unknown error'}`
          );
        }

        const tokens = await tokenResponse.json();

        // Get user's email from Microsoft Graph API
        const client = Client.init({
          authProvider: (done: (error: Error | null, accessToken: string | null) => void) => {
            done(null, tokens.access_token);
          },
        });

        const userInfo = await client.api('/me').select('mail,userPrincipalName').get();
        const emailAddress = userInfo.mail || userInfo.userPrincipalName;

        if (!emailAddress) {
          throw new Error('Could not retrieve email address from Microsoft account');
        }

        // Calculate token expiration time
        const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

        // User-level OAuth tokens are deprecated
        // Staff members should use the staff Microsoft token system instead
        throw new TRPCError({
          code: 'NOT_IMPLEMENTED',
          message:
            'User-level Microsoft OAuth is deprecated. Staff members should authenticate their Microsoft accounts through the staff settings.',
        });
      } catch (error: any) {
        logger.error(`Error handling Microsoft OAuth callback: ${error.message || String(error)}`);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to connect Microsoft account: ${error.message || 'Unknown error'}`,
        });
      }
    }),

  /**
   * Get Microsoft connection status
   */
  getMicrosoftConnectionStatus: protectedProcedure.query(async ({ ctx }) => {
    const tokenInfo = await ctx.services.microsoftOAuth.getMicrosoftToken(ctx.auth.user.id);

    if (tokenInfo) {
      return {
        isConnected: true,
        email: tokenInfo.email,
        message: `Connected with ${tokenInfo.email}`,
      };
    }

    return {
      isConnected: false,
      email: null,
      message: 'Microsoft account not connected.',
    };
  }),

  /**
   * Disconnect Microsoft account
   */
  disconnectMicrosoft: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.auth.user.id;

    // Delete the token from the database
    await ctx.services.microsoftOAuth.disconnectMicrosoftToken(userId);

    return {
      success: true,
      message: 'Microsoft account disconnected successfully.',
    };
  }),

  /**
   * Send email via Microsoft
   */
  sendEmail: protectedProcedure
    .input(
      z.object({
        donorId: z.number(),
        emailId: z.number(),
        subject: z.string(),
        content: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { donorId, emailId, subject, content } = input;
      const userId = ctx.auth.user.id;
      const organizationId = ctx.auth.user.organizationId;

      try {
        // Get donor information
        const donor = await db.query.donors.findFirst({
          where: and(eq(donors.id, donorId), eq(donors.organizationId, organizationId)),
        });

        validateNotNullish(donor, 'NOT_FOUND', 'Donor not found');

        validateNotNullish(donor.email, 'BAD_REQUEST', 'Donor does not have an email address');

        // Get Microsoft client for this donor
        const { client: microsoftClient, senderInfo } = await getMicrosoftClientForDonor(
          donorId,
          organizationId,
          userId
        );

        // Process email content with tracking
        const trackingId = generateTrackingId();

        // Create email tracker in database
        const emailTracker = await createEmailTracker({
          id: trackingId,
          emailId,
          donorId,
          organizationId,
          sessionId: 0, // This would need to be passed in if tracking a session
        });

        // Process content with tracking
        const structuredContent = [{ piece: content, addNewlineAfter: true, references: [] }];

        // Append signature to email content before processing
        const contentWithSignature = await appendSignatureToEmail(structuredContent as any, {
          donorId: donorId,
          organizationId: organizationId,
          userId: userId,
        });

        const processedContent = await processEmailContentWithTracking(
          contentWithSignature,
          trackingId
        );

        // Save link trackers to database
        if (processedContent.linkTrackers.length > 0) {
          await createLinkTrackers(processedContent.linkTrackers);
        }

        // Create HTML email with tracking pixel
        const htmlEmail = createHtmlEmail(
          donor.email,
          subject,
          processedContent.htmlContent,
          processedContent.textContent,
          formatSenderField(senderInfo)
        );

        // Create message for Microsoft Graph API
        const message = {
          subject: subject,
          body: {
            contentType: 'HTML',
            content: processedContent.htmlContent,
          },
          toRecipients: [
            {
              emailAddress: {
                address: donor.email,
              },
            },
          ],
        };

        // Send email via Microsoft Graph API
        await microsoftClient.api('/me/sendMail').post({
          message,
          saveToSentItems: true,
        });

        // Update the email as sent in the database
        await db
          .update(generatedEmails)
          .set({
            isSent: true,
            sentAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(generatedEmails.id, emailId));

        return {
          success: true,
          message: `Email sent to ${donor.firstName} ${donor.lastName} (${donor.email})`,
        };
      } catch (error) {
        logger.error(
          `Error sending email via Microsoft to donor ${donorId}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to send email: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),
});
