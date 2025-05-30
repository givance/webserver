import { z } from "zod";
import { google } from "googleapis";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { db } from "@/app/lib/db";
import { gmailOAuthTokens, emailGenerationSessions, generatedEmails, donors } from "@/app/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import {
  processEmailContentWithTracking,
  createHtmlEmail,
  convertStructuredContentToText as convertToText,
} from "@/app/lib/utils/email-tracking/content-processor";
import { generateTrackingId } from "@/app/lib/utils/email-tracking/utils";
import { createEmailTracker, createLinkTrackers } from "@/app/lib/data/email-tracking";

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
 * Helper function to convert structured content to plain text
 */
function convertStructuredContentToText(structuredContent: Array<{ piece: string; addNewlineAfter: boolean }>) {
  return structuredContent
    .map((piece) => piece.piece + (piece.addNewlineAfter ? "\n\n" : ""))
    .join("")
    .trim();
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
        const gmail = await getGmailClient(ctx.auth.user.id);

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

        // Save each email as a draft
        const draftResults = await Promise.allSettled(
          emails.map(async (email) => {
            const textContent = convertToText(email.structuredContent as any);

            const emailMessage = [`To: ${email.donor.email}`, `Subject: ${email.subject}`, ``, textContent].join("\n");

            const encodedMessage = Buffer.from(emailMessage)
              .toString("base64")
              .replace(/\+/g, "-")
              .replace(/\//g, "_")
              .replace(/=+$/, "");

            const draft = await gmail.users.drafts.create({
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

        logger.info(
          `Saved ${successfulDrafts.length} drafts for session ${input.sessionId}, ${failedDrafts.length} failed`
        );

        return {
          success: true,
          draftsCreated: successfulDrafts.length,
          totalEmails: emails.length,
          failedDrafts: failedDrafts.length,
          message: `Successfully saved ${successfulDrafts.length} emails as drafts`,
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
        const gmail = await getGmailClient(ctx.auth.user.id);

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

        // Send each email with tracking
        const sendResults = await Promise.allSettled(
          emails.map(async (email) => {
            // Generate unique tracking ID for this email
            const trackingId = generateTrackingId();

            // Create email tracker in database
            await createEmailTracker({
              id: trackingId,
              emailId: email.id,
              donorId: email.donorId,
              organizationId: session.organizationId,
              sessionId: input.sessionId,
            });

            // Process email content with tracking
            const processedContent = processEmailContentWithTracking(email.structuredContent as any, trackingId);

            // Create link trackers in database
            if (processedContent.linkTrackers.length > 0) {
              await createLinkTrackers(processedContent.linkTrackers);
            }

            // Create complete HTML email with tracking pixel
            const htmlEmail = createHtmlEmail(
              email.donor.email,
              email.subject,
              processedContent.htmlContent,
              processedContent.textContent
            );

            // Encode email for Gmail API
            const encodedMessage = Buffer.from(htmlEmail)
              .toString("base64")
              .replace(/\+/g, "-")
              .replace(/\//g, "_")
              .replace(/=+$/, "");

            // Send email via Gmail API
            const sentMessage = await gmail.users.messages.send({
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
              `Sent tracked email to ${email.donor.email} with tracking ID ${trackingId}, message ID ${sentMessage.data.id}`
            );

            return {
              donorId: email.donorId,
              donorName: `${email.donor.firstName} ${email.donor.lastName}`,
              messageId: sentMessage.data.id,
              trackingId,
              linkTrackersCreated: processedContent.linkTrackers.length,
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
        const gmail = await getGmailClient(ctx.auth.user.id);

        // Get the email with donor information
        const [email] = await db
          .select({
            id: generatedEmails.id,
            sessionId: generatedEmails.sessionId,
            donorId: generatedEmails.donorId,
            subject: generatedEmails.subject,
            structuredContent: generatedEmails.structuredContent,
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

        // Generate unique tracking ID for this email
        const trackingId = generateTrackingId();

        // Create email tracker in database
        await createEmailTracker({
          id: trackingId,
          emailId: email.id,
          donorId: email.donorId,
          organizationId: ctx.auth.user.organizationId,
          sessionId: email.sessionId,
        });

        // Process email content with tracking
        const processedContent = processEmailContentWithTracking(email.structuredContent as any, trackingId);

        // Create link trackers in database
        if (processedContent.linkTrackers.length > 0) {
          await createLinkTrackers(processedContent.linkTrackers);
        }

        // Create complete HTML email with tracking pixel
        const htmlEmail = createHtmlEmail(
          email.donor.email,
          email.subject,
          processedContent.htmlContent,
          processedContent.textContent
        );

        // Encode email for Gmail API
        const encodedMessage = Buffer.from(htmlEmail)
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");

        // Send email via Gmail API
        const sentMessage = await gmail.users.messages.send({
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
          `Sent individual tracked email to ${email.donor.email} with tracking ID ${trackingId}, message ID ${sentMessage.data.id}`
        );

        return {
          success: true,
          donorId: email.donorId,
          donorName: `${email.donor.firstName} ${email.donor.lastName}`,
          messageId: sentMessage.data.id,
          trackingId,
          linkTrackersCreated: processedContent.linkTrackers.length,
          message: `Successfully sent email to ${email.donor.firstName} ${email.donor.lastName}`,
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
        const gmail = await getGmailClient(ctx.auth.user.id);

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

        // Send each email with tracking
        const sendResults = await Promise.allSettled(
          emailsToSend.map(async (email) => {
            // Generate unique tracking ID for this email
            const trackingId = generateTrackingId();

            // Create email tracker in database
            await createEmailTracker({
              id: trackingId,
              emailId: email.id,
              donorId: email.donorId,
              organizationId: session.organizationId,
              sessionId: input.sessionId,
            });

            // Process email content with tracking
            const processedContent = processEmailContentWithTracking(email.structuredContent as any, trackingId);

            // Create link trackers in database
            if (processedContent.linkTrackers.length > 0) {
              await createLinkTrackers(processedContent.linkTrackers);
            }

            // Create complete HTML email with tracking pixel
            const htmlEmail = createHtmlEmail(
              email.donor.email,
              email.subject,
              processedContent.htmlContent,
              processedContent.textContent
            );

            // Encode email for Gmail API
            const encodedMessage = Buffer.from(htmlEmail)
              .toString("base64")
              .replace(/\+/g, "-")
              .replace(/\//g, "_")
              .replace(/=+$/, "");

            // Send email via Gmail API
            const sentMessage = await gmail.users.messages.send({
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
              `Sent tracked email to ${email.donor.email} with tracking ID ${trackingId}, message ID ${sentMessage.data.id}`
            );

            return {
              donorId: email.donorId,
              donorName: `${email.donor.firstName} ${email.donor.lastName}`,
              messageId: sentMessage.data.id,
              trackingId,
              linkTrackersCreated: processedContent.linkTrackers.length,
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
