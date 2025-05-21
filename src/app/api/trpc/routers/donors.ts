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
import { getStaffById } from "@/app/lib/data/staff";

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

// Schema for updating assigned staff
const updateAssignedStaffSchema = z.object({
  donorId: z.number(),
  staffId: z.number().nullable(), // staffId can be null to unassign
});

// Define the base donor schema for reuse
const baseDonorSchema = z.object({
  id: z.number(),
  organizationId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  phone: z.string().nullish(),
  address: z.string().nullish(),
  state: z.string().nullish(),
  notes: z.string().nullish(),
  assignedToStaffId: z.number().nullish(),
  currentStageName: z.string().nullish(),
  classificationReasoning: z.string().nullish(),
  predictedActions: z.array(z.string()).optional(),
  createdAt: z.date().transform((d) => d.toISOString()),
  updatedAt: z.date().transform((d) => d.toISOString()),
  stageName: z.string().optional(),
  stageExplanation: z.string().optional(),
  possibleActions: z.array(z.string()).optional(),
});

// Define the output schema for the list procedure to include totalCount
const listDonorsOutputSchema = z.object({
  donors: z.array(baseDonorSchema),
  totalCount: z.number(),
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

  updateAssignedStaff: protectedProcedure.input(updateAssignedStaffSchema).mutation(async ({ input, ctx }) => {
    const { donorId, staffId } = input;
    const { organizationId } = ctx.auth.user;

    // 1. Verify donor belongs to the organization
    const donor = await getDonorById(donorId, organizationId);
    if (!donor) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Donor not found in your organization",
      });
    }

    // 2. If staffId is provided, verify staff member belongs to the organization
    if (staffId !== null) {
      // Assuming a getStaffById function exists and can check organization
      // This might need to be imported from staff data functions
      const staff = await getStaffById(staffId, organizationId);
      if (!staff) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Staff member not found in your organization",
        });
      }
    }

    // 3. Update the donor's assignedToStaffId
    const updatedDonor = await updateDonor(donorId, { assignedToStaffId: staffId }, organizationId);
    if (!updatedDonor) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to update donor's assigned staff",
      });
    }
    return updatedDonor;
  }),

  list: protectedProcedure
    .input(listDonorsSchema)
    .output(listDonorsOutputSchema) // Set the output schema for type safety
    .query(async ({ input, ctx }) => {
      // listDonors now returns an object: { donors: Donor[], totalCount: number }
      const result = await listDonors(input, ctx.auth.user.organizationId);
      return result; // This will be validated against listDonorsOutputSchema
    }),
});
