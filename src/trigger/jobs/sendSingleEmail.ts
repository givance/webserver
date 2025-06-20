import { task, logger as triggerLogger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { db } from "@/app/lib/db";
import { emailSendJobs, generatedEmails, emailGenerationSessions, donors } from "@/app/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { createEmailTracker, createLinkTrackers } from "@/app/lib/data/email-tracking";
import { processEmailContentWithTracking, createHtmlEmail } from "@/app/lib/utils/email-tracking/content-processor";
import { generateTrackingId } from "@/app/lib/utils/email-tracking/utils";
import { google } from "googleapis";
import { env } from "@/app/lib/env";

// Gmail OAuth configuration
const GOOGLE_CLIENT_ID = env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = env.GOOGLE_REDIRECT_URI;

// Define the payload schema
const sendSingleEmailPayloadSchema = z.object({
  emailId: z.number(),
  jobId: z.number(),
  sessionId: z.number(),
  organizationId: z.string(),
  userId: z.string(),
});

type SendSingleEmailPayload = z.infer<typeof sendSingleEmailPayloadSchema>;

/**
 * Helper to get Gmail client (reused from gmail router logic)
 */
async function getGmailClientForDonor(donorId: number, organizationId: string, fallbackUserId: string) {
  const { gmailOAuthTokens, staff, users } = await import("@/app/lib/db/schema");
  
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
    throw new Error(`Donor ${donorId} not found`);
  }

  let gmailClient;
  let senderInfo: { name: string; email: string | null } = {
    name: "Organization",
    email: null,
  };

  try {
    // Case 1: Donor assigned to staff with linked email account
    if (donorInfo.assignedStaff?.gmailToken) {
      const staffToken = donorInfo.assignedStaff.gmailToken;
      const staffOAuth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);

      staffOAuth2Client.setCredentials({
        access_token: staffToken.accessToken,
        refresh_token: staffToken.refreshToken,
        expiry_date: staffToken.expiresAt.getTime(),
        scope: staffToken.scope || undefined,
        token_type: staffToken.tokenType || "Bearer",
      });

      await staffOAuth2Client.getAccessToken();
      gmailClient = google.gmail({ version: "v1", auth: staffOAuth2Client });

      senderInfo = {
        name: `${donorInfo.assignedStaff.firstName} ${donorInfo.assignedStaff.lastName}`,
        email: donorInfo.assignedStaff.email,
      };

      triggerLogger.info(`Using assigned staff's Gmail: ${donorInfo.assignedStaff.email}`);
    }
    // Case 2: Donor assigned to staff without linked email account
    else if (donorInfo.assignedStaff) {
      triggerLogger.info(`Assigned staff has no Gmail linked, using org default`);
    }

    // Fall back to organization default account if no staff Gmail
    if (!gmailClient) {
      // Try primary staff first
      const primaryStaff = await db.query.staff.findFirst({
        where: and(eq(staff.organizationId, organizationId), eq(staff.isPrimary, true)),
        with: { gmailToken: true },
      });

      if (primaryStaff?.gmailToken) {
        const primaryOAuth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
        primaryOAuth2Client.setCredentials({
          access_token: primaryStaff.gmailToken.accessToken,
          refresh_token: primaryStaff.gmailToken.refreshToken,
          expiry_date: primaryStaff.gmailToken.expiresAt.getTime(),
          scope: primaryStaff.gmailToken.scope || undefined,
          token_type: primaryStaff.gmailToken.tokenType || "Bearer",
        });

        await primaryOAuth2Client.getAccessToken();
        gmailClient = google.gmail({ version: "v1", auth: primaryOAuth2Client });
        senderInfo = {
          name: `${primaryStaff.firstName} ${primaryStaff.lastName}`,
          email: primaryStaff.email,
        };

        triggerLogger.info(`Using primary staff Gmail: ${primaryStaff.email}`);
      } else {
        // Fall back to user's Gmail
        const userToken = await db.query.gmailOAuthTokens.findFirst({
          where: eq(gmailOAuthTokens.userId, fallbackUserId),
        });

        if (!userToken) {
          throw new Error("No Gmail account connected");
        }

        const userOAuth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
        userOAuth2Client.setCredentials({
          access_token: userToken.accessToken,
          refresh_token: userToken.refreshToken,
          expiry_date: userToken.expiresAt.getTime(),
          scope: userToken.scope || undefined,
          token_type: userToken.tokenType || "Bearer",
        });

        await userOAuth2Client.getAccessToken();
        gmailClient = google.gmail({ version: "v1", auth: userOAuth2Client });

        const [user] = await db.select().from(users).where(eq(users.id, fallbackUserId));
        if (user) {
          senderInfo = {
            name: `${user.firstName} ${user.lastName}`,
            email: user.email,
          };
        }

        triggerLogger.info(`Using user's Gmail: ${user?.email}`);
      }
    }

    return { gmailClient, senderInfo };
  } catch (error) {
    triggerLogger.error(`Failed to get Gmail client: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Trigger job for sending a single scheduled email
 */
export const sendSingleEmailTask = task({
  id: "send-single-email",
  run: async (payload: SendSingleEmailPayload, { ctx }) => {
    const { emailId, jobId, sessionId, organizationId, userId } = payload;

    triggerLogger.info(`Starting to send email ${emailId} for job ${jobId}`);

    try {
      // Update job status to running
      await db
        .update(emailSendJobs)
        .set({
          status: "running",
          attemptCount: sql`${emailSendJobs.attemptCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(emailSendJobs.id, jobId));

      // Check if job was cancelled (pause/cancel scenario)
      const [job] = await db.select().from(emailSendJobs).where(eq(emailSendJobs.id, jobId)).limit(1);
      
      if (!job || job.status === "cancelled") {
        triggerLogger.info(`Job ${jobId} was cancelled, skipping email send`);
        return { status: "cancelled", emailId, jobId };
      }

      // Get email details
      const [email] = await db
        .select({
          id: generatedEmails.id,
          donorId: generatedEmails.donorId,
          subject: generatedEmails.subject,
          structuredContent: generatedEmails.structuredContent,
          sendStatus: generatedEmails.sendStatus,
          isSent: generatedEmails.isSent,
          donor: {
            id: donors.id,
            email: donors.email,
            firstName: donors.firstName,
            lastName: donors.lastName,
          },
        })
        .from(generatedEmails)
        .innerJoin(donors, eq(generatedEmails.donorId, donors.id))
        .where(eq(generatedEmails.id, emailId))
        .limit(1);

      if (!email) {
        throw new Error(`Email ${emailId} not found`);
      }

      // Check if already sent
      if (email.isSent) {
        triggerLogger.warn(`Email ${emailId} already sent, skipping`);
        await db
          .update(emailSendJobs)
          .set({
            status: "completed",
            actualSendTime: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(emailSendJobs.id, jobId));
        return { status: "already_sent", emailId, jobId };
      }

      // Check if cancelled/paused
      if (email.sendStatus === "cancelled" || email.sendStatus === "paused") {
        triggerLogger.info(`Email ${emailId} is ${email.sendStatus}, skipping`);
        await db
          .update(emailSendJobs)
          .set({
            status: "cancelled",
            updatedAt: new Date(),
          })
          .where(eq(emailSendJobs.id, jobId));
        return { status: email.sendStatus, emailId, jobId };
      }

      // Update email status to sending
      await db
        .update(generatedEmails)
        .set({
          sendStatus: "sending",
          updatedAt: new Date(),
        })
        .where(eq(generatedEmails.id, emailId));

      // Get Gmail client and sender info
      const { gmailClient, senderInfo } = await getGmailClientForDonor(
        email.donorId,
        organizationId,
        userId
      );

      // Generate tracking ID
      const trackingId = generateTrackingId();

      // Create email tracker
      await createEmailTracker({
        id: trackingId,
        emailId: email.id,
        donorId: email.donorId,
        organizationId: organizationId,
        sessionId: sessionId,
      });

      // Process content with tracking
      const processedContent = processEmailContentWithTracking(email.structuredContent as any, trackingId);

      // Create link trackers
      if (processedContent.linkTrackers.length > 0) {
        await createLinkTrackers(processedContent.linkTrackers);
      }

      // Create HTML email
      const htmlEmail = createHtmlEmail(
        email.donor.email,
        email.subject,
        processedContent.htmlContent,
        processedContent.textContent,
        senderInfo.email || undefined
      );

      // Encode for Gmail API
      const encodedMessage = Buffer.from(htmlEmail, "utf8")
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      // Send via Gmail API
      const sentMessage = await gmailClient.users.messages.send({
        userId: "me",
        requestBody: {
          raw: encodedMessage,
        },
      });

      // Update email as sent
      await db
        .update(generatedEmails)
        .set({
          isSent: true,
          sentAt: new Date(),
          sendStatus: "sent",
          updatedAt: new Date(),
        })
        .where(eq(generatedEmails.id, emailId));

      // Update job as completed
      await db
        .update(emailSendJobs)
        .set({
          status: "completed",
          actualSendTime: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(emailSendJobs.id, jobId));

      // Check if campaign is complete
      const { EmailCampaignsService } = await import("@/app/lib/services/email-campaigns.service");
      const campaignsService = new EmailCampaignsService();
      await campaignsService.checkAndUpdateCampaignCompletion(sessionId, organizationId);

      triggerLogger.info(
        `Successfully sent email ${emailId} to ${email.donor.email} with tracking ID ${trackingId}, message ID ${sentMessage.data.id}`
      );

      return {
        status: "sent",
        emailId,
        jobId,
        messageId: sentMessage.data.id,
        trackingId,
        linkTrackersCreated: processedContent.linkTrackers.length,
        recipientEmail: email.donor.email,
        senderEmail: senderInfo.email,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      triggerLogger.error(`Failed to send email ${emailId}: ${errorMessage}`);

      // Update job as failed
      await db
        .update(emailSendJobs)
        .set({
          status: "failed",
          lastError: errorMessage,
          updatedAt: new Date(),
        })
        .where(eq(emailSendJobs.id, jobId));

      // Update email status
      await db
        .update(generatedEmails)
        .set({
          sendStatus: "failed",
          updatedAt: new Date(),
        })
        .where(eq(generatedEmails.id, emailId));

      throw error;
    }
  },
});