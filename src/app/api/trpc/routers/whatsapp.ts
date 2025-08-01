import { z } from 'zod';
import { router, protectedProcedure, check, ERROR_MESSAGES, validateNotNullish } from '../trpc';
import { TRPCError } from '@trpc/server';
import { getStaffById } from '@/app/lib/data/staff';

// Input validation schemas
const staffIdSchema = z.object({
  staffId: z.number(),
});

const addPhoneNumberSchema = z.object({
  staffId: z.number(),
  phoneNumber: z.string().min(10, 'Phone number must be at least 10 digits'),
});

const removePhoneNumberSchema = z.object({
  staffId: z.number(),
  phoneNumber: z.string(),
});

const activityLogSchema = z.object({
  staffId: z.number(),
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
});

const activityStatsSchema = z.object({
  staffId: z.number(),
  days: z.number().min(1).max(365).default(30),
});

const conversationHistorySchema = z.object({
  staffId: z.number(),
  phoneNumber: z.string(),
  limit: z.number().min(1).max(100).default(20),
});

const processTestMessageSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty'),
  phoneNumber: z.string().min(10, 'Valid phone number required'),
  isTranscribed: z.boolean().default(false),
});

export const whatsappRouter = router({
  /**
   * Add a phone number to a staff member's WhatsApp permissions
   */
  addPhoneNumber: protectedProcedure
    .input(addPhoneNumberSchema)
    .mutation(async ({ input, ctx }) => {
      const { staffId, phoneNumber } = input;
      const organizationId = ctx.auth.user.organizationId;

      try {
        // Verify staff belongs to organization
        const staff = await getStaffById(staffId, organizationId);
        validateNotNullish(
          staff,
          'NOT_FOUND',
          "The staff member you're trying to update doesn't exist in your organization."
        );

        const result = await ctx.services.whatsappPermission.addPhoneNumberToStaff(
          staffId,
          phoneNumber
        );

        validateNotNullish(
          result,
          'INTERNAL_SERVER_ERROR',
          'Unable to add the phone number. Please try again.'
        );

        return {
          success: true,
          phoneNumber: phoneNumber,
        };
      } catch (error) {
        console.error('Error adding phone number:', error);
        if (error instanceof TRPCError) throw error;

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message:
            error instanceof Error && error.message.includes('already exists')
              ? 'This phone number is already associated with the staff member.'
              : 'Unable to add the phone number. Please try again.',
        });
      }
    }),

  /**
   * Remove a phone number from a staff member's WhatsApp permissions
   */
  removePhoneNumber: protectedProcedure
    .input(removePhoneNumberSchema)
    .mutation(async ({ input, ctx }) => {
      const { staffId, phoneNumber } = input;
      const organizationId = ctx.auth.user.organizationId;

      try {
        // Verify staff belongs to organization
        const staff = await getStaffById(staffId, organizationId);
        validateNotNullish(
          staff,
          'NOT_FOUND',
          "The staff member you're trying to update doesn't exist in your organization."
        );

        const permissionService = ctx.services.whatsappPermission;
        const result = await permissionService.removePhoneNumberFromStaff(staffId, phoneNumber);

        validateNotNullish(
          result,
          'INTERNAL_SERVER_ERROR',
          'Unable to remove the phone number. Please try again.'
        );

        return { success: true };
      } catch (error) {
        console.error('Error removing phone number:', error);
        if (error instanceof TRPCError) throw error;

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message:
            error instanceof Error && error.message.includes('not found')
              ? 'This phone number is not associated with the staff member.'
              : 'Unable to remove the phone number. Please try again.',
        });
      }
    }),

  /**
   * Get all phone numbers associated with a staff member
   */
  getStaffPhoneNumbers: protectedProcedure.input(staffIdSchema).query(async ({ input, ctx }) => {
    const { staffId } = input;
    const organizationId = ctx.auth.user.organizationId;

    try {
      // Verify staff belongs to organization
      const staff = await getStaffById(staffId, organizationId);
      check(
        !staff,
        'NOT_FOUND',
        "The staff member you're trying to update doesn't exist in your organization."
      );

      const permissionService = ctx.services.whatsappPermission;
      const phoneNumbers = await permissionService.getStaffPhoneNumbers(staffId);

      return {
        phoneNumbers,
        count: phoneNumbers.length,
      };
    } catch (error) {
      console.error('Error getting staff phone numbers:', error);
      if (error instanceof TRPCError) throw error;

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get phone numbers',
      });
    }
  }),

  /**
   * Get WhatsApp activity log for a staff member
   */
  getActivityLog: protectedProcedure.input(activityLogSchema).query(async ({ input, ctx }) => {
    const { staffId, limit, offset } = input;
    const organizationId = ctx.auth.user.organizationId;

    try {
      // Verify staff belongs to organization
      const staff = await getStaffById(staffId, organizationId);
      check(
        !staff,
        'NOT_FOUND',
        "The staff member you're trying to update doesn't exist in your organization."
      );

      const loggingService = ctx.services.whatsappStaffLogging;
      const activities = await loggingService.getStaffActivityLog(staffId, limit, offset);

      return {
        activities,
        count: activities.length,
        hasMore: activities.length === limit,
      };
    } catch (error) {
      console.error('Error getting activity log:', error);
      if (error instanceof TRPCError) throw error;

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get activity log',
      });
    }
  }),

  /**
   * Get WhatsApp activity statistics for a staff member
   */
  getActivityStats: protectedProcedure.input(activityStatsSchema).query(async ({ input, ctx }) => {
    const { staffId, days } = input;
    const organizationId = ctx.auth.user.organizationId;

    try {
      // Verify staff belongs to organization
      const staff = await getStaffById(staffId, organizationId);
      check(
        !staff,
        'NOT_FOUND',
        "The staff member you're trying to update doesn't exist in your organization."
      );

      const loggingService = ctx.services.whatsappStaffLogging;
      const stats = await loggingService.getStaffActivityStats(staffId, days);

      return {
        ...stats,
        uniquePhoneNumbers: Array.from(stats.uniquePhoneNumbers),
      };
    } catch (error) {
      console.error('Error getting activity stats:', error);
      if (error instanceof TRPCError) throw error;

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get activity statistics',
      });
    }
  }),

  /**
   * Check if a phone number is allowed for WhatsApp (for validation)
   */
  checkPhonePermission: protectedProcedure
    .input(
      z.object({
        phoneNumber: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { phoneNumber } = input;
      const organizationId = ctx.auth.user.organizationId;

      try {
        const permissionService = ctx.services.whatsappPermission;
        const result = await permissionService.checkPhonePermission(phoneNumber);

        // Only return permission info if it belongs to the user's organization
        if (result.isAllowed && result.organizationId === organizationId) {
          return {
            isAllowed: true,
            staffId: result.staffId,
            staffName: result.staff
              ? `${result.staff.firstName} ${result.staff.lastName}`
              : undefined,
          };
        }

        return { isAllowed: false };
      } catch (error) {
        console.error('Error checking phone permission:', error);
        return { isAllowed: false };
      }
    }),

  /**
   * Get conversation history for a staff member with a specific phone number
   */
  getConversationHistory: protectedProcedure
    .input(conversationHistorySchema)
    .query(async ({ input, ctx }) => {
      const { staffId, phoneNumber, limit } = input;
      const organizationId = ctx.auth.user.organizationId;

      try {
        // Verify staff belongs to organization
        const staff = await getStaffById(staffId, organizationId);
        validateNotNullish(
          staff,
          'NOT_FOUND',
          "The staff member doesn't exist in your organization."
        );

        const historyService = ctx.services.whatsappHistory;

        const messages = await historyService.getChatHistory(
          organizationId,
          staffId,
          phoneNumber,
          limit
        );

        return {
          messages,
          count: messages.length,
        };
      } catch (error) {
        console.error('Error getting conversation history:', error);
        if (error instanceof TRPCError) throw error;

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get conversation history',
        });
      }
    }),

  /**
   * Process a test WhatsApp message (for testing UI)
   * This replicates the exact logic from the WhatsApp webhook
   */
  processTestMessage: protectedProcedure
    .input(processTestMessageSchema)
    .mutation(async ({ input, ctx }) => {
      const { message, phoneNumber, isTranscribed } = input;

      try {
        const permissionService = ctx.services.whatsappPermission;
        const whatsappAI = ctx.services.whatsappAI;
        const loggingService = ctx.services.whatsappStaffLogging;

        // Check permissions first (same as webhook)
        const permissionResult = await permissionService.checkPhonePermission(phoneNumber);

        if (!permissionResult.isAllowed) {
          // Log permission denied event
          await loggingService.logPermissionDenied(
            phoneNumber,
            permissionResult.reason || 'Unknown reason',
            message
          );

          return {
            success: false,
            error:
              "Sorry, you don't have permission to use this WhatsApp service. Please contact your administrator.",
            permissionDenied: true,
          };
        }

        const { staffId, organizationId, staff: staffInfo } = permissionResult;

        // Verify the permission is for the current user's organization
        if (organizationId !== ctx.auth.user.organizationId) {
          return {
            success: false,
            error: 'Permission denied for this organization.',
            permissionDenied: true,
          };
        }

        // Log message received
        await loggingService.logMessageReceived(
          staffId!,
          organizationId!,
          phoneNumber,
          message,
          isTranscribed ? 'audio' : 'text',
          `test-${Date.now()}`
        );

        // Process message with AI (same as webhook)
        const aiResponse = await whatsappAI.processMessage({
          message,
          organizationId: organizationId!,
          staffId: staffId!,
          fromPhoneNumber: phoneNumber,
          isTranscribed,
        });

        const responseText = aiResponse.response;

        // Log AI response generated
        await loggingService.logAIResponseGenerated(
          staffId!,
          organizationId!,
          phoneNumber,
          message,
          responseText,
          aiResponse.tokensUsed
        );

        // Log message sent
        await loggingService.logMessageSent(
          staffId!,
          organizationId!,
          phoneNumber,
          responseText,
          aiResponse.tokensUsed
        );

        return {
          success: true,
          response: responseText,
          tokensUsed: aiResponse.tokensUsed,
          staffInfo: {
            id: staffInfo?.id,
            name: `${staffInfo?.firstName} ${staffInfo?.lastName}`,
            email: staffInfo?.email,
          },
        };
      } catch (error) {
        console.error('Error processing test message:', error);

        // Try to log the error if we have staff info
        if (input.phoneNumber) {
          try {
            const permissionService = ctx.services.whatsappPermission;
            const permissionResult = await permissionService.checkPhonePermission(phoneNumber);

            if (
              permissionResult.isAllowed &&
              permissionResult.staffId &&
              permissionResult.organizationId
            ) {
              const loggingService = ctx.services.whatsappStaffLogging;
              await loggingService.logError(
                permissionResult.staffId,
                permissionResult.organizationId,
                phoneNumber,
                error instanceof Error ? error.message : String(error),
                error,
                'test_message_processing'
              );
            }
          } catch (logError) {
            console.error('Error logging error:', logError);
          }
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to process message',
        });
      }
    }),

  /**
   * Clear conversation history for a specific phone number
   */
  clearConversationHistory: protectedProcedure
    .input(
      z.object({
        staffId: z.number(),
        phoneNumber: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { organizationId } = ctx.auth.user;
      const { staffId, phoneNumber } = input;

      // Verify the staff member belongs to the organization
      const staff = await getStaffById(staffId, organizationId);
      if (!staff) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: ERROR_MESSAGES.NOT_FOUND,
        });
      }

      // Clear the conversation history
      const historyService = ctx.services.whatsappHistory;
      await historyService.clearConversationHistory(organizationId, staffId, phoneNumber);

      return { success: true };
    }),
});
