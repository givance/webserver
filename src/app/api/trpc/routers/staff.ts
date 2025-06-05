import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import {
  getStaffById,
  getStaffByEmail,
  createStaff,
  updateStaff,
  deleteStaff,
  listStaff,
  updateStaffSignature,
  linkStaffEmailAccount,
  unlinkStaffEmailAccount,
} from "@/app/lib/data/staff";
import { listDonors } from "@/app/lib/data/donors";
import { staffSchemas } from "@/app/lib/validation/schemas";
import { db } from "@/app/lib/db";
import { gmailOAuthTokens } from "@/app/lib/db/schema";
import { eq } from "drizzle-orm";

// Input validation schemas
const staffIdSchema = z.object({
  id: z.number(),
});

const createStaffSchema = z.object({
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  title: z.string().optional(),
  department: z.string().optional(),
  isRealPerson: z.boolean().default(true),
});

const updateStaffSchema = z.object({
  id: z.number(),
  email: z.string().email().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  title: z.string().optional(),
  department: z.string().optional(),
  isRealPerson: z.boolean().optional(),
});

const listStaffSchema = z.object({
  searchTerm: z.string().optional(),
  isRealPerson: z.boolean().optional(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
  orderBy: z.enum(["firstName", "lastName", "email", "createdAt"]).optional(),
  orderDirection: z.enum(["asc", "desc"]).optional(),
});

// Define a Zod schema for the Staff model based on DB schema
const staffSchema = z.object({
  id: z.number(),
  organizationId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
  isRealPerson: z.boolean(),
  signature: z.string().nullable(),
  linkedGmailTokenId: z.number().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Define the output schema for the list procedure to include totalCount
const listStaffOutputSchema = z.object({
  staff: z.array(staffSchema), // Use the specific staff schema
  totalCount: z.number(),
});

export const staffRouter = router({
  getById: protectedProcedure.input(staffIdSchema).query(async ({ input, ctx }) => {
    const staff = await getStaffById(input.id, ctx.auth.user.organizationId);
    if (!staff) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Staff member not found",
      });
    }
    return staff;
  }),

  getByEmail: protectedProcedure.input(z.object({ email: z.string().email() })).query(async ({ input, ctx }) => {
    const staff = await getStaffByEmail(input.email, ctx.auth.user.organizationId);
    if (!staff) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Staff member not found",
      });
    }
    return staff;
  }),

  create: protectedProcedure.input(createStaffSchema).mutation(async ({ input, ctx }) => {
    try {
      return await createStaff({
        ...input,
        organizationId: ctx.auth.user.organizationId,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("already exists")) {
        throw new TRPCError({
          code: "CONFLICT",
          message: error.message,
        });
      }
      throw error;
    }
  }),

  update: protectedProcedure.input(updateStaffSchema).mutation(async ({ input, ctx }) => {
    const { id, ...updateData } = input;
    const updated = await updateStaff(id, updateData, ctx.auth.user.organizationId);
    if (!updated) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Staff member not found",
      });
    }
    return updated;
  }),

  delete: protectedProcedure.input(staffIdSchema).mutation(async ({ input, ctx }) => {
    try {
      await deleteStaff(input.id, ctx.auth.user.organizationId);
    } catch (error) {
      if (error instanceof Error && error.message.includes("linked to other records")) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Cannot delete staff member as they are linked to other records",
        });
      }
      throw error;
    }
  }),

  list: protectedProcedure
    .input(listStaffSchema)
    .output(listStaffOutputSchema) // Set the output schema for type safety
    .query(async ({ input, ctx }) => {
      // listStaff now returns an object: { staff: Staff[], totalCount: number }
      const result = await listStaff(input, ctx.auth.user.organizationId);
      return result; // This will be validated against listStaffOutputSchema
    }),

  getAssignedDonors: protectedProcedure.input(staffIdSchema).query(async ({ input, ctx }) => {
    // First verify staff member exists and belongs to the organization
    const staff = await getStaffById(input.id, ctx.auth.user.organizationId);
    if (!staff) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Staff member not found",
      });
    }

    // Get all donors assigned to this staff member
    const result = await listDonors(
      {
        assignedToStaffId: input.id,
        orderBy: "firstName",
        orderDirection: "asc",
        // No limit to get all assigned donors
      },
      ctx.auth.user.organizationId
    );

    return result;
  }),

  updateSignature: protectedProcedure
    .input(z.object({ id: z.number(), signature: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const { id, signature } = input;
      const updated = await updateStaffSignature(id, signature || null, ctx.auth.user.organizationId);
      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Staff member not found",
        });
      }
      return updated;
    }),

  linkEmailAccount: protectedProcedure.input(z.object({ staffId: z.number() })).mutation(async ({ input, ctx }) => {
    const { staffId } = input;
    try {
      // Get the current user's Gmail token
      const gmailToken = await db.query.gmailOAuthTokens.findFirst({
        where: eq(gmailOAuthTokens.userId, ctx.auth.user.id),
      });

      if (!gmailToken) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No Gmail account connected. Please connect your Gmail account first.",
        });
      }

      const updated = await linkStaffEmailAccount(staffId, gmailToken.id, ctx.auth.user.organizationId);
      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Staff member not found",
        });
      }
      return updated;
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      if (error instanceof Error && error.message.includes("Gmail OAuth token not found")) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Gmail OAuth token not found",
        });
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Could not link email account to staff member",
      });
    }
  }),

  unlinkEmailAccount: protectedProcedure.input(z.object({ staffId: z.number() })).mutation(async ({ input, ctx }) => {
    const { staffId } = input;
    const updated = await unlinkStaffEmailAccount(staffId, ctx.auth.user.organizationId);
    if (!updated) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Staff member not found",
      });
    }
    return updated;
  }),
});
