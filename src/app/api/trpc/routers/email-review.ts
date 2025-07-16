import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { db } from '@/app/lib/db';
import {
  generatedEmails,
  emailGenerationSessions,
  organizations,
  donors,
  templates,
} from '@/app/lib/db/schema';
import { eq, and, inArray, desc, sql } from 'drizzle-orm';
import { wrapDatabaseOperation } from '@/app/lib/utils/error-handler';
import { TRPCError } from '@trpc/server';
import { EmailReviewerService } from '@/app/lib/smart-email-generation/services/email-reviewer.service';
import { logger } from '@/app/lib/logger';

// Input schemas
const listPendingEmailsInput = z.object({
  page: z.number().min(1).default(1),
  pageSize: z.number().min(1).max(100).default(20),
  campaignId: z.number().optional(),
  donorId: z.number().optional(),
  searchQuery: z.string().optional(),
});

const bulkReviewEmailsInput = z.object({
  emailIds: z.array(z.number()).min(1).max(1000),
  action: z.enum(['approve', 'reject']),
  reason: z.string().optional(),
});

const getEmailDetailsInput = z.object({
  emailId: z.number(),
  includeChatHistory: z.boolean().default(true),
});

const getEmailChatHistoryInput = z.object({
  emailIds: z.array(z.number()).min(1).max(100),
});

const aiReviewEmailsInput = z.object({
  emailIds: z.array(z.number()).min(1).max(50),
});

export const emailReviewRouter = router({
  // List emails pending review
  listPendingEmails: protectedProcedure
    .input(listPendingEmailsInput)
    .query(async ({ ctx, input }) => {
      const { page, pageSize, campaignId, donorId, searchQuery } = input;
      const offset = (page - 1) * pageSize;

      return await wrapDatabaseOperation(
        async () => {
          // Build where conditions
          const whereConditions = [
            eq(generatedEmails.status, 'PENDING_APPROVAL'),
            eq(generatedEmails.isPreview, false),
          ];

          if (campaignId) {
            whereConditions.push(eq(generatedEmails.sessionId, campaignId));
          }

          if (donorId) {
            whereConditions.push(eq(generatedEmails.donorId, donorId));
          }

          // Get total count with organization filter
          const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(generatedEmails)
            .innerJoin(
              emailGenerationSessions,
              eq(generatedEmails.sessionId, emailGenerationSessions.id)
            )
            .where(
              and(
                eq(emailGenerationSessions.organizationId, ctx.auth.user.organizationId),
                ...whereConditions
              )
            );

          const totalCount = Number(countResult[0]?.count || 0);

          // Get emails with details
          const emails = await db
            .select({
              id: generatedEmails.id,
              subject: generatedEmails.subject,
              emailContent: generatedEmails.emailContent,
              status: generatedEmails.status,
              createdAt: generatedEmails.createdAt,
              updatedAt: generatedEmails.updatedAt,
              reasoning: generatedEmails.reasoning,
              response: generatedEmails.response,
              sessionId: generatedEmails.sessionId,
              campaignName: emailGenerationSessions.jobName,
              donorId: generatedEmails.donorId,
              donorFirstName: donors.firstName,
              donorLastName: donors.lastName,
              donorEmail: donors.email,
              organizationName: organizations.name,
            })
            .from(generatedEmails)
            .innerJoin(
              emailGenerationSessions,
              eq(generatedEmails.sessionId, emailGenerationSessions.id)
            )
            .leftJoin(donors, eq(generatedEmails.donorId, donors.id))
            .leftJoin(organizations, eq(emailGenerationSessions.organizationId, organizations.id))
            .where(
              and(
                eq(emailGenerationSessions.organizationId, ctx.auth.user.organizationId),
                ...whereConditions
              )
            )
            .orderBy(desc(generatedEmails.createdAt))
            .limit(pageSize)
            .offset(offset);

          // Apply search filter if provided
          const filteredEmails = searchQuery
            ? emails.filter(
                (email) =>
                  email.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  email.emailContent?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  email.donorFirstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  email.donorLastName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  email.donorEmail?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  email.campaignName?.toLowerCase().includes(searchQuery.toLowerCase())
              )
            : emails;

          return {
            emails: filteredEmails,
            pagination: {
              page,
              pageSize,
              totalCount,
              totalPages: Math.ceil(totalCount / pageSize),
            },
          };
        },
        { organizationId: ctx.auth.user.organizationId },
        'Failed to list pending emails'
      );
    }),

  // Bulk approve or reject emails
  bulkReviewEmails: protectedProcedure
    .input(bulkReviewEmailsInput)
    .mutation(async ({ ctx, input }) => {
      const { emailIds, action, reason } = input;

      return await wrapDatabaseOperation(
        async () => {
          // Verify all emails belong to the organization
          const emails = await db
            .select({ id: generatedEmails.id })
            .from(generatedEmails)
            .innerJoin(
              emailGenerationSessions,
              eq(generatedEmails.sessionId, emailGenerationSessions.id)
            )
            .where(
              and(
                eq(emailGenerationSessions.organizationId, ctx.auth.user.organizationId),
                inArray(generatedEmails.id, emailIds)
              )
            );

          if (emails.length !== emailIds.length) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Some emails do not belong to your organization',
            });
          }

          // Update email statuses - we've already verified they belong to the organization
          if (action === 'approve') {
            await db
              .update(generatedEmails)
              .set({
                status: 'APPROVED',
                updatedAt: new Date(),
                reasoning: reason
                  ? sql`${generatedEmails.reasoning} || '\n\nReview Note: ' || ${reason}`
                  : generatedEmails.reasoning,
              })
              .where(inArray(generatedEmails.id, emailIds));
          } else {
            // For reject action, delete the emails
            await db.delete(generatedEmails).where(inArray(generatedEmails.id, emailIds));
          }

          return {
            success: true,
            updatedCount: emailIds.length,
            action,
          };
        },
        {
          organizationId: ctx.auth.user.organizationId,
          additionalData: { emailCount: emailIds.length },
        },
        'Failed to bulk review emails'
      );
    }),

  // Get email details with optional chat history
  getEmailDetails: protectedProcedure.input(getEmailDetailsInput).query(async ({ ctx, input }) => {
    const { emailId, includeChatHistory } = input;

    return await wrapDatabaseOperation(
      async () => {
        // Get email details
        const emailResult = await db
          .select({
            id: generatedEmails.id,
            subject: generatedEmails.subject,
            emailContent: generatedEmails.emailContent,
            structuredContent: generatedEmails.structuredContent,
            status: generatedEmails.status,
            createdAt: generatedEmails.createdAt,
            updatedAt: generatedEmails.updatedAt,
            reasoning: generatedEmails.reasoning,
            response: generatedEmails.response,
            sessionId: generatedEmails.sessionId,
            campaignName: emailGenerationSessions.jobName,
            donorId: generatedEmails.donorId,
            donorFirstName: donors.firstName,
            donorLastName: donors.lastName,
            donorEmail: donors.email,
            organizationName: organizations.name,
          })
          .from(generatedEmails)
          .innerJoin(
            emailGenerationSessions,
            eq(generatedEmails.sessionId, emailGenerationSessions.id)
          )
          .leftJoin(donors, eq(generatedEmails.donorId, donors.id))
          .leftJoin(organizations, eq(emailGenerationSessions.organizationId, organizations.id))
          .where(
            and(
              eq(generatedEmails.id, emailId),
              eq(emailGenerationSessions.organizationId, ctx.auth.user.organizationId)
            )
          )
          .limit(1);

        const email = emailResult[0];
        if (!email) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Email not found',
          });
        }

        let chatHistory: Array<{
          id: string;
          role: 'user' | 'assistant';
          content: string;
          timestamp: Date;
        }> = [];

        if (includeChatHistory && email.sessionId) {
          // Get chat history from email generation session
          const session = await db
            .select({
              chatHistory: emailGenerationSessions.chatHistory,
            })
            .from(emailGenerationSessions)
            .where(
              and(
                eq(emailGenerationSessions.id, email.sessionId),
                eq(emailGenerationSessions.organizationId, ctx.auth.user.organizationId)
              )
            )
            .limit(1);

          if (session[0]?.chatHistory) {
            const messages = session[0].chatHistory as Array<{
              role: 'user' | 'assistant';
              content: string;
            }>;

            chatHistory = messages.map((msg, index) => ({
              id: `${email.sessionId}-${index}`,
              role: msg.role,
              content: msg.content,
              timestamp: new Date(), // Chat history doesn't store timestamps
            }));
          }
        }

        return {
          email,
          chatHistory,
        };
      },
      { organizationId: ctx.auth.user.organizationId, resourceId: emailId },
      'Failed to get email details'
    );
  }),

  // Get chat history for multiple emails
  getEmailChatHistory: protectedProcedure
    .input(getEmailChatHistoryInput)
    .query(async ({ ctx, input }) => {
      const { emailIds } = input;

      return await wrapDatabaseOperation(
        async () => {
          // Get emails with session IDs
          const emails = await db
            .select({
              id: generatedEmails.id,
              sessionId: generatedEmails.sessionId,
            })
            .from(generatedEmails)
            .innerJoin(
              emailGenerationSessions,
              eq(generatedEmails.sessionId, emailGenerationSessions.id)
            )
            .where(
              and(
                eq(emailGenerationSessions.organizationId, ctx.auth.user.organizationId),
                inArray(generatedEmails.id, emailIds),
                sql`${generatedEmails.sessionId} IS NOT NULL`
              )
            );

          const sessionIds = emails.map((e) => e.sessionId).filter(Boolean) as number[];

          if (sessionIds.length === 0) {
            return emailIds.map((id) => ({ emailId: id, messages: [] }));
          }

          // Get all sessions with chat history
          const sessions = await db
            .select({
              id: emailGenerationSessions.id,
              chatHistory: emailGenerationSessions.chatHistory,
            })
            .from(emailGenerationSessions)
            .where(
              and(
                eq(emailGenerationSessions.organizationId, ctx.auth.user.organizationId),
                inArray(emailGenerationSessions.id, sessionIds)
              )
            );

          // Process chat histories by session
          const chatHistoriesBySession: Record<
            number,
            Array<{
              id: string;
              role: 'user' | 'assistant';
              content: string;
              timestamp: Date;
            }>
          > = {};

          sessions.forEach((session) => {
            if (session.chatHistory) {
              const messages = session.chatHistory as Array<{
                role: 'user' | 'assistant';
                content: string;
              }>;

              chatHistoriesBySession[session.id] = messages.map((msg, index) => ({
                id: `${session.id}-${index}`,
                role: msg.role,
                content: msg.content,
                timestamp: new Date(), // Chat history doesn't store timestamps
              }));
            }
          });

          // Map back to email IDs
          return emails.map((email) => ({
            emailId: email.id,
            messages: email.sessionId ? chatHistoriesBySession[email.sessionId] || [] : [],
          }));
        },
        {
          organizationId: ctx.auth.user.organizationId,
          additionalData: { emailCount: emailIds.length },
        },
        'Failed to get email chat history'
      );
    }),

  // Get summary statistics for pending reviews
  getPendingReviewStats: protectedProcedure.query(async ({ ctx }) => {
    return await wrapDatabaseOperation(
      async () => {
        const stats = await db
          .select({
            totalPending: sql<number>`count(*)`,
            byCampaign: sql<string>`${emailGenerationSessions.jobName}`,
            campaignId: emailGenerationSessions.id,
            count: sql<number>`count(${generatedEmails.id})`,
          })
          .from(generatedEmails)
          .innerJoin(
            emailGenerationSessions,
            eq(generatedEmails.sessionId, emailGenerationSessions.id)
          )
          .where(
            and(
              eq(emailGenerationSessions.organizationId, ctx.auth.user.organizationId),
              eq(generatedEmails.status, 'PENDING_APPROVAL'),
              eq(generatedEmails.isPreview, false)
            )
          )
          .groupBy(emailGenerationSessions.id, emailGenerationSessions.jobName);

        const totalPending = stats.reduce((sum, stat) => sum + Number(stat.count), 0);

        return {
          totalPending,
          byCampaign: stats.map((stat) => ({
            campaignId: stat.campaignId,
            campaignName: stat.byCampaign || 'Unknown Campaign',
            count: Number(stat.count),
          })),
        };
      },
      { organizationId: ctx.auth.user.organizationId },
      'Failed to get pending review stats'
    );
  }),

  // AI review emails using EmailReviewerService
  aiReviewEmails: protectedProcedure.input(aiReviewEmailsInput).mutation(async ({ ctx, input }) => {
    const { emailIds } = input;
    const emailReviewerService = new EmailReviewerService();

    return await wrapDatabaseOperation(
      async () => {
        // Fetch emails with all necessary data
        const emails = await db
          .select({
            id: generatedEmails.id,
            subject: generatedEmails.subject,
            emailContent: generatedEmails.emailContent,
            sessionId: generatedEmails.sessionId,
            donorId: generatedEmails.donorId,
            // Session data
            chatHistory: emailGenerationSessions.chatHistory,
            templateId: emailGenerationSessions.templateId,
            // Donor data
            donorFirstName: donors.firstName,
            donorLastName: donors.lastName,
            donorEmail: donors.email,
            donorPhone: donors.phone,
            donorNotes: donors.notes,
          })
          .from(generatedEmails)
          .innerJoin(
            emailGenerationSessions,
            eq(generatedEmails.sessionId, emailGenerationSessions.id)
          )
          .leftJoin(donors, eq(generatedEmails.donorId, donors.id))
          .where(
            and(
              eq(emailGenerationSessions.organizationId, ctx.auth.user.organizationId),
              inArray(generatedEmails.id, emailIds)
            )
          );

        if (emails.length === 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'No emails found for the provided IDs',
          });
        }

        // Get template data if any email uses a template
        const templateIds = [...new Set(emails.map((e) => e.templateId).filter(Boolean))];
        const templateMap = new Map();

        if (templateIds.length > 0) {
          const templateData = await db
            .select({
              id: templates.id,
              content: templates.content,
            })
            .from(templates)
            .where(inArray(templates.id, templateIds));

          templateData.forEach((t) => templateMap.set(t.id, t));
        }

        // Review each email
        const results = await Promise.all(
          emails.map(async (email) => {
            try {
              // Build system prompt (you may want to customize this based on your needs)
              const systemPrompt = `You are an AI assistant helping to generate personalized emails for donors. 
Your emails should be professional, warm, and tailored to each donor's history and context.`;

              // Build donor context
              const donorContext = `
Donor: ${email.donorFirstName || ''} ${email.donorLastName || ''}
Email: ${email.donorEmail || 'Not provided'}
Phone: ${email.donorPhone || 'Not provided'}
Notes: ${email.donorNotes || 'No notes available'}
`;

              // Get chat history
              const chatHistory =
                (email.chatHistory as Array<{
                  role: 'user' | 'assistant';
                  content: string;
                }>) || [];

              // Get template content if applicable
              let templateContent = '';
              if (email.templateId && templateMap.has(email.templateId)) {
                const template = templateMap.get(email.templateId);
                templateContent = `\n\nTemplate used:\n${template.content}`;
              }

              // Call the reviewer service
              const reviewResult = await emailReviewerService.reviewEmail({
                systemPrompt: systemPrompt + templateContent,
                donorContext,
                chatHistory,
                generatedEmail: {
                  subject: email.subject || '',
                  content: email.emailContent || '',
                },
              });

              return {
                emailId: email.id,
                donorName:
                  `${email.donorFirstName || ''} ${email.donorLastName || ''}`.trim() || 'Unknown',
                result: reviewResult.result,
                feedback: reviewResult.feedback,
                tokensUsed: reviewResult.tokensUsed,
              };
            } catch (error) {
              logger.error(`[AI Review] Failed to review email ${email.id}:`, error);
              return {
                emailId: email.id,
                donorName:
                  `${email.donorFirstName || ''} ${email.donorLastName || ''}`.trim() || 'Unknown',
                result: 'ERROR' as const,
                feedback: error instanceof Error ? error.message : 'Unknown error occurred',
                tokensUsed: 0,
              };
            }
          })
        );

        // Calculate summary statistics
        const summary = {
          totalReviewed: results.length,
          passedCount: results.filter((r) => r.result === 'OK').length,
          needsImprovementCount: results.filter((r) => r.result === 'NEEDS_IMPROVEMENT').length,
          errorCount: results.filter((r) => r.result === 'ERROR').length,
          totalTokensUsed: results.reduce((sum, r) => sum + r.tokensUsed, 0),
        };

        return {
          results,
          summary,
        };
      },
      {
        organizationId: ctx.auth.user.organizationId,
        additionalData: { emailCount: emailIds.length },
      },
      'Failed to AI review emails'
    );
  }),
});
