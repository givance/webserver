import { createEmailTracker, createLinkTrackers } from "@/app/lib/data/email-tracking";
import { db } from "@/app/lib/db";
import { donors, emailGenerationSessions, generatedEmails, gmailOAuthTokens, staff, users } from "@/app/lib/db/schema";
import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { EmailCampaignsService } from "@/app/lib/services/email-campaigns.service";
import {
  createHtmlEmail,
  processEmailContentWithTracking,
  formatSenderField,
} from "@/app/lib/utils/email-tracking/content-processor";
import { generateTrackingId } from "@/app/lib/utils/email-tracking/utils";
import { appendSignatureToEmail } from "@/app/lib/utils/email-with-signature";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { google } from "googleapis";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

// Ensure you have these in your environment variables
const GOOGLE_CLIENT_ID = env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = env.GOOGLE_REDIRECT_URI; // e.g., https://app.givance.ai/api/trpc/gmail.handleOAuthCallback

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
  console.error("Missing Google OAuth credentials in environment variables. Gmail integration will not work.");
}

let oauth2Client: any;
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REDIRECT_URI) {
  oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
} else {
  console.warn(
    "OAuth2Client for Google not initialized due to missing credentials. Gmail features requiring auth will fail."
  );
}

/**
 * Helper function to get authenticated Gmail client for user
 */
async function getGmailClient(userId: string) {
  if (!oauth2Client) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Google OAuth client not configured." });
  }

  const tokenInfo = await db.query.gmailOAuthTokens.findFirst({
    where: eq(gmailOAuthTokens.userId, userId),
  });

  if (!tokenInfo) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Gmail account not connected. Please connect your Gmail account first.",
    });
  }

  // Create a new OAuth2 client instance for this user
  const userOAuth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);

  userOAuth2Client.setCredentials({
    access_token: tokenInfo.accessToken,
    refresh_token: tokenInfo.refreshToken,
    expiry_date: tokenInfo.expiresAt.getTime(),
    scope: tokenInfo.scope || undefined,
    token_type: tokenInfo.tokenType || "Bearer",
  });

  // Refresh token if expired
  try {
    await userOAuth2Client.getAccessToken();
  } catch (error) {
    logger.error(
      `Failed to refresh Gmail token for user ${userId}: ${error instanceof Error ? error.message : String(error)}`
    );
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Gmail token expired. Please reconnect your Gmail account.",
    });
  }

  return google.gmail({ version: "v1", auth: userOAuth2Client });
}

/**
 * Enhanced helper function to get Gmail client based on donor assignment
 * Returns Gmail client, sender info, and signature based on business logic:
 * 1. If donor assigned to staff with linked email account → use staff's Gmail account + staff signature
 * 2. If donor assigned to staff without linked email account → use org default Gmail account + staff signature
 * 3. If donor not assigned → use org default Gmail account & signature
 */
async function getGmailClientForDonor(donorId: number, organizationId: string, fallbackUserId: string) {
  if (!oauth2Client) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Google OAuth client not configured." });
  }

  // Get donor with staff assignment
  const donorInfo = await db.query.donors.findFirst({
    where: and(eq(donors.id, donorId), eq(donors.organizationId, organizationId)),
    with: {
      assignedStaff: {
        with: {
          gmailToken: true,
        },
      },
    },
  });

  if (!donorInfo) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Donor not found",
    });
  }

  // Step 1: Log donor information
  logger.info(
    `[Gmail Client Selection] Donor: ${donorInfo.firstName} ${donorInfo.lastName} (ID: ${donorId}, Email: ${donorInfo.email})`
  );

  // Step 2: Log assigned staff information
  if (donorInfo.assignedStaff) {
    logger.info(
      `[Gmail Client Selection] Assigned Staff: ${donorInfo.assignedStaff.firstName} ${
        donorInfo.assignedStaff.lastName
      } (ID: ${donorInfo.assignedStaff.id}, Email: ${donorInfo.assignedStaff.email}, Has Gmail Token: ${!!donorInfo
        .assignedStaff.gmailToken})`
    );
  } else {
    logger.info(`[Gmail Client Selection] No staff assigned to donor ${donorId}`);
  }

  let gmailClient;
  let senderInfo: { name: string; email: string | null; signature: string | null } = {
    name: "Organization",
    email: null,
    signature: null,
  };
  let shouldUseStaffSignature = false;

  try {
    // Case 1: Donor assigned to staff with linked email account
    if (donorInfo.assignedStaff?.gmailToken) {
      logger.info(
        `[Gmail Client Selection] Case 1: Using assigned staff's Gmail account - Staff: ${donorInfo.assignedStaff.firstName} ${donorInfo.assignedStaff.lastName} (${donorInfo.assignedStaff.email})`
      );

      const staffToken = donorInfo.assignedStaff.gmailToken;
      const staffOAuth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);

      staffOAuth2Client.setCredentials({
        access_token: staffToken.accessToken,
        refresh_token: staffToken.refreshToken,
        expiry_date: staffToken.expiresAt.getTime(),
        scope: staffToken.scope || undefined,
        token_type: staffToken.tokenType || "Bearer",
      });

      // Refresh token if expired
      try {
        await staffOAuth2Client.getAccessToken();
        gmailClient = google.gmail({ version: "v1", auth: staffOAuth2Client });

        senderInfo = {
          name: `${donorInfo.assignedStaff.firstName} ${donorInfo.assignedStaff.lastName}`,
          email: donorInfo.assignedStaff.email,
          signature: donorInfo.assignedStaff.signature,
        };

        logger.info(
          `[Gmail Client Selection] ✓ Successfully authenticated with assigned staff's Gmail account for donor ${donorId} - Using email: ${donorInfo.assignedStaff.email}`
        );
      } catch (error) {
        logger.warn(
          `[Gmail Client Selection] ✗ Assigned staff's Gmail token expired for staff ${donorInfo.assignedStaff.id} (${
            donorInfo.assignedStaff.email
          }), reason: ${
            error instanceof Error ? error.message : String(error)
          } - Will fallback to organization default account`
        );
        // Fall through to org default logic
        gmailClient = null;
        shouldUseStaffSignature = true;
      }
    }
    // Case 2: Donor assigned to staff without linked email account
    else if (donorInfo.assignedStaff) {
      logger.info(
        `[Gmail Client Selection] Case 2: Assigned staff ${donorInfo.assignedStaff.firstName} ${donorInfo.assignedStaff.lastName} (${donorInfo.assignedStaff.email}) has no linked Gmail account - Will use organization default email with staff signature`
      );
      shouldUseStaffSignature = true;
    }
    // Case 3: Donor not assigned to staff - check for primary staff
    else {
      logger.info(`[Gmail Client Selection] Case 3: Donor not assigned to any staff - Checking for primary staff`);

      // Try to get primary staff for the organization
      const primaryStaffInfo = await db.query.staff.findFirst({
        where: and(eq(staff.organizationId, organizationId), eq(staff.isPrimary, true)),
        with: {
          gmailToken: true,
        },
      });

      if (primaryStaffInfo?.gmailToken) {
        logger.info(
          `[Gmail Client Selection] Found primary staff with Gmail account - Staff: ${primaryStaffInfo.firstName} ${primaryStaffInfo.lastName} (${primaryStaffInfo.email})`
        );

        const primaryStaffToken = primaryStaffInfo.gmailToken;
        const primaryStaffOAuth2Client = new google.auth.OAuth2(
          GOOGLE_CLIENT_ID,
          GOOGLE_CLIENT_SECRET,
          GOOGLE_REDIRECT_URI
        );

        primaryStaffOAuth2Client.setCredentials({
          access_token: primaryStaffToken.accessToken,
          refresh_token: primaryStaffToken.refreshToken,
          expiry_date: primaryStaffToken.expiresAt.getTime(),
          scope: primaryStaffToken.scope || undefined,
          token_type: primaryStaffToken.tokenType || "Bearer",
        });

        // Refresh token if expired
        try {
          await primaryStaffOAuth2Client.getAccessToken();
          gmailClient = google.gmail({ version: "v1", auth: primaryStaffOAuth2Client });

          senderInfo = {
            name: `${primaryStaffInfo.firstName} ${primaryStaffInfo.lastName}`,
            email: primaryStaffInfo.email,
            signature: primaryStaffInfo.signature,
          };

          logger.info(
            `[Gmail Client Selection] ✓ Successfully authenticated with primary staff's Gmail account for donor ${donorId} - Using email: ${primaryStaffInfo.email}`
          );
        } catch (error) {
          logger.warn(
            `[Gmail Client Selection] ✗ Primary staff's Gmail token expired for staff ${primaryStaffInfo.id} (${
              primaryStaffInfo.email
            }), reason: ${
              error instanceof Error ? error.message : String(error)
            } - Will fallback to organization default account`
          );
          // Fall through to org default logic
          gmailClient = null;
          shouldUseStaffSignature = true;
        }
      } else if (primaryStaffInfo) {
        logger.info(
          `[Gmail Client Selection] Found primary staff ${primaryStaffInfo.firstName} ${primaryStaffInfo.lastName} (${primaryStaffInfo.email}) but no linked Gmail account - Will use organization default email with primary staff signature`
        );
        shouldUseStaffSignature = true;
      } else {
        logger.info(
          `[Gmail Client Selection] No primary staff found for organization ${organizationId} - Will use organization default email and signature`
        );
      }
    }

    // If we don't have a staff Gmail client, use organization default (fallback user)
    if (!gmailClient) {
      logger.info(
        `[Gmail Client Selection] Using organization default Gmail account (fallback user: ${fallbackUserId})`
      );

      const fallbackTokenInfo = await db.query.gmailOAuthTokens.findFirst({
        where: eq(gmailOAuthTokens.userId, fallbackUserId),
      });

      if (!fallbackTokenInfo) {
        logger.error(`[Gmail Client Selection] ✗ No Gmail token found for fallback user ${fallbackUserId}`);
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No Gmail account available. Please connect a Gmail account.",
        });
      }

      const fallbackOAuth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);

      fallbackOAuth2Client.setCredentials({
        access_token: fallbackTokenInfo.accessToken,
        refresh_token: fallbackTokenInfo.refreshToken,
        expiry_date: fallbackTokenInfo.expiresAt.getTime(),
        scope: fallbackTokenInfo.scope || undefined,
        token_type: fallbackTokenInfo.tokenType || "Bearer",
      });

      // Refresh token if expired
      try {
        await fallbackOAuth2Client.getAccessToken();
      } catch (error) {
        logger.error(
          `[Gmail Client Selection] ✗ Failed to refresh fallback Gmail token for user ${fallbackUserId}, reason: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Gmail token expired. Please reconnect your Gmail account.",
        });
      }

      gmailClient = google.gmail({ version: "v1", auth: fallbackOAuth2Client });

      // Get fallback user info
      const fallbackUser = await db.query.users.findFirst({
        where: eq(users.id, fallbackUserId),
      });

      // If we should use staff signature, get it; otherwise use fallback user signature or none
      if (shouldUseStaffSignature && donorInfo.assignedStaff) {
        senderInfo = {
          name: `${donorInfo.assignedStaff.firstName} ${donorInfo.assignedStaff.lastName}`,
          email: fallbackUser?.email || null,
          signature: donorInfo.assignedStaff.signature,
        };
        logger.info(
          `[Gmail Client Selection] Using fallback Gmail (${fallbackUser?.email}) with assigned staff signature from ${donorInfo.assignedStaff.firstName} ${donorInfo.assignedStaff.lastName}`
        );
      } else if (shouldUseStaffSignature) {
        // Check for primary staff signature when no assigned staff
        const primaryStaffInfo = await db.query.staff.findFirst({
          where: and(eq(staff.organizationId, organizationId), eq(staff.isPrimary, true)),
        });

        if (primaryStaffInfo) {
          senderInfo = {
            name: `${primaryStaffInfo.firstName} ${primaryStaffInfo.lastName}`,
            email: fallbackUser?.email || null,
            signature: primaryStaffInfo.signature,
          };
          logger.info(
            `[Gmail Client Selection] Using fallback Gmail (${fallbackUser?.email}) with primary staff signature from ${primaryStaffInfo.firstName} ${primaryStaffInfo.lastName}`
          );
        } else {
          senderInfo = {
            name: fallbackUser ? `${fallbackUser.firstName} ${fallbackUser.lastName}` : "Organization",
            email: fallbackUser?.email || null,
            signature: fallbackUser?.emailSignature || null,
          };
          logger.info(
            `[Gmail Client Selection] Using fallback Gmail (${fallbackUser?.email}) with fallback user signature from ${fallbackUser?.firstName} ${fallbackUser?.lastName}`
          );
        }
      } else {
        senderInfo = {
          name: fallbackUser ? `${fallbackUser.firstName} ${fallbackUser.lastName}` : "Organization",
          email: fallbackUser?.email || null,
          signature: fallbackUser?.emailSignature || null,
        };
        logger.info(
          `[Gmail Client Selection] Using fallback Gmail (${fallbackUser?.email}) with fallback user signature from ${fallbackUser?.firstName} ${fallbackUser?.lastName}`
        );
      }
    }

    // Determine account type and staff ID based on how the gmail client was set up
    let accountType: "staff" | "primary" | "fallback" = "fallback";
    let staffId: number | null = null;

    if (donorInfo.assignedStaff?.gmailToken) {
      accountType = "staff";
      staffId = donorInfo.assignedStaff.id;
    } else {
      // Check if we're using primary staff signature/name (indicating primary staff was used)
      const primaryStaffInfo = await db.query.staff.findFirst({
        where: and(eq(staff.organizationId, organizationId), eq(staff.isPrimary, true)),
      });

      if (primaryStaffInfo && senderInfo.name === `${primaryStaffInfo.firstName} ${primaryStaffInfo.lastName}`) {
        accountType = "primary";
        staffId = primaryStaffInfo.id;
      }
    }

    // Final summary log
    logger.info(
      `[Gmail Client Selection] ✓ Final Result - Donor: ${donorId}, Account Type: ${accountType}, Sender: ${
        senderInfo.name
      } (${senderInfo.email}), Staff ID: ${staffId || "N/A"}`
    );

    return {
      gmailClient,
      senderInfo,
      accountType,
      staffId,
    };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    logger.error(
      `[Gmail Client Selection] ✗ Error for donor ${donorId}: ${error instanceof Error ? error.message : String(error)}`
    );
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to get Gmail client for donor",
    });
  }
}

/**
 * Helper function to convert structured content to plain text
 */
function convertStructuredContentToText(structuredContent: Array<{ piece: string; addNewlineAfter: boolean }>) {
  return structuredContent
    .map((piece) => piece.piece + (piece.addNewlineAfter ? "\n\n" : ""))
    .join("")
    .trim();
}

/**
 * Shared utility function for processing emails for sending/drafts
 * This ensures consistent email processing across send and draft operations
 */
/**
 * Converts plain text email content to structured format for processing
 */
function convertPlainTextToStructuredContent(
  emailContent: string
): Array<{ piece: string; references: string[]; addNewlineAfter: boolean }> {
  if (!emailContent || !emailContent.trim()) {
    return [{ piece: "", references: [], addNewlineAfter: false }];
  }

  // Split by double newlines to create paragraphs
  const paragraphs = emailContent.split(/\n\s*\n/);

  return paragraphs.map((paragraph, index) => ({
    piece: paragraph.trim(),
    references: [],
    addNewlineAfter: index < paragraphs.length - 1, // Add newline after all except the last
  }));
}

async function processEmailForDelivery(
  email: {
    id: number;
    donorId: number;
    subject: string;
    structuredContent: any;
    emailContent?: string | null; // Add support for new format, can be null from database
    donor: {
      firstName: string;
      lastName: string;
      email: string;
    };
  },
  sessionId: number,
  organizationId: string,
  userId: string
) {
  // Get Gmail client and sender info based on donor assignment
  const { gmailClient, senderInfo, accountType, staffId } = await getGmailClientForDonor(
    email.donorId,
    organizationId,
    userId
  );

  // Generate unique tracking ID for this email
  const trackingId = generateTrackingId();

  // Create email tracker in database
  await createEmailTracker({
    id: trackingId,
    emailId: email.id,
    donorId: email.donorId,
    organizationId: organizationId,
    sessionId: sessionId,
  });

  let contentWithSignature;

  // Handle both new format (emailContent) and legacy format (structuredContent)
  if (email.emailContent && email.emailContent.trim().length > 0) {
    // New format: Convert plain text to structured content first
    logger.info(`Processing new format email ${email.id} with emailContent`);
    const structuredFromPlainText = convertPlainTextToStructuredContent(email.emailContent);

    // Append signature to the converted structured content
    contentWithSignature = await appendSignatureToEmail(structuredFromPlainText, {
      donorId: email.donorId,
      organizationId: organizationId,
      userId: userId,
    });
  } else if (email.structuredContent) {
    // Legacy format: Use existing logic
    logger.info(`Processing legacy format email ${email.id} with structuredContent`);
    contentWithSignature = await appendSignatureToEmail(email.structuredContent as any, {
      donorId: email.donorId,
      organizationId: organizationId,
      userId: userId,
    });
  } else {
    // Fallback: Empty content
    logger.warn(`Email ${email.id} has no content in either format, using empty content`);
    contentWithSignature = await appendSignatureToEmail([], {
      donorId: email.donorId,
      organizationId: organizationId,
      userId: userId,
    });
  }

  // Process email content with tracking (including the appended signature)
  const processedContent = await processEmailContentWithTracking(contentWithSignature, trackingId);

  // Debug logging for signature content
  const signaturePieces = contentWithSignature.filter(
    (piece: any) => piece.references && piece.references.includes("signature")
  );
  if (signaturePieces.length > 0) {
    logger.info(
      `Processing ${signaturePieces.length} signature pieces for email ${
        email.id
      }. First signature contains HTML: ${signaturePieces[0].piece.includes("<img")}`
    );
  }

  // Create link trackers in database
  if (processedContent.linkTrackers.length > 0) {
    await createLinkTrackers(processedContent.linkTrackers);
  }

  // Create complete HTML email with tracking pixel
  const htmlEmail = createHtmlEmail(
    email.donor.email,
    email.subject,
    processedContent.htmlContent,
    processedContent.textContent,
    formatSenderField(senderInfo)
  );

  // Debug logging for final HTML content
  if (processedContent.htmlContent.includes("<img")) {
    logger.info(
      `Final HTML content for email ${email.id} contains images: ${processedContent.htmlContent.includes("data:image")}`
    );
  }

  // Encode email for Gmail API
  const encodedMessage = Buffer.from(htmlEmail, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return {
    gmailClient,
    senderInfo,
    accountType,
    staffId,
    trackingId,
    processedContent,
    htmlEmail,
    encodedMessage,
  };
}

export const gmailRouter = router({
  getGmailAuthUrl: protectedProcedure.mutation(async ({ ctx }) => {
    if (!oauth2Client) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Google OAuth client not configured." });
    }
    const scopes = [
      "https://www.googleapis.com/auth/gmail.compose",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/userinfo.email", // To get user's email for verification
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline", // Important to get a refresh token
      scope: scopes,
      prompt: "consent", // Ensures the consent screen is shown, useful for re-authentication or changing scopes
      // Include state parameter for security if needed, store it and verify in callback
      // state: generateSomeSecureState(),
    });

    return { authUrl };
  }),

  handleOAuthCallback: protectedProcedure
    .input(z.object({ code: z.string(), state: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (!oauth2Client) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Google OAuth client not configured." });
      }
      // Optional: Verify the state parameter here if you used one
      // if (input.state !== getStoredState()) { throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid state parameter' }); }

      try {
        const { tokens } = await oauth2Client.getToken(input.code);
        oauth2Client.setCredentials(tokens);

        if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date || !tokens.scope) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to retrieve all necessary tokens from Google.",
          });
        }

        // Optional: Get user's email from Google to verify or link account
        // const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        // const profile = await gmail.users.getProfile({ userId: 'me' });
        // const emailAddress = profile.data.emailAddress;
        // if (emailAddress !== ctx.auth.user.email) { /* Handle mismatch if necessary */ }

        const userId = ctx.auth.user.id;

        // Upsert the token information
        await db
          .insert(gmailOAuthTokens)
          .values({
            userId: userId,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: new Date(tokens.expiry_date),
            scope: tokens.scope,
            tokenType: tokens.token_type || "Bearer",
          })
          .onConflictDoUpdate({
            target: gmailOAuthTokens.userId,
            set: {
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token, // Important: Google might only send refresh_token on the first authorization
              expiresAt: new Date(tokens.expiry_date),
              scope: tokens.scope,
              tokenType: tokens.token_type || "Bearer",
              updatedAt: new Date(),
            },
          });

        return { success: true, message: "Gmail account connected successfully." };
      } catch (error: any) {
        console.error("Error handling Gmail OAuth callback:", error);
        // Check if the error is from Google API and format it
        if (error.response && error.response.data && error.response.data.error_description) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Google API Error: ${error.response.data.error_description}`,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message || "Failed to process Gmail OAuth callback.",
        });
      }
    }),

  getGmailConnectionStatus: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.auth.user.id;
    const userEmail = ctx.auth.user.email; // Clerk provides the primary email

    const tokenInfo = await db.query.gmailOAuthTokens.findFirst({
      where: eq(gmailOAuthTokens.userId, userId),
      columns: {
        // We only need to know if it exists and maybe when it expires
        // but for now, just checking existence is enough.
        // We'll also return the user's email from Clerk's user object
        id: true,
      },
    });

    if (tokenInfo && userEmail) {
      return {
        isConnected: true,
        email: userEmail,
        message: `Connected with ${userEmail}`,
      };
    }

    return {
      isConnected: false,
      email: null,
      message: "Gmail account not connected.",
    };
  }),

  /**
   * Disconnect Gmail account for the current user
   */
  disconnectGmail: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.auth.user.id;

    // Delete the Gmail token for this user
    await db.delete(gmailOAuthTokens).where(eq(gmailOAuthTokens.userId, userId));

    logger.info(`Gmail account disconnected for user ${userId}`);

    return {
      success: true,
      message: "Gmail account disconnected successfully.",
    };
  }),

  /**
   * Save job emails as drafts in Gmail
   */
  saveToDraft: protectedProcedure
    .input(
      z.object({
        sessionId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Get session and emails
        const [session] = await db
          .select()
          .from(emailGenerationSessions)
          .where(eq(emailGenerationSessions.id, input.sessionId))
          .limit(1);

        if (!session || session.organizationId !== ctx.auth.user.organizationId) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Session not found",
          });
        }

        // Get all generated emails for this session
        const emails = await db
          .select({
            id: generatedEmails.id,
            donorId: generatedEmails.donorId,
            subject: generatedEmails.subject,
            structuredContent: generatedEmails.structuredContent,
            emailContent: generatedEmails.emailContent, // Add new format field
            donor: {
              firstName: donors.firstName,
              lastName: donors.lastName,
              email: donors.email,
            },
          })
          .from(generatedEmails)
          .innerJoin(donors, eq(generatedEmails.donorId, donors.id))
          .where(eq(generatedEmails.sessionId, input.sessionId));

        if (emails.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "No emails found for this session",
          });
        }

        // Save each email as a draft using staff-specific accounts
        const draftResults = await Promise.allSettled(
          emails.map(async (email) => {
            // Use shared email processing utility
            const { gmailClient, senderInfo, accountType, staffId, trackingId, processedContent, encodedMessage } =
              await processEmailForDelivery(email, input.sessionId, session.organizationId, ctx.auth.user.id);

            // Create draft via Gmail API
            const draft = await gmailClient.users.drafts.create({
              userId: "me",
              requestBody: {
                message: {
                  raw: encodedMessage,
                },
              },
            });

            return {
              donorId: email.donorId,
              donorName: `${email.donor.firstName} ${email.donor.lastName}`,
              draftId: draft.data.id,
              trackingId,
              linkTrackersCreated: processedContent.linkTrackers.length,
              senderInfo: {
                name: senderInfo.name,
                email: senderInfo.email,
                accountType,
                staffId,
              },
              success: true,
            };
          })
        );

        const successfulDrafts = draftResults
          .filter((result): result is PromiseFulfilledResult<any> => result.status === "fulfilled")
          .map((result) => result.value);

        const failedDrafts = draftResults
          .filter((result): result is PromiseRejectedResult => result.status === "rejected")
          .map((result) => result.reason);

        const totalLinkTrackers = successfulDrafts.reduce((sum, result) => sum + result.linkTrackersCreated, 0);

        logger.info(
          `Saved ${successfulDrafts.length} tracked drafts for session ${input.sessionId}, ${failedDrafts.length} failed, ${totalLinkTrackers} link trackers created. Using appropriate staff-specific Gmail accounts based on donor assignments.`
        );

        return {
          success: true,
          draftsCreated: successfulDrafts.length,
          totalEmails: emails.length,
          failedDrafts: failedDrafts.length,
          linkTrackersCreated: totalLinkTrackers,
          message: `Successfully saved ${successfulDrafts.length} emails as tracked drafts`,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        logger.error(
          `Failed to save drafts for session ${input.sessionId}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to save emails as drafts",
        });
      }
    }),

  /**
   * Send job emails via Gmail
   */
  sendEmails: protectedProcedure
    .input(
      z.object({
        sessionId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      logger.info(`Sending emails for session ${input.sessionId}`);
      try {
        // Get session and emails
        const [session] = await db
          .select()
          .from(emailGenerationSessions)
          .where(eq(emailGenerationSessions.id, input.sessionId))
          .limit(1);

        if (!session || session.organizationId !== ctx.auth.user.organizationId) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Session not found",
          });
        }

        // Get all generated emails for this session
        const emails = await db
          .select({
            id: generatedEmails.id,
            donorId: generatedEmails.donorId,
            subject: generatedEmails.subject,
            structuredContent: generatedEmails.structuredContent,
            emailContent: generatedEmails.emailContent, // Add new format field
            donor: {
              firstName: donors.firstName,
              lastName: donors.lastName,
              email: donors.email,
            },
          })
          .from(generatedEmails)
          .innerJoin(donors, eq(generatedEmails.donorId, donors.id))
          .where(eq(generatedEmails.sessionId, input.sessionId));

        if (emails.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "No emails found for this session",
          });
        }

        // Send each email with tracking using staff-specific accounts
        const sendResults = await Promise.allSettled(
          emails.map(async (email) => {
            // Use shared email processing utility
            const { gmailClient, senderInfo, accountType, staffId, trackingId, processedContent, encodedMessage } =
              await processEmailForDelivery(email, input.sessionId, session.organizationId, ctx.auth.user.id);

            // Send email via Gmail API
            const sentMessage = await gmailClient.users.messages.send({
              userId: "me",
              requestBody: {
                raw: encodedMessage,
              },
            });

            // Mark email as sent in database
            await db
              .update(generatedEmails)
              .set({
                isSent: true,
                sentAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(generatedEmails.id, email.id));

            // Check if all emails in the session have been sent and update campaign status
            const campaignsService = new EmailCampaignsService();
            await campaignsService.checkAndUpdateCampaignCompletion(input.sessionId, session.organizationId);

            logger.info(
              `Sent tracked email to ${email.donor.email} with tracking ID ${trackingId}, message ID ${sentMessage.data.id}, account type: ${accountType}, sender: ${senderInfo.name}`
            );

            return {
              donorId: email.donorId,
              donorName: `${email.donor.firstName} ${email.donor.lastName}`,
              messageId: sentMessage.data.id,
              trackingId,
              linkTrackersCreated: processedContent.linkTrackers.length,
              senderInfo: {
                name: senderInfo.name,
                email: senderInfo.email,
                accountType,
                staffId,
              },
              success: true,
            };
          })
        );

        const successfulSends = sendResults
          .filter((result): result is PromiseFulfilledResult<any> => result.status === "fulfilled")
          .map((result) => result.value);

        const failedSends = sendResults
          .filter((result): result is PromiseRejectedResult => result.status === "rejected")
          .map((result) => result.reason);

        const totalLinkTrackers = successfulSends.reduce((sum, result) => sum + result.linkTrackersCreated, 0);

        logger.info(
          `Sent ${successfulSends.length} tracked emails for session ${input.sessionId}, ${failedSends.length} failed, ${totalLinkTrackers} link trackers created`
        );

        return {
          success: true,
          emailsSent: successfulSends.length,
          totalEmails: emails.length,
          failedSends: failedSends.length,
          linkTrackersCreated: totalLinkTrackers,
          message: `Successfully sent ${successfulSends.length} emails with tracking`,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        logger.error(
          `Failed to send emails for session ${input.sessionId}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to send emails",
        });
      }
    }),

  /**
   * Send an individual email
   */
  sendIndividualEmail: protectedProcedure
    .input(
      z.object({
        emailId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Get the email with donor information
        const [email] = await db
          .select({
            id: generatedEmails.id,
            sessionId: generatedEmails.sessionId,
            donorId: generatedEmails.donorId,
            subject: generatedEmails.subject,
            structuredContent: generatedEmails.structuredContent,
            emailContent: generatedEmails.emailContent, // Add new format field
            isSent: generatedEmails.isSent,
            donor: {
              firstName: donors.firstName,
              lastName: donors.lastName,
              email: donors.email,
            },
          })
          .from(generatedEmails)
          .innerJoin(donors, eq(generatedEmails.donorId, donors.id))
          .innerJoin(emailGenerationSessions, eq(generatedEmails.sessionId, emailGenerationSessions.id))
          .where(
            and(
              eq(generatedEmails.id, input.emailId),
              eq(emailGenerationSessions.organizationId, ctx.auth.user.organizationId)
            )
          )
          .limit(1);

        if (!email) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Email not found",
          });
        }

        if (email.isSent) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Email has already been sent",
          });
        }

        // Use shared email processing utility
        const { gmailClient, senderInfo, accountType, staffId, trackingId, processedContent, encodedMessage } =
          await processEmailForDelivery(email, email.sessionId, ctx.auth.user.organizationId, ctx.auth.user.id);

        // Send email via Gmail API
        const sentMessage = await gmailClient.users.messages.send({
          userId: "me",
          requestBody: {
            raw: encodedMessage,
          },
        });

        // Mark email as sent in database
        await db
          .update(generatedEmails)
          .set({
            isSent: true,
            sentAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(generatedEmails.id, email.id));

        logger.info(
          `Sent individual tracked email to ${email.donor.email} with tracking ID ${trackingId}, message ID ${sentMessage.data.id}, account type: ${accountType}, sender: ${senderInfo.name}`
        );

        return {
          success: true,
          donorId: email.donorId,
          donorName: `${email.donor.firstName} ${email.donor.lastName}`,
          messageId: sentMessage.data.id,
          trackingId,
          linkTrackersCreated: processedContent.linkTrackers.length,
          senderInfo: {
            name: senderInfo.name,
            email: senderInfo.email,
            accountType,
            staffId,
          },
          message: `Successfully sent email to ${email.donor.firstName} ${email.donor.lastName} from ${senderInfo.name}`,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        logger.error(
          `Failed to send individual email ${input.emailId}: ${error instanceof Error ? error.message : String(error)}`
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to send individual email",
        });
      }
    }),

  /**
   * Send bulk emails with options (all or unsent only)
   */
  sendBulkEmails: protectedProcedure
    .input(
      z.object({
        sessionId: z.number(),
        sendType: z.enum(["all", "unsent"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      logger.info(`Sending ${input.sendType} emails for session ${input.sessionId}`);
      try {
        // Get session and emails
        const [session] = await db
          .select()
          .from(emailGenerationSessions)
          .where(eq(emailGenerationSessions.id, input.sessionId))
          .limit(1);

        if (!session || session.organizationId !== ctx.auth.user.organizationId) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Session not found",
          });
        }

        // Get emails based on send type
        const whereConditions = [eq(generatedEmails.sessionId, input.sessionId)];
        if (input.sendType === "unsent") {
          whereConditions.push(eq(generatedEmails.isSent, false));
        }

        const emails = await db
          .select({
            id: generatedEmails.id,
            donorId: generatedEmails.donorId,
            subject: generatedEmails.subject,
            structuredContent: generatedEmails.structuredContent,
            emailContent: generatedEmails.emailContent, // Add new format field
            isSent: generatedEmails.isSent,
            donor: {
              firstName: donors.firstName,
              lastName: donors.lastName,
              email: donors.email,
            },
          })
          .from(generatedEmails)
          .innerJoin(donors, eq(generatedEmails.donorId, donors.id))
          .where(whereConditions.length > 1 ? and(...whereConditions) : whereConditions[0]);

        if (emails.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message:
              input.sendType === "unsent"
                ? "No unsent emails found for this session"
                : "No emails found for this session",
          });
        }

        // Filter out already sent emails if sending all
        const emailsToSend = input.sendType === "all" ? emails.filter((email) => !email.isSent) : emails;

        if (emailsToSend.length === 0) {
          return {
            success: true,
            emailsSent: 0,
            totalEmails: emails.length,
            failedSends: 0,
            linkTrackersCreated: 0,
            message: "All emails have already been sent",
          };
        }

        // Send each email with tracking using staff-specific accounts
        const sendResults = await Promise.allSettled(
          emailsToSend.map(async (email) => {
            // Use shared email processing utility
            const { gmailClient, senderInfo, accountType, staffId, trackingId, processedContent, encodedMessage } =
              await processEmailForDelivery(email, input.sessionId, session.organizationId, ctx.auth.user.id);

            // Send email via Gmail API
            const sentMessage = await gmailClient.users.messages.send({
              userId: "me",
              requestBody: {
                raw: encodedMessage,
              },
            });

            // Mark email as sent in database
            await db
              .update(generatedEmails)
              .set({
                isSent: true,
                sentAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(generatedEmails.id, email.id));

            // Check if all emails in the session have been sent and update campaign status
            const campaignsService = new EmailCampaignsService();
            await campaignsService.checkAndUpdateCampaignCompletion(input.sessionId, session.organizationId);

            logger.info(
              `Sent tracked email to ${email.donor.email} with tracking ID ${trackingId}, message ID ${sentMessage.data.id}, account type: ${accountType}, sender: ${senderInfo.name}`
            );

            return {
              donorId: email.donorId,
              donorName: `${email.donor.firstName} ${email.donor.lastName}`,
              messageId: sentMessage.data.id,
              trackingId,
              linkTrackersCreated: processedContent.linkTrackers.length,
              senderInfo: {
                name: senderInfo.name,
                email: senderInfo.email,
                accountType,
                staffId,
              },
              success: true,
            };
          })
        );

        const successfulSends = sendResults
          .filter((result): result is PromiseFulfilledResult<any> => result.status === "fulfilled")
          .map((result) => result.value);

        const failedSends = sendResults
          .filter((result): result is PromiseRejectedResult => result.status === "rejected")
          .map((result) => result.reason);

        const totalLinkTrackers = successfulSends.reduce((sum, result) => sum + result.linkTrackersCreated, 0);

        logger.info(
          `Sent ${successfulSends.length} tracked emails for session ${input.sessionId} (${input.sendType}), ${failedSends.length} failed, ${totalLinkTrackers} link trackers created`
        );

        return {
          success: true,
          emailsSent: successfulSends.length,
          totalEmails: emailsToSend.length,
          failedSends: failedSends.length,
          linkTrackersCreated: totalLinkTrackers,
          message: `Successfully sent ${successfulSends.length} ${input.sendType} emails with tracking`,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        logger.error(
          `Failed to send ${input.sendType} emails for session ${input.sessionId}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to send ${input.sendType} emails`,
        });
      }
    }),
});
