import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { getStaffById, getStaffByEmail, createStaff, updateStaff, deleteStaff, listStaff } from "@/app/lib/data/staff";

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
  createdAt: z.date(),
  updatedAt: z.date(),
  // title: z.string().optional(), // Not in current DB schema
  // department: z.string().optional(), // Not in current DB schema
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
});
