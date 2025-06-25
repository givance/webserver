import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import {
  getStaffById,
  getStaffByEmail,
  getStaffWithGmailById,
  createStaff,
  updateStaff,
  deleteStaff,
  listStaff,
  updateStaffSignature,
  setPrimaryStaff,
  unsetPrimaryStaff,
  getPrimaryStaff,
  createEmailExample,
  getEmailExamplesByStaffId,
  getEmailExampleById,
  updateEmailExample,
  deleteEmailExample,
  countEmailExamplesByStaffId,
} from "@/app/lib/data/staff";
import { listDonors } from "@/app/lib/data/donors";
import { staffSchemas } from "@/app/lib/validation/schemas";
// Note: db and gmailOAuthTokens imports removed since staff Gmail is now handled via staffGmailRouter

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
  isPrimary: z.boolean().default(false),
  writingInstructions: z.string().optional(),
});

const updateStaffSchema = z.object({
  id: z.number(),
  email: z.string().email().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  title: z.string().optional(),
  department: z.string().optional(),
  isRealPerson: z.boolean().optional(),
  isPrimary: z.boolean().optional(),
  writingInstructions: z.string().optional(),
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
  isPrimary: z.boolean(),
  signature: z.string().nullable(),
  writingInstructions: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  gmailToken: z
    .object({
      id: z.number(),
      email: z.string(),
    })
    .nullable()
    .optional(),
});

// Define the output schema for the list procedure to include totalCount
const listStaffOutputSchema = z.object({
  staff: z.array(staffSchema), // Use the specific staff schema
  totalCount: z.number(),
});

// Email example schemas
const emailExampleSchema = z.object({
  id: z.number(),
  staffId: z.number(),
  organizationId: z.string(),
  subject: z.string(),
  content: z.string(),
  category: z.enum(["donor_outreach", "thank_you", "follow_up", "general", "fundraising", "event_invitation", "update"]).nullable(),
  metadata: z.any().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const createEmailExampleSchema = z.object({
  staffId: z.number(),
  subject: z.string().min(1, "Subject is required"),
  content: z.string().min(1, "Content is required"),
  category: z.enum(["donor_outreach", "thank_you", "follow_up", "general", "fundraising", "event_invitation", "update"]).optional(),
  metadata: z.any().optional(),
});

const updateEmailExampleSchema = z.object({
  id: z.number(),
  subject: z.string().min(1, "Subject is required").optional(),
  content: z.string().min(1, "Content is required").optional(),
  category: z.enum(["donor_outreach", "thank_you", "follow_up", "general", "fundraising", "event_invitation", "update"]).nullable().optional(),
  metadata: z.any().optional(),
});

const emailExampleIdSchema = z.object({
  id: z.number(),
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

  setPrimary: protectedProcedure.input(staffIdSchema).mutation(async ({ input, ctx }) => {
    // Check if staff member exists and has a Gmail account connected
    const staffWithGmail = await getStaffWithGmailById(input.id, ctx.auth.user.organizationId);
    if (!staffWithGmail) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Staff member not found",
      });
    }

    if (!staffWithGmail.gmailToken) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Only staff members with connected Gmail accounts can be set as primary",
      });
    }

    const updated = await setPrimaryStaff(input.id, ctx.auth.user.organizationId);
    if (!updated) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Staff member not found",
      });
    }
    return updated;
  }),

  unsetPrimary: protectedProcedure.input(staffIdSchema).mutation(async ({ input, ctx }) => {
    const updated = await unsetPrimaryStaff(input.id, ctx.auth.user.organizationId);
    if (!updated) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Staff member not found",
      });
    }
    return updated;
  }),

  getPrimary: protectedProcedure.query(async ({ ctx }) => {
    const primaryStaff = await getPrimaryStaff(ctx.auth.user.organizationId);
    return primaryStaff;
  }),

  // Note: Staff Gmail account management is now handled through the staffGmailRouter
  // Individual staff members authenticate their own Gmail accounts via OAuth

  // Email example procedures
  createEmailExample: protectedProcedure.input(createEmailExampleSchema).mutation(async ({ input, ctx }) => {
    // Verify staff member exists and belongs to the organization
    const staff = await getStaffById(input.staffId, ctx.auth.user.organizationId);
    if (!staff) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Staff member not found",
      });
    }

    const { staffId, subject, content, category, metadata } = input;
    return await createEmailExample({
      staffId,
      organizationId: ctx.auth.user.organizationId,
      subject,
      content,
      category: category || "general",
      metadata: metadata || null,
    });
  }),

  listEmailExamples: protectedProcedure.input(staffIdSchema).query(async ({ input, ctx }) => {
    // Verify staff member exists and belongs to the organization
    const staff = await getStaffById(input.id, ctx.auth.user.organizationId);
    if (!staff) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Staff member not found",
      });
    }

    const examples = await getEmailExamplesByStaffId(input.id, ctx.auth.user.organizationId);
    const count = await countEmailExamplesByStaffId(input.id, ctx.auth.user.organizationId);
    
    return { examples, count };
  }),

  getEmailExample: protectedProcedure.input(emailExampleIdSchema).query(async ({ input, ctx }) => {
    const example = await getEmailExampleById(input.id, ctx.auth.user.organizationId);
    if (!example) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Email example not found",
      });
    }
    return example;
  }),

  updateEmailExample: protectedProcedure.input(updateEmailExampleSchema).mutation(async ({ input, ctx }) => {
    const { id, ...updateData } = input;
    
    // Verify example exists
    const existing = await getEmailExampleById(id, ctx.auth.user.organizationId);
    if (!existing) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Email example not found",
      });
    }

    const updated = await updateEmailExample(id, updateData, ctx.auth.user.organizationId);
    if (!updated) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Email example not found",
      });
    }
    return updated;
  }),

  deleteEmailExample: protectedProcedure.input(emailExampleIdSchema).mutation(async ({ input, ctx }) => {
    // Verify example exists
    const existing = await getEmailExampleById(input.id, ctx.auth.user.organizationId);
    if (!existing) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Email example not found",
      });
    }

    await deleteEmailExample(input.id, ctx.auth.user.organizationId);
  }),
});
