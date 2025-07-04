import { db } from "@/app/lib/db";
import {
  donors,
  emailGenerationSessions,
  generatedEmails,
  gmailOAuthTokens,
  staff,
  users,
} from "@/app/lib/db/schema";
import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { EmailCampaignsService } from "@/app/lib/services/email-campaigns.service";
import {
  createEmailTracker,
  createLinkTrackers,
} from "@/app/lib/data/email-tracking";
import {
  createHtmlEmail,
  processEmailContentWithTracking,
  formatSenderField,
} from "@/app/lib/utils/email-tracking/content-processor";
import { generateTrackingId } from "@/app/lib/utils/email-tracking/utils";
import { appendSignatureToEmail } from "@/app/lib/utils/email-with-signature";
import { wrapDatabaseOperation } from "@/app/lib/utils/error-handler";
import { and, eq, inArray } from "drizzle-orm";
import { google } from "googleapis";
import type { gmail_v1 } from "googleapis";
import { TRPCError } from "@trpc/server";

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

  constructor() {
    if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI) {
      this.oauth2Client = new google.auth.OAuth2(
        env.GOOGLE_CLIENT_ID,
        env.GOOGLE_CLIENT_SECRET,
        env.GOOGLE_REDIRECT_URI
      );
    } else {
      logger.error("Missing Google OAuth credentials in environment variables");
    }
    
    this.emailCampaignsService = new EmailCampaignsService();
  }

  /**
   * Get OAuth2 authorization URL
   */
  getAuthUrl(state?: string): string {
    if (!this.oauth2Client) {
      throw new Error("Google OAuth client not configured");
    }

    const scopes = [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.compose",
    ];

    return this.oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: scopes,
      state: state,
      prompt: "consent",
    });
  }

  /**
   * Handle OAuth callback and store tokens
   */
  async handleOAuthCallback(code: string, userId: string): Promise<void> {
    if (!this.oauth2Client) {
      throw new Error("Google OAuth client not configured");
    }

    const { tokens } = await this.oauth2Client.getToken(code);
    
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error("Failed to get access token from Google");
    }

    const expiresAt = tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600 * 1000);

    await wrapDatabaseOperation(async () => {
      // Check if token exists
      const existing = await db.query.gmailOAuthTokens.findFirst({
        where: eq(gmailOAuthTokens.userId, userId),
      });

      if (existing) {
        // Update existing token
        await db
          .update(gmailOAuthTokens)
          .set({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt,
            updatedAt: new Date(),
          })
          .where(eq(gmailOAuthTokens.userId, userId));
      } else {
        // Insert new token
        await db.insert(gmailOAuthTokens).values({
          userId,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt,
        });
      }
    });

    logger.info(`Gmail OAuth tokens stored for user ${userId}`);
  }

  /**
   * Get authenticated Gmail client for user
   */
  async getGmailClient(userId: string): Promise<gmail_v1.Gmail> {
    if (!this.oauth2Client) {
      throw new Error("Google OAuth client not configured");
    }

    const tokenInfo = await db.query.gmailOAuthTokens.findFirst({
      where: eq(gmailOAuthTokens.userId, userId),
    });

    if (!tokenInfo) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Gmail not connected. Please connect your Gmail account first.",
      });
    }

    // Set credentials
    this.oauth2Client.setCredentials({
      access_token: tokenInfo.accessToken,
      refresh_token: tokenInfo.refreshToken,
    });

    // Handle token refresh if expired
    if (tokenInfo.expiresAt < new Date()) {
      try {
        const { credentials } = await this.oauth2Client.refreshAccessToken();
        
        // Update stored tokens
        await db
          .update(gmailOAuthTokens)
          .set({
            accessToken: credentials.access_token!,
            expiresAt: new Date(credentials.expiry_date!),
            updatedAt: new Date(),
          })
          .where(eq(gmailOAuthTokens.userId, userId));

        this.oauth2Client.setCredentials(credentials);
      } catch (error) {
        logger.error("Failed to refresh Gmail access token", { error, userId });
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Failed to refresh Gmail access. Please reconnect your account.",
        });
      }
    }

    return google.gmail({ version: "v1", auth: this.oauth2Client });
  }

  /**
   * Check if user has Gmail connected
   */
  async isConnected(userId: string): Promise<boolean> {
    const tokenInfo = await db.query.gmailOAuthTokens.findFirst({
      where: eq(gmailOAuthTokens.userId, userId),
    });
    return !!tokenInfo;
  }

  /**
   * Disconnect Gmail account
   */
  async disconnect(userId: string): Promise<void> {
    await db
      .delete(gmailOAuthTokens)
      .where(eq(gmailOAuthTokens.userId, userId));
    
    logger.info(`Gmail disconnected for user ${userId}`);
  }

  /**
   * Get Gmail profile information
   */
  async getProfile(userId: string): Promise<GmailProfile> {
    const gmail = await this.getGmailClient(userId);
    const profile = await gmail.users.getProfile({ userId: "me" });
    
    return {
      emailAddress: profile.data.emailAddress!,
      messagesTotal: profile.data.messagesTotal!,
      threadsTotal: profile.data.threadsTotal!,
      historyId: profile.data.historyId!,
    };
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
    const userRecord = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    
    const staffMember = userRecord ? await db.query.staff.findFirst({
      where: eq(staff.email, userRecord.email),
    }) : null;

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
      const structuredContent: any[] = [{
        piece: finalBody,
        references: [],
        addNewlineAfter: false
      }];
      
      const processedContent = await processEmailContentWithTracking(
        structuredContent,
        trackingId
      );
      finalBody = processedContent.htmlContent;
      finalSubject = subject; // Subject tracking is handled separately
    }

    // Create email message
    const htmlContent = isHtml ? finalBody : `<p>${finalBody.replace(/\n/g, "<br>")}</p>`;
    const textContent = isHtml ? finalBody.replace(/<[^>]*>/g, '') : finalBody; // Strip HTML for text version
    
    const message = createHtmlEmail(
      to,
      finalSubject,
      htmlContent,
      textContent,
      staffMember
        ? formatSenderField({ 
            name: `${staffMember.firstName} ${staffMember.lastName}`,
            email: staffMember.email 
          })
        : undefined
    );

    // Send email
    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: message },
    });

    logger.info("Email sent via Gmail", {
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
    options: BulkSendEmailOptions
  ): Promise<{ successful: number[]; failed: Array<{ id: number; error: string }> }> {
    const { sessionId, emailIds, trackLinks = false, appendSignature = true } = options;

    // Get emails to send
    const emails = await db.query.generatedEmails.findMany({
      where: and(
        eq(generatedEmails.sessionId, sessionId),
        inArray(generatedEmails.id, emailIds)
      ),
    });

    if (emails.length === 0) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No emails found for the specified session and IDs",
      });
    }

    const successful: number[] = [];
    const failed: Array<{ id: number; error: string }> = [];

    // Send emails sequentially to avoid rate limits
    for (const email of emails) {
      try {
        const trackingId = generateTrackingId();
        
        // Get donor info
        const donor = await db.query.donors.findFirst({
          where: eq(donors.id, email.donorId),
        });

        if (!donor) {
          failed.push({ id: email.id, error: "Donor not found" });
          continue;
        }

        // Send email
        await this.sendEmail(
          userId,
          {
            to: donor.email,
            subject: email.subject,
            body: email.emailContent || email.structuredContent?.toString() || '',
            isHtml: true,
          },
          {
            sessionId,
            emailId: email.id,
            trackingId,
            trackLinks,
            appendSignature,
          }
        );

        // Mark as successful
        successful.push(email.id);

        // Small delay to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error: any) {
        logger.error("Failed to send email", {
          emailId: email.id,
          error: error.message,
        });
        failed.push({
          id: email.id,
          error: error.message || "Failed to send email",
        });
      }
    }

    logger.info("Bulk email send completed", {
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
      userId: "me",
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
          userId: "me",
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
      userId: "me",
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
      userId: "me",
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
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";

    let body = "";
    if (message.payload?.parts) {
      const textPart = message.payload.parts.find((p) => p.mimeType === "text/plain");
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, "base64").toString("utf-8");
      }
    } else if (message.payload?.body?.data) {
      body = Buffer.from(message.payload.body.data, "base64").toString("utf-8");
    }

    return {
      id: message.id!,
      threadId: message.threadId!,
      labelIds: message.labelIds || [],
      snippet: message.snippet || "",
      sizeEstimate: message.sizeEstimate || 0,
      internalDate: message.internalDate || undefined,
      from: getHeader("from") || undefined,
      to: getHeader("to") || undefined,
      subject: getHeader("subject") || undefined,
      date: getHeader("date") || undefined,
      body: body || undefined,
    };
  }
}