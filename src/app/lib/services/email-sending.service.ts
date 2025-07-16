import { db } from '@/app/lib/db';
import {
  emailSendJobs,
  generatedEmails,
  emailGenerationSessions,
  donors,
  gmailOAuthTokens,
  microsoftOAuthTokens,
  staffMicrosoftTokens,
  staff,
  users,
} from '@/app/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { createEmailTracker, createLinkTrackers } from '@/app/lib/data/email-tracking';
import {
  processEmailContentWithTracking,
  createHtmlEmail,
  formatSenderField,
} from '@/app/lib/utils/email-tracking/content-processor';
import { generateTrackingId } from '@/app/lib/utils/email-tracking/utils';
import { google } from 'googleapis';
import { Client } from '@microsoft/microsoft-graph-client';
import { env } from '@/app/lib/env';
import { appendSignatureToEmail } from '@/app/lib/utils/email-with-signature';
import { EmailCampaignsService } from '@/app/lib/services/email-campaigns.service';
import { logger } from '@/app/lib/logger';
import 'isomorphic-fetch';

// OAuth configurations
const GOOGLE_CLIENT_ID = env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = env.GOOGLE_REDIRECT_URI;

const MICROSOFT_CLIENT_ID = env.MICROSOFT_APPLICATION_ID;
const MICROSOFT_CLIENT_SECRET = env.MICROSOFT_CLIENT_SECRET;
const MICROSOFT_REDIRECT_URI = env.MICROSOFT_REDIRECT_URI;

export interface SendEmailPayload {
  emailId: number;
  jobId?: number;
  sessionId: number;
  organizationId: string;
  userId: string;
}

export interface SendEmailResult {
  status: 'sent' | 'cancelled' | 'already_sent' | 'failed';
  emailId: number;
  jobId?: number;
  messageId?: string;
  trackingId?: string;
  linkTrackersCreated?: number;
  recipientEmail?: string;
  senderEmail?: string | null;
  error?: string;
}

/**
 * Converts plain text email content to structured format for processing
 */
function convertPlainTextToStructuredContent(
  emailContent: string
): Array<{ piece: string; references: string[]; addNewlineAfter: boolean }> {
  if (!emailContent || !emailContent.trim()) {
    return [{ piece: '', references: [], addNewlineAfter: false }];
  }

  // Split by double newlines to create paragraphs
  const paragraphs = emailContent.split(/\n\s*\n/);

  return paragraphs.map((paragraph, index) => ({
    piece: paragraph.trim(),
    references: [],
    addNewlineAfter: index < paragraphs.length - 1, // Add newline after all except the last
  }));
}

type EmailClient = {
  type: 'gmail' | 'microsoft';
  client: any; // Gmail API client or Microsoft Graph client
  senderInfo: {
    name: string;
    email: string | null;
    signature?: string | null;
  };
};

/**
 * Helper to get email client (Gmail or Microsoft) for donor
 */
async function getEmailClientForDonor(
  donorId: number,
  organizationId: string,
  fallbackUserId: string
): Promise<EmailClient> {
  // Get donor with staff assignment
  const donorInfo = await db.query.donors.findFirst({
    where: and(eq(donors.id, donorId), eq(donors.organizationId, organizationId)),
    with: {
      assignedStaff: {
        with: {
          gmailToken: true,
          microsoftToken: true,
        },
      },
    },
  });

  if (!donorInfo) {
    throw new Error(`Donor ${donorId} not found`);
  }

  let emailClient: EmailClient | null = null;

  try {
    // Case 1: Donor assigned to staff with linked email account
    if (donorInfo.assignedStaff) {
      const staff = donorInfo.assignedStaff;

      // Check Gmail first
      if (staff.gmailToken) {
        const staffToken = staff.gmailToken;
        const staffOAuth2Client = new google.auth.OAuth2(
          GOOGLE_CLIENT_ID,
          GOOGLE_CLIENT_SECRET,
          GOOGLE_REDIRECT_URI
        );

        staffOAuth2Client.setCredentials({
          access_token: staffToken.accessToken,
          refresh_token: staffToken.refreshToken,
          expiry_date: staffToken.expiresAt.getTime(),
          scope: staffToken.scope || undefined,
          token_type: staffToken.tokenType || 'Bearer',
        });

        await staffOAuth2Client.getAccessToken();
        const gmailClient = google.gmail({ version: 'v1', auth: staffOAuth2Client });

        emailClient = {
          type: 'gmail',
          client: gmailClient,
          senderInfo: {
            name: `${staff.firstName} ${staff.lastName}`,
            email: staff.email,
            signature: staff.signature,
          },
        };

        logger.info(`Using assigned staff's Gmail: ${staff.email}`);
      }
      // Check Microsoft if no Gmail
      else if (staff.microsoftToken) {
        const staffToken = staff.microsoftToken;

        // Check if token is expired and refresh if needed
        const now = new Date();
        let accessToken = staffToken.accessToken;

        if (now >= staffToken.expiresAt) {
          logger.info(`Microsoft token expired for staff ${staff.id}, attempting refresh`, {
            staffId: staff.id,
            tokenExpiresAt: staffToken.expiresAt,
            currentTime: now,
            daysSinceExpiry: Math.floor(
              (now.getTime() - staffToken.expiresAt.getTime()) / (1000 * 60 * 60 * 24)
            ),
            hasRefreshToken: !!staffToken.refreshToken,
            refreshTokenLength: staffToken.refreshToken ? staffToken.refreshToken.length : 0,
          });
          try {
            // Refresh the Microsoft token
            const refreshResponse = await fetch(
              'https://login.microsoftonline.com/common/oauth2/v2.0/token',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                  client_id: MICROSOFT_CLIENT_ID,
                  client_secret: MICROSOFT_CLIENT_SECRET,
                  grant_type: 'refresh_token',
                  refresh_token: staffToken.refreshToken,
                  scope:
                    'https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/User.Read offline_access',
                }),
              }
            );

            if (!refreshResponse.ok) {
              const errorText = await refreshResponse.text();
              logger.error(`Microsoft token refresh failed for staff ${staff.id}:`, {
                status: refreshResponse.status,
                statusText: refreshResponse.statusText,
                errorBody: errorText,
                staffId: staff.id,
                tokenExpiresAt: staffToken.expiresAt,
                hasRefreshToken: !!staffToken.refreshToken,
              });
              throw new Error(
                `Token refresh failed: ${refreshResponse.status} ${refreshResponse.statusText} - ${errorText}`
              );
            }

            const refreshData = await refreshResponse.json();
            accessToken = refreshData.access_token;
            const newExpiresAt = new Date(Date.now() + refreshData.expires_in * 1000);

            // Update the token in database
            await db
              .update(staffMicrosoftTokens)
              .set({
                accessToken: refreshData.access_token,
                expiresAt: newExpiresAt,
                refreshToken: refreshData.refresh_token || staffToken.refreshToken,
                updatedAt: new Date(),
              })
              .where(eq(staffMicrosoftTokens.staffId, staff.id));

            logger.info(`Successfully refreshed Microsoft token for staff ${staff.id}`);
          } catch (error) {
            logger.error(`Failed to refresh Microsoft token for staff ${staff.id}:`, error);
            throw new Error('Token expired. Please reconnect your Microsoft account.');
          }
        }

        // Create Microsoft Graph client
        const microsoftClient = Client.init({
          authProvider: (done: (error: Error | null, accessToken: string | null) => void) => {
            done(null, accessToken);
          },
        });

        emailClient = {
          type: 'microsoft',
          client: microsoftClient,
          senderInfo: {
            name: `${staff.firstName} ${staff.lastName}`,
            email: staff.email,
            signature: staff.signature,
          },
        };

        logger.info(`Using assigned staff's Microsoft: ${staff.email}`);
      }
      // Case 2: Donor assigned to staff without linked email account
      else {
        logger.error(`Assigned staff has no email account linked`);
        throw new Error('Donor has no assigned staff with a linked email account');
      }
    }

    // No email client found
    if (!emailClient) {
      logger.error(`No email client found for donor ${donorId}`);
      throw new Error(`No email client found for donor ${donorId}`);
    }

    return emailClient;
  } catch (error) {
    logger.error(
      `Failed to get email client: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}

/**
 * Service for sending individual emails with full tracking and campaign integration
 */
export class EmailSendingService {
  private emailCampaignsService: EmailCampaignsService;

  constructor() {
    this.emailCampaignsService = new EmailCampaignsService();
  }

  /**
   * Send a single email with full campaign integration, tracking, and job management
   */
  async sendEmail(payload: SendEmailPayload): Promise<SendEmailResult> {
    const { emailId, jobId, sessionId, organizationId, userId } = payload;

    logger.info(`Starting to send email ${emailId}${jobId ? ` for job ${jobId}` : ''}`);

    try {
      // Update job status to running if jobId provided
      if (jobId) {
        // Check if job was cancelled (pause/cancel scenario)
        const [job] = await db
          .select()
          .from(emailSendJobs)
          .where(eq(emailSendJobs.id, jobId))
          .limit(1);

        if (!job || job.status === 'cancelled') {
          logger.info(`Job ${jobId} was cancelled, skipping email send`);
          return { status: 'cancelled', emailId, jobId };
        }
        await db
          .update(emailSendJobs)
          .set({
            status: 'running',
            attemptCount: sql`${emailSendJobs.attemptCount} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(emailSendJobs.id, jobId));
      }

      // Get email details
      const [email] = await db
        .select({
          id: generatedEmails.id,
          donorId: generatedEmails.donorId,
          subject: generatedEmails.subject,
          structuredContent: generatedEmails.structuredContent,
          emailContent: generatedEmails.emailContent,
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
        logger.warn(`Email ${emailId} already sent, skipping`);
        if (jobId) {
          await db
            .update(emailSendJobs)
            .set({
              status: 'completed',
              actualSendTime: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(emailSendJobs.id, jobId));
        }
        return { status: 'already_sent', emailId, jobId };
      }

      // Check if cancelled/paused
      if (email.sendStatus === 'cancelled' || email.sendStatus === 'paused') {
        logger.info(`Email ${emailId} is ${email.sendStatus}, skipping`);
        if (jobId) {
          await db
            .update(emailSendJobs)
            .set({
              status: 'cancelled',
              updatedAt: new Date(),
            })
            .where(eq(emailSendJobs.id, jobId));
        }
        return { status: email.sendStatus as 'cancelled', emailId, jobId };
      }

      // Update email status to sending
      await db
        .update(generatedEmails)
        .set({
          sendStatus: 'sending',
          updatedAt: new Date(),
        })
        .where(eq(generatedEmails.id, emailId));

      // Get email client and sender info
      const emailClient = await getEmailClientForDonor(email.donorId, organizationId, userId);

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

      // Handle both new format (emailContent) and legacy format (structuredContent)
      let contentWithSignature;

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
        logger.error(`Email ${email.id} has no content in either format, using empty content`);
        throw new Error(`Email ${email.id} has no content in either format`);
      }

      // Process content with tracking
      const processedContent = await processEmailContentWithTracking(
        contentWithSignature,
        trackingId
      );

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
        formatSenderField(emailClient.senderInfo)
      );

      let messageId: string;

      // Send email based on provider type
      if (emailClient.type === 'gmail') {
        // Encode for Gmail API
        const encodedMessage = Buffer.from(htmlEmail, 'utf8')
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');

        // Send via Gmail API
        const sentMessage = await emailClient.client.users.messages.send({
          userId: 'me',
          requestBody: {
            raw: encodedMessage,
          },
        });
        messageId = sentMessage.data.id || '';
      } else {
        // Send via Microsoft Graph API
        const message = {
          subject: email.subject,
          body: {
            contentType: 'HTML',
            content: processedContent.htmlContent,
          },
          toRecipients: [
            {
              emailAddress: {
                address: email.donor.email,
              },
            },
          ],
        };

        const sentMessage = await emailClient.client.api('/me/sendMail').post({
          message,
          saveToSentItems: true,
        });

        // Microsoft doesn't return message ID directly from sendMail
        messageId = `microsoft-${Date.now()}`;
      }

      // Update email as sent
      await db
        .update(generatedEmails)
        .set({
          isSent: true,
          sentAt: new Date(),
          sendStatus: 'sent',
          updatedAt: new Date(),
        })
        .where(eq(generatedEmails.id, emailId));

      // Update job as completed if jobId provided
      if (jobId) {
        await db
          .update(emailSendJobs)
          .set({
            status: 'completed',
            actualSendTime: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(emailSendJobs.id, jobId));
      }

      // Check if campaign is complete
      await this.emailCampaignsService.checkAndUpdateCampaignCompletion(sessionId, organizationId);

      logger.info(
        `Successfully sent email ${emailId} to ${email.donor.email} with tracking ID ${trackingId}, message ID ${messageId}`
      );

      return {
        status: 'sent',
        emailId,
        jobId,
        messageId: messageId || undefined,
        trackingId,
        linkTrackersCreated: processedContent.linkTrackers.length,
        recipientEmail: email.donor.email,
        senderEmail: emailClient.senderInfo.email,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to send email ${emailId}: ${errorMessage}`);

      // Update job as failed if jobId provided
      if (jobId) {
        await db
          .update(emailSendJobs)
          .set({
            status: 'failed',
            lastError: errorMessage,
            updatedAt: new Date(),
          })
          .where(eq(emailSendJobs.id, jobId));
      }

      // Update email status
      await db
        .update(generatedEmails)
        .set({
          sendStatus: 'failed',
          updatedAt: new Date(),
        })
        .where(eq(generatedEmails.id, emailId));

      return {
        status: 'failed',
        emailId,
        jobId,
        error: errorMessage,
      };
    }
  }
}
