import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { WhatsAppPermissionService } from "@/app/lib/services/whatsapp/whatsapp-permission.service";
import { WhatsAppStaffLoggingService } from "@/app/lib/services/whatsapp/whatsapp-staff-logging.service";
import { getStaffById } from "@/app/lib/data/staff";

// Input validation schemas
const staffIdSchema = z.object({
  staffId: z.number(),
});

const addPhoneNumberSchema = z.object({
  staffId: z.number(),
  phoneNumber: z.string().min(10, "Phone number must be at least 10 digits"),
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

export const whatsappRouter = router({
  /**
   * Add a phone number to a staff member's WhatsApp permissions
   */
  addPhoneNumber: protectedProcedure.input(addPhoneNumberSchema).mutation(async ({ input, ctx }) => {
    const { staffId, phoneNumber } = input;
    const organizationId = ctx.auth.user.organizationId;

    try {
      // Verify staff belongs to organization
      const staff = await getStaffById(staffId, organizationId);
      if (!staff) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "The staff member you're trying to update doesn't exist in your organization.",
        });
      }

      const permissionService = new WhatsAppPermissionService();
      const result = await permissionService.addPhoneNumberToStaff(staffId, phoneNumber);

      if (!result) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to add the phone number. Please try again.",
        });
      }

      return {
        success: true,
        phoneNumber: phoneNumber,
      };
    } catch (error) {
      console.error("Error adding phone number:", error);
      if (error instanceof TRPCError) throw error;

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          error instanceof Error && error.message.includes("already exists")
            ? "This phone number is already associated with the staff member."
            : "Unable to add the phone number. Please try again.",
      });
    }
  }),

  /**
   * Remove a phone number from a staff member's WhatsApp permissions
   */
  removePhoneNumber: protectedProcedure.input(removePhoneNumberSchema).mutation(async ({ input, ctx }) => {
    const { staffId, phoneNumber } = input;
    const organizationId = ctx.auth.user.organizationId;

    try {
      // Verify staff belongs to organization
      const staff = await getStaffById(staffId, organizationId);
      if (!staff) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "The staff member you're trying to update doesn't exist in your organization.",
        });
      }

      const permissionService = new WhatsAppPermissionService();
      const result = await permissionService.removePhoneNumberFromStaff(staffId, phoneNumber);

      if (!result) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to remove the phone number. Please try again.",
        });
      }

      return { success: true };
    } catch (error) {
      console.error("Error removing phone number:", error);
      if (error instanceof TRPCError) throw error;

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          error instanceof Error && error.message.includes("not found")
            ? "This phone number is not associated with the staff member."
            : "Unable to remove the phone number. Please try again.",
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
      if (!staff) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "The staff member you're trying to update doesn't exist in your organization.",
        });
      }

      const permissionService = new WhatsAppPermissionService();
      const phoneNumbers = await permissionService.getStaffPhoneNumbers(staffId);

      return {
        phoneNumbers,
        count: phoneNumbers.length,
      };
    } catch (error) {
      console.error("Error getting staff phone numbers:", error);
      if (error instanceof TRPCError) throw error;

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get phone numbers",
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
      if (!staff) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "The staff member you're trying to update doesn't exist in your organization.",
        });
      }

      const loggingService = new WhatsAppStaffLoggingService();
      const activities = await loggingService.getStaffActivityLog(staffId, limit, offset);

      return {
        activities,
        count: activities.length,
        hasMore: activities.length === limit,
      };
    } catch (error) {
      console.error("Error getting activity log:", error);
      if (error instanceof TRPCError) throw error;

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get activity log",
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
      if (!staff) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "The staff member you're trying to update doesn't exist in your organization.",
        });
      }

      const loggingService = new WhatsAppStaffLoggingService();
      const stats = await loggingService.getStaffActivityStats(staffId, days);

      return {
        ...stats,
        uniquePhoneNumbers: Array.from(stats.uniquePhoneNumbers),
      };
    } catch (error) {
      console.error("Error getting activity stats:", error);
      if (error instanceof TRPCError) throw error;

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get activity statistics",
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
        const permissionService = new WhatsAppPermissionService();
        const result = await permissionService.checkPhonePermission(phoneNumber);

        // Only return permission info if it belongs to the user's organization
        if (result.isAllowed && result.organizationId === organizationId) {
          return {
            isAllowed: true,
            staffId: result.staffId,
            staffName: result.staff ? `${result.staff.firstName} ${result.staff.lastName}` : undefined,
          };
        }

        return { isAllowed: false };
      } catch (error) {
        console.error("Error checking phone permission:", error);
        return { isAllowed: false };
      }
    }),

  /**
   * Get conversation history for a staff member with a specific phone number
   */
  getConversationHistory: protectedProcedure.input(conversationHistorySchema).query(async ({ input, ctx }) => {
    const { staffId, phoneNumber, limit } = input;
    const organizationId = ctx.auth.user.organizationId;

    try {
      // Verify staff belongs to organization
      const staff = await getStaffById(staffId, organizationId);
      if (!staff) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "The staff member you're trying to update doesn't exist in your organization.",
        });
      }

      // Import WhatsAppHistoryService
      const { WhatsAppHistoryService } = await import("@/app/lib/services/whatsapp/whatsapp-history.service");
      const historyService = new WhatsAppHistoryService();

      const messages = await historyService.getChatHistory(organizationId, staffId, phoneNumber, limit);

      return {
        messages,
        count: messages.length,
      };
    } catch (error) {
      console.error("Error getting conversation history:", error);
      if (error instanceof TRPCError) throw error;

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get conversation history",
      });
    }
  }),
});
