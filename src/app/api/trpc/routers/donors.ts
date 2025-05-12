import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import {
  getDonorById,
  getDonorByEmail,
  createDonor,
  updateDonor,
  deleteDonor,
  listDonors,
} from "@/app/lib/data/donors";

// Input validation schemas
const donorIdSchema = z.object({
  id: z.number(),
});

const createDonorSchema = z.object({
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  notes: z.string().optional(),
  isAnonymous: z.boolean().default(false),
  isOrganization: z.boolean().default(false),
  organizationName: z.string().optional(),
});

const updateDonorSchema = z.object({
  id: z.number(),
  email: z.string().email().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  notes: z.string().optional(),
  isAnonymous: z.boolean().optional(),
  isOrganization: z.boolean().optional(),
  organizationName: z.string().optional(),
});

const listDonorsSchema = z.object({
  searchTerm: z.string().optional(),
  isAnonymous: z.boolean().optional(),
  isOrganization: z.boolean().optional(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
  orderBy: z.enum(["firstName", "lastName", "email", "createdAt"]).optional(),
  orderDirection: z.enum(["asc", "desc"]).optional(),
});

export const donorsRouter = router({
  getById: protectedProcedure.input(donorIdSchema).query(async ({ input, ctx }) => {
    const donor = await getDonorById(input.id, ctx.auth.user.organizationId);
    if (!donor) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Donor not found",
      });
    }
    return donor;
  }),

  getByEmail: protectedProcedure.input(z.object({ email: z.string().email() })).query(async ({ input, ctx }) => {
    const donor = await getDonorByEmail(input.email, ctx.auth.user.organizationId);
    if (!donor) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Donor not found",
      });
    }
    return donor;
  }),

  create: protectedProcedure.input(createDonorSchema).mutation(async ({ input, ctx }) => {
    try {
      return await createDonor({
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

  update: protectedProcedure.input(updateDonorSchema).mutation(async ({ input, ctx }) => {
    const { id, ...updateData } = input;
    const updated = await updateDonor(id, updateData, ctx.auth.user.organizationId);
    if (!updated) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Donor not found",
      });
    }
    return updated;
  }),

  delete: protectedProcedure.input(donorIdSchema).mutation(async ({ input, ctx }) => {
    try {
      await deleteDonor(input.id, ctx.auth.user.organizationId);
    } catch (error) {
      if (error instanceof Error && error.message.includes("linked to other records")) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Cannot delete donor as they are linked to other records",
        });
      }
      throw error;
    }
  }),

  list: protectedProcedure.input(listDonorsSchema).query(async ({ input, ctx }) => {
    return await listDonors(input, ctx.auth.user.organizationId);
  }),
});
