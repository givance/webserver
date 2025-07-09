import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { createTRPCError, ERROR_MESSAGES, check, validateNotNullish } from '../trpc';
import { idSchema, emailSchema, gmailSchemas } from '@/app/lib/validation/schemas';
import { TRPCError } from '@trpc/server';

// Schema definitions
const sendEmailSchema = z.object({
  to: emailSchema,
  subject: z.string().min(1),
  body: z.string().min(1),
  isHtml: z.boolean().optional(),
  trackingOptions: z
    .object({
      sessionId: idSchema.optional(),
      emailId: idSchema.optional(),
      trackingId: z.string().optional(),
      trackLinks: z.boolean().optional(),
    })
    .optional(),
  appendSignature: z.boolean().optional().default(true),
});

const bulkSendSchema = z.object({
  sessionId: idSchema,
  emailIds: z.array(idSchema).min(1).max(100),
  trackLinks: z.boolean().optional(),
  appendSignature: z.boolean().optional().default(true),
});

const listMessagesSchema = z.object({
  query: z.string().optional(),
  maxResults: z.number().min(1).max(100).optional().default(10),
});

const profileResponseSchema = z.object({
  emailAddress: z.string(),
  messagesTotal: z.number(),
  threadsTotal: z.number(),
  historyId: z.string(),
});

const messageResponseSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  labelIds: z.array(z.string()),
  snippet: z.string(),
  sizeEstimate: z.number(),
  from: z.string().optional(),
  to: z.string().optional(),
  subject: z.string().optional(),
  date: z.string().optional(),
  body: z.string().optional(),
});

const threadResponseSchema = z.object({
  id: z.string(),
  snippet: z.string(),
  historyId: z.string(),
  messages: z.array(messageResponseSchema).optional(),
});

const bulkSendResponseSchema = z.object({
  successful: z.array(idSchema),
  failed: z.array(
    z.object({
      id: idSchema,
      error: z.string(),
    })
  ),
});

export const gmailRouter = router({
  /**
   * Get Gmail OAuth authorization URL (legacy method name)
   * @deprecated Use getAuthUrl instead
   */
  getGmailAuthUrl: protectedProcedure
    .output(z.object({ url: z.string(), authUrl: z.string() }))
    .mutation(async ({ ctx }) => {
      const url = ctx.services.gmail.getAuthUrl(ctx.auth.user?.id);
      return { url, authUrl: url }; // Return both for backwards compatibility
    }),

  /**
   * Check Gmail connection status (legacy method name)
   * @deprecated Use isConnected instead
   */
  getGmailConnectionStatus: protectedProcedure
    .output(
      z.object({
        connected: z.boolean(),
        isConnected: z.boolean().optional(),
        email: z.string().optional(),
      })
    )
    .query(async ({ ctx }) => {
      if (!ctx.auth.user?.id) {
        return { connected: false, isConnected: false };
      }

      const connected = await ctx.services.gmail.isConnected(ctx.auth.user.id);

      // If connected, try to get profile to get email
      let email: string | undefined;
      if (connected) {
        try {
          const profile = await ctx.services.gmail.getProfile(ctx.auth.user.id);
          email = profile.emailAddress;
        } catch {
          // Ignore error - just don't return email
        }
      }

      return { connected, isConnected: connected, email };
    }),

  /**
   * Disconnect Gmail account (legacy method name)
   * @deprecated Use disconnect instead
   */
  disconnectGmail: protectedProcedure
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx }) => {
      validateNotNullish(ctx.auth.user?.id, 'UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED);

      await ctx.services.gmail.disconnect(ctx.auth.user.id);

      return { success: true };
    }),
  /**
   * Get Gmail OAuth authorization URL
   *
   * @returns Authorization URL to redirect user to
   */
  getAuthUrl: protectedProcedure.output(z.object({ url: z.string() })).query(async ({ ctx }) => {
    const url = ctx.services.gmail.getAuthUrl(ctx.auth.user?.id);
    return { url };
  }),

  /**
   * Handle OAuth callback from Google
   *
   * @param code - Authorization code from Google
   * @param state - State parameter for security
   *
   * @throws {TRPCError} BAD_REQUEST if code is missing
   * @throws {TRPCError} INTERNAL_SERVER_ERROR if token exchange fails
   */
  handleOAuthCallback: protectedProcedure
    .input(gmailSchemas.authCallback)
    .output(z.object({ success: z.boolean(), message: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      validateNotNullish(ctx.auth.user?.id, 'UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED);

      await ctx.services.gmail.handleOAuthCallback(input.code, ctx.auth.user.id);

      return { success: true, message: 'Gmail account connected successfully' };
    }),

  /**
   * Check if user has Gmail connected
   *
   * @returns Whether Gmail is connected
   */
  isConnected: protectedProcedure
    .output(z.object({ connected: z.boolean() }))
    .query(async ({ ctx }) => {
      if (!ctx.auth.user?.id) {
        return { connected: false };
      }

      const connected = await ctx.services.gmail.isConnected(ctx.auth.user.id);

      return { connected };
    }),

  /**
   * Disconnect Gmail account
   *
   * @throws {TRPCError} UNAUTHORIZED if not logged in
   */
  disconnect: protectedProcedure.output(z.void()).mutation(async ({ ctx }) => {
    if (!ctx.auth.user?.id) {
      throw createTRPCError({
        code: 'UNAUTHORIZED',
        message: ERROR_MESSAGES.UNAUTHORIZED,
      });
    }

    await ctx.services.gmail.disconnect(ctx.auth.user.id);
  }),

  /**
   * Get Gmail profile information
   *
   * @returns Gmail profile with email address and message counts
   *
   * @throws {TRPCError} UNAUTHORIZED if Gmail not connected
   */
  getProfile: protectedProcedure.output(profileResponseSchema).query(async ({ ctx }) => {
    if (!ctx.auth.user?.id) {
      throw createTRPCError({
        code: 'UNAUTHORIZED',
        message: ERROR_MESSAGES.UNAUTHORIZED,
      });
    }

    return await ctx.services.gmail.getProfile(ctx.auth.user.id);
  }),

  /**
   * Send an email via Gmail
   *
   * @param to - Recipient email address
   * @param subject - Email subject
   * @param body - Email body (plain text or HTML)
   * @param isHtml - Whether body is HTML
   * @param trackingOptions - Optional tracking configuration
   * @param appendSignature - Whether to append user signature
   *
   * @returns Gmail message ID
   *
   * @throws {TRPCError} UNAUTHORIZED if Gmail not connected
   * @throws {TRPCError} BAD_REQUEST if email validation fails
   */
  sendEmail: protectedProcedure
    .input(sendEmailSchema)
    .output(z.object({ messageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      validateNotNullish(ctx.auth.user?.id, 'UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED);

      const messageId = await ctx.services.gmail.sendEmail(
        ctx.auth.user.id,
        {
          to: input.to,
          subject: input.subject,
          body: input.body,
          isHtml: input.isHtml,
        },
        {
          ...input.trackingOptions,
          appendSignature: input.appendSignature,
        }
      );

      return { messageId };
    }),

  /**
   * Send bulk emails from a campaign session
   *
   * @param sessionId - Email generation session ID
   * @param emailIds - Array of generated email IDs to send
   * @param trackLinks - Whether to track link clicks
   * @param appendSignature - Whether to append user signature
   *
   * @returns Summary of successful and failed sends
   *
   * @throws {TRPCError} UNAUTHORIZED if Gmail not connected
   * @throws {TRPCError} NOT_FOUND if session or emails not found
   */
  sendBulkEmails: protectedProcedure
    .input(bulkSendSchema)
    .output(bulkSendResponseSchema)
    .mutation(async ({ ctx, input }) => {
      validateNotNullish(ctx.auth.user?.id, 'UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED);

      try {
        const result = await ctx.services.gmail.sendBulkEmails(ctx.auth.user.id, input);

        // If all emails failed, throw an error to inform the frontend
        if (result.failed.length > 0 && result.successful.length === 0) {
          const errorMessages = result.failed.map((f) => `Email ${f.id}: ${f.error}`).join('; ');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `All emails failed to send: ${errorMessages}`,
          });
        }

        return result;
      } catch (error) {
        // Handle specific Gmail errors
        if (error instanceof TRPCError) {
          throw error;
        }

        // Handle other errors
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to send bulk emails: ${errorMessage}`,
        });
      }
    }),

  /**
   * List Gmail messages
   *
   * @param query - Gmail search query
   * @param maxResults - Maximum number of results
   *
   * @returns List of Gmail messages
   *
   * @throws {TRPCError} UNAUTHORIZED if Gmail not connected
   */
  listMessages: protectedProcedure
    .input(listMessagesSchema)
    .output(z.array(messageResponseSchema))
    .query(async ({ ctx, input }) => {
      validateNotNullish(ctx.auth.user?.id, 'UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED);

      return await ctx.services.gmail.listMessages(ctx.auth.user.id, input.query, input.maxResults);
    }),

  /**
   * List Gmail threads
   *
   * @param query - Gmail search query
   * @param maxResults - Maximum number of results
   *
   * @returns List of Gmail threads
   *
   * @throws {TRPCError} UNAUTHORIZED if Gmail not connected
   */
  listThreads: protectedProcedure
    .input(listMessagesSchema)
    .output(z.array(threadResponseSchema))
    .query(async ({ ctx, input }) => {
      validateNotNullish(ctx.auth.user?.id, 'UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED);

      return await ctx.services.gmail.listThreads(ctx.auth.user.id, input.query, input.maxResults);
    }),

  /**
   * Get a single Gmail thread with all messages
   *
   * @param threadId - Gmail thread ID
   *
   * @returns Thread with messages
   *
   * @throws {TRPCError} UNAUTHORIZED if Gmail not connected
   * @throws {TRPCError} NOT_FOUND if thread not found
   */
  getThread: protectedProcedure
    .input(z.object({ threadId: z.string() }))
    .output(threadResponseSchema)
    .query(async ({ ctx, input }) => {
      validateNotNullish(ctx.auth.user?.id, 'UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED);

      return await ctx.services.gmail.getThread(ctx.auth.user.id, input.threadId);
    }),

  /**
   * Save emails to draft (placeholder - not implemented)
   * @deprecated This functionality should be implemented if needed
   */
  saveToDraft: protectedProcedure.input(z.any()).mutation(async () => {
    throw new TRPCError({
      code: 'NOT_IMPLEMENTED',
      message: 'Save to draft functionality is not yet implemented',
    });
  }),

  /**
   * Send multiple emails (legacy method name)
   * @deprecated Use sendBulkEmails instead
   */
  sendEmails: protectedProcedure
    .input(bulkSendSchema)
    .output(bulkSendResponseSchema)
    .mutation(async ({ ctx, input }) => {
      validateNotNullish(ctx.auth.user?.id, 'UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED);

      return await ctx.services.gmail.sendBulkEmails(ctx.auth.user.id, input);
    }),

  /**
   * Send individual email (legacy method name)
   * @deprecated Use sendEmail instead
   */
  sendIndividualEmail: protectedProcedure
    .input(z.object({ emailId: idSchema }))
    .output(z.object({ success: z.boolean(), messageId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      validateNotNullish(ctx.auth.user?.id, 'UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED);

      // This is a placeholder - the actual implementation would need to:
      // 1. Fetch the email details from the database using emailId
      // 2. Send the email using the gmail service
      // For now, just return success
      return { success: true, messageId: 'placeholder' };
    }),
});
