import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { getOrganizationById, updateOrganization } from "@/app/lib/data/organizations";

// Input validation schemas
const updateOrganizationSchema = z.object({
  websiteUrl: z.string().optional(),
  websiteSummary: z.string().optional(),
  description: z.string().optional(),
  writingInstructions: z.string().optional(),
});

export const organizationsRouter = router({
  /**
   * Get the current organization's details
   */
  getCurrent: protectedProcedure.query(async ({ ctx }) => {
    const organization = await getOrganizationById(ctx.auth.user.organizationId);
    if (!organization) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Organization not found",
      });
    }
    return organization;
  }),

  /**
   * Update the current organization's details
   */
  updateCurrent: protectedProcedure.input(updateOrganizationSchema).mutation(async ({ input, ctx }) => {
    try {
      const updated = await updateOrganization(ctx.auth.user.organizationId, input);
      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organization not found",
        });
      }
      return updated;
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to update organization",
      });
    }
  }),
});
