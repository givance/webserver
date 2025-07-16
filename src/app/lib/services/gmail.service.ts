import {
  getDonorById as getDonorByIdData,
  getGeneratedEmailsForSending,
  getStaffByEmail,
  // Note: Gmail OAuth token functions have been removed from gmail.ts
  // getGmailTokenByUserId,
  // upsertGmailToken,
  // updateGmailAccessToken,
  // deleteGmailToken,
  getUserById,
} from '@/app/lib/data/gmail';
import { db } from '@/app/lib/db';
import { staff, organizationMemberships, staffGmailTokens } from '@/app/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { env } from '@/app/lib/env';
import { logger } from '@/app/lib/logger';
import { EmailCampaignsService } from '@/app/lib/services/email-campaigns.service';
import { EmailSendingService } from '@/app/lib/services/email-sending.service';
import {
  createHtmlEmail,
  formatSenderField,
  processEmailContentWithTracking,
} from '@/app/lib/utils/email-tracking/content-processor';
import { TRPCError } from '@trpc/server';
import type { gmail_v1 } from 'googleapis';
import { google } from 'googleapis';

// Types
export interface GmailTokenInfo {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface SendEmailOptions {
  sessionId?: number;
  emailId?: number;
  trackingId?: string;
  trackLinks?: boolean;
  appendSignature?: boolean;
}

export interface BulkSendEmailOptions {
  sessionId: number;
  emailIds: number[];
  trackLinks?: boolean;
  appendSignature?: boolean;
}

export interface EmailContent {
  to: string;
  subject: string;
  body: string;
  isHtml?: boolean;
}

export interface GmailProfile {
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
  historyId: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  sizeEstimate: number;
  raw?: string;
  internalDate?: string;
  from?: string;
  to?: string;
  subject?: string;
  date?: string;
  body?: string;
}

export interface GmailThread {
  id: string;
  snippet: string;
  historyId: string;
  messages?: GmailMessage[];
}

export interface EmailParseResult {
  from: string;
  to: string;
  subject: string;
  date: string;
  body: string;
}

/**
 * Service for Gmail integration and email operations
 */
export class GmailService {
  private oauth2Client: any;
  private emailCampaignsService: EmailCampaignsService;
  private emailSendingService: EmailSendingService;

  constructor() {
    if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI) {
      this.oauth2Client = new google.auth.OAuth2(
        env.GOOGLE_CLIENT_ID,
        env.GOOGLE_CLIENT_SECRET,
        env.GOOGLE_REDIRECT_URI
      );
    } else {
      logger.error('Missing Google OAuth credentials in environment variables');
    }

    this.emailCampaignsService = new EmailCampaignsService();
    this.emailSendingService = new EmailSendingService();
  }

  /**
   * Get OAuth2 authorization URL
   */
  getAuthUrl(state?: string): string {
    if (!this.oauth2Client) {
      throw new Error('Google OAuth client not configured');
    }

    const scopes = [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.compose',
    ];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state: state,
      prompt: 'consent',
    });
  }

  /**
   * Handle OAuth callback and store tokens
   * @deprecated This method is deprecated as user-level OAuth tokens are no longer used.
   * Staff members should authenticate their Gmail accounts directly.
   */
  async handleOAuthCallback(code: string, userId: string): Promise<void> {
    throw new Error(
      'User-level Gmail OAuth is deprecated. Staff members should authenticate their Gmail accounts directly.'
    );
  }

  /**
   * Get authenticated Gmail client for user
   * @deprecated This method is deprecated as user-level OAuth tokens are no longer used.
   * Staff members should authenticate their Gmail accounts directly.
   */
  async getGmailClient(userId: string): Promise<gmail_v1.Gmail> {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message:
        'User-level Gmail OAuth is deprecated. Staff members should authenticate their Gmail accounts directly.',
    });
  }

  /**
   * Check if user's organization has any staff with Gmail connected
   * This checks for staff-level Gmail connections, not user-level.
   */
  async isConnected(userId: string): Promise<boolean> {
    try {
      // Get user's organization
      const membership = await db.query.organizationMemberships.findFirst({
        where: eq(organizationMemberships.userId, userId),
      });

      if (!membership) {
        return false;
      }

      // Check if any staff in the organization has Gmail connected
      const staffWithGmail = await db.query.staff.findFirst({
        where: eq(staff.organizationId, membership.organizationId),
        with: {
          gmailToken: true,
        },
      });

      return !!staffWithGmail?.gmailToken;
    } catch (error) {
      logger.error('Failed to check Gmail connection status', { error, userId });
      return false;
    }
  }

  /**
   * Disconnect Gmail account
   * @deprecated This method is deprecated as user-level OAuth tokens are no longer used.
   * Staff members should authenticate their Gmail accounts directly.
   */
  async disconnect(userId: string): Promise<void> {
    logger.info(`Gmail disconnect called for user ${userId} - no action taken (deprecated)`);
  }

  /**
   * Get Gmail profile information from first available staff member with Gmail
   */
  async getProfile(userId: string): Promise<GmailProfile> {
    try {
      // Get user's organization
      const membership = await db.query.organizationMemberships.findFirst({
        where: eq(organizationMemberships.userId, userId),
      });

      if (!membership) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'User is not part of any organization',
        });
      }

      // Get first staff member with Gmail connected
      const staffWithGmail = await db.query.staff.findFirst({
        where: eq(staff.organizationId, membership.organizationId),
        with: {
          gmailToken: true,
        },
      });

      if (!staffWithGmail?.gmailToken) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'No staff member has Gmail connected in your organization',
        });
      }

      // Create OAuth2 client with staff token
      const staffOAuth2Client = new google.auth.OAuth2(
        env.GOOGLE_CLIENT_ID,
        env.GOOGLE_CLIENT_SECRET,
        env.GOOGLE_REDIRECT_URI
      );

      staffOAuth2Client.setCredentials({
        access_token: staffWithGmail.gmailToken.accessToken,
        refresh_token: staffWithGmail.gmailToken.refreshToken,
      });

      // Handle token refresh if expired
      if (staffWithGmail.gmailToken.expiresAt < new Date()) {
        try {
          const { credentials } = await staffOAuth2Client.refreshAccessToken();

          // Update stored tokens
          await db
            .update(staffGmailTokens)
            .set({
              accessToken: credentials.access_token!,
              expiresAt: new Date(credentials.expiry_date!),
              updatedAt: new Date(),
            })
            .where(eq(staffGmailTokens.staffId, staffWithGmail.id));

          staffOAuth2Client.setCredentials(credentials);
        } catch (error) {
          logger.error('Failed to refresh staff Gmail access token', {
            error,
            staffId: staffWithGmail.id,
          });
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Failed to refresh Gmail access. Staff member needs to reconnect.',
          });
        }
      }

      const gmail = google.gmail({ version: 'v1', auth: staffOAuth2Client });
      const profile = await gmail.users.getProfile({ userId: 'me' });

      return {
        emailAddress: profile.data.emailAddress!,
        messagesTotal: profile.data.messagesTotal!,
        threadsTotal: profile.data.threadsTotal!,
        historyId: profile.data.historyId!,
      };
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      logger.error('Failed to get Gmail profile', { error, userId });
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get Gmail profile',
      });
    }
  }

  /**
   * Send a single email
   */
  async sendEmail(
    userId: string,
    email: EmailContent,
    options: SendEmailOptions = {}
  ): Promise<string> {
    const gmail = await this.getGmailClient(userId);
    const { to, subject, body, isHtml = false } = email;
    const { sessionId, emailId, trackingId, trackLinks = false, appendSignature = true } = options;

    let finalBody = body;
    let finalSubject = subject;

    // Get staff member info for signature
    const userRecord = await getUserById(userId);
    const staffMember = userRecord ? await getStaffByEmail(userRecord.email) : null;

    // Append signature if requested
    if (appendSignature && staffMember?.signature) {
      // For now, just append the signature as plain text
      if (isHtml) {
        finalBody = `${finalBody}<br><br>${staffMember.signature}`;
      } else {
        finalBody = `${finalBody}\n\n${staffMember.signature}`;
      }
    }

    // Apply tracking if session and email IDs are provided
    if (sessionId && emailId && trackingId) {
      // Convert body to structured content for tracking
      const structuredContent: any[] = [
        {
          piece: finalBody,
          references: [],
          addNewlineAfter: false,
        },
      ];

      const processedContent = await processEmailContentWithTracking(structuredContent, trackingId);
      finalBody = processedContent.htmlContent;
      finalSubject = subject; // Subject tracking is handled separately
    }

    // Create email message
    const htmlContent = isHtml ? finalBody : `<p>${finalBody.replace(/\n/g, '<br>')}</p>`;
    const textContent = isHtml ? finalBody.replace(/<[^>]*>/g, '') : finalBody; // Strip HTML for text version

    const message = createHtmlEmail(
      to,
      finalSubject,
      htmlContent,
      textContent,
      staffMember
        ? formatSenderField({
            name: `${staffMember.firstName} ${staffMember.lastName}`,
            email: staffMember.email,
          })
        : undefined
    );

    // Encode for Gmail API (same as sendSingleEmailTask)
    const encodedMessage = Buffer.from(message, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Send email
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedMessage },
    });

    logger.info('Email sent via Gmail', {
      userId,
      to,
      messageId: response.data.id,
      trackingId,
    });

    return response.data.id!;
  }

  /**
   * Send bulk emails from a campaign session
   */
  async sendBulkEmails(
    userId: string,
    options: BulkSendEmailOptions,
    organizationId?: string
  ): Promise<{ successful: number[]; failed: Array<{ id: number; error: string }> }> {
    const { sessionId, emailIds } = options;

    // If organizationId is not provided, we need to get it from the session
    if (!organizationId) {
      // Get the first email to determine the organization
      const emails = await getGeneratedEmailsForSending(sessionId, emailIds);
      if (emails.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No emails found for the specified session and IDs',
        });
      }

      // Get organization from the first donor
      const donor = await getDonorByIdData(emails[0].donorId);
      if (!donor) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Donor not found for email',
        });
      }
      organizationId = donor.organizationId;
    }

    const successful: number[] = [];
    const failed: Array<{ id: number; error: string }> = [];

    // Send emails sequentially using the EmailSendingService
    for (const emailId of emailIds) {
      try {
        const result = await this.emailSendingService.sendEmail({
          emailId,
          sessionId,
          organizationId,
          userId,
        });

        if (result.status === 'sent') {
          successful.push(emailId);
        } else if (result.status === 'failed') {
          failed.push({
            id: emailId,
            error: result.error || 'Email send failed',
          });
        }
        // For other statuses like 'already_sent' or 'cancelled', we'll count as successful
        // since the email doesn't need to be sent again
        else {
          successful.push(emailId);
        }

        // Small delay to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error: any) {
        logger.error('Failed to send email via EmailSendingService', {
          emailId,
          error: error.message,
        });
        failed.push({
          id: emailId,
          error: error.message || 'Failed to send email',
        });
      }
    }

    logger.info('Bulk email send completed via EmailSendingService', {
      sessionId,
      successful: successful.length,
      failed: failed.length,
    });

    return { successful, failed };
  }

  /**
   * List Gmail messages
   */
  async listMessages(
    userId: string,
    query?: string,
    maxResults: number = 10
  ): Promise<GmailMessage[]> {
    const gmail = await this.getGmailClient(userId);

    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults,
    });

    if (!response.data.messages) {
      return [];
    }

    // Get full message details
    const messages = await Promise.all(
      response.data.messages.map(async (msg) => {
        const fullMessage = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
        });

        return this.parseGmailMessage(fullMessage.data);
      })
    );

    return messages;
  }

  /**
   * Get Gmail threads
   */
  async listThreads(
    userId: string,
    query?: string,
    maxResults: number = 10
  ): Promise<GmailThread[]> {
    const gmail = await this.getGmailClient(userId);

    const response = await gmail.users.threads.list({
      userId: 'me',
      q: query,
      maxResults,
    });

    if (!response.data.threads) {
      return [];
    }

    return response.data.threads as GmailThread[];
  }

  /**
   * Get a single thread with messages
   */
  async getThread(userId: string, threadId: string): Promise<GmailThread> {
    const gmail = await this.getGmailClient(userId);

    const response = await gmail.users.threads.get({
      userId: 'me',
      id: threadId,
    });

    const thread = response.data as GmailThread;

    if (thread.messages) {
      thread.messages = thread.messages.map((msg) => this.parseGmailMessage(msg));
    }

    return thread;
  }

  /**
   * Parse Gmail message to extract key fields
   */
  private parseGmailMessage(message: gmail_v1.Schema$Message): GmailMessage {
    const headers = message.payload?.headers || [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

    let body = '';
    if (message.payload?.parts) {
      const textPart = message.payload.parts.find((p) => p.mimeType === 'text/plain');
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
      }
    } else if (message.payload?.body?.data) {
      body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
    }

    return {
      id: message.id!,
      threadId: message.threadId!,
      labelIds: message.labelIds || [],
      snippet: message.snippet || '',
      sizeEstimate: message.sizeEstimate || 0,
      internalDate: message.internalDate || undefined,
      from: getHeader('from') || undefined,
      to: getHeader('to') || undefined,
      subject: getHeader('subject') || undefined,
      date: getHeader('date') || undefined,
      body: body || undefined,
    };
  }
}
