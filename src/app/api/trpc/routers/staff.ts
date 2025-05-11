import { z } from "zod";
import { router, orgProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import {
  getStaffById,
  getStaffByEmail,
  createStaff,
  updateStaff,
  deleteStaff,
  listStaff,
  type Staff,
  type NewStaff,
} from "@/app/lib/data/staff";

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

export const staffRouter = router({
  getById: orgProcedure.input(staffIdSchema).query(async ({ input, ctx }) => {
    const staff = await getStaffById(input.id, ctx.orgId!);
    if (!staff) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Staff member not found",
      });
    }
    return staff;
  }),

  getByEmail: orgProcedure.input(z.object({ email: z.string().email() })).query(async ({ input, ctx }) => {
    const staff = await getStaffByEmail(input.email, ctx.orgId!);
    if (!staff) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Staff member not found",
      });
    }
    return staff;
  }),

  create: orgProcedure.input(createStaffSchema).mutation(async ({ input, ctx }) => {
    try {
      return await createStaff({
        ...input,
        organizationId: ctx.orgId!,
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

  update: orgProcedure.input(updateStaffSchema).mutation(async ({ input, ctx }) => {
    const { id, ...updateData } = input;
    const updated = await updateStaff(id, updateData, ctx.orgId!);
    if (!updated) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Staff member not found",
      });
    }
    return updated;
  }),

  delete: orgProcedure.input(staffIdSchema).mutation(async ({ input, ctx }) => {
    try {
      await deleteStaff(input.id, ctx.orgId!);
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

  list: orgProcedure.input(listStaffSchema).query(async ({ input, ctx }) => {
    return await listStaff(input, ctx.orgId!);
  }),
});
