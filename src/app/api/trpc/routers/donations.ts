import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import {
  getDonationById,
  createDonation,
  updateDonation,
  deleteDonation,
  listDonations,
  getDonorDonationStats,
  getMultipleDonorDonationStats,
  type DonationWithDetails,
} from "@/app/lib/data/donations";
import { getDonorById, getDonorsByIds } from "@/app/lib/data/donors";
import { getProjectById } from "@/app/lib/data/projects";

// Helper function to authorize donation access
async function authorizeDonationAccess(donationId: number, organizationId: string): Promise<DonationWithDetails> {
  const donation = await getDonationById(donationId, { includeDonor: true, includeProject: true });
  if (!donation) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Donation not found",
    });
  }

  if (
    !donation.donor ||
    !donation.project ||
    donation.donor.organizationId !== organizationId ||
    donation.project.organizationId !== organizationId
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You don't have permission to access this donation.",
    });
  }
  return donation;
}

// Input validation schemas
const donationIdSchema = z.object({
  id: z.number(),
});

const donationDetailsSchema = z.object({
  includeDonor: z.boolean().optional(),
  includeProject: z.boolean().optional(),
});

const createDonationSchema = z.object({
  amount: z.number().min(0), // Amount in cents
  donorId: z.number(),
  projectId: z.number(),
  currency: z.string().length(3).default("USD"),
});

const updateDonationSchema = z.object({
  id: z.number(),
  amount: z.number().min(0).optional(),
  donorId: z.number().optional(),
  projectId: z.number().optional(),
  currency: z.string().length(3).optional(),
  date: z.date().optional(),
});

const listDonationsSchema = z.object({
  donorId: z.number().nullable().optional(),
  projectId: z.number().nullable().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
  orderBy: z.enum(["date", "amount", "createdAt"]).optional(),
  orderDirection: z.enum(["asc", "desc"]).optional(),
  includeDonor: z.boolean().optional(),
  includeProject: z.boolean().optional(),
});

export const donationsRouter = router({
  getById: protectedProcedure
    .input(z.object({ ...donationIdSchema.shape, ...donationDetailsSchema.shape }))
    .query(async ({ input }) => {
      const donation = await getDonationById(input.id, {
        includeDonor: input.includeDonor,
        includeProject: input.includeProject,
      });
      if (!donation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Donation not found",
        });
      }
      return donation;
    }),

  create: protectedProcedure.input(createDonationSchema).mutation(async ({ input, ctx }) => {
    // Verify donor belongs to organization
    const donor = await getDonorById(input.donorId, ctx.auth.user.organizationId);
    if (!donor) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "The selected donor doesn't exist in your organization.",
      });
    }

    // Verify project belongs to organization
    const project = await getProjectById(input.projectId);
    if (!project || project.organizationId !== ctx.auth.user.organizationId) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "The selected project doesn't exist in your organization.",
      });
    }

    try {
      return await createDonation(input);
    } catch (e) {
      if (e instanceof Error && e.message.includes("Ensure donor and project exist")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Unable to create donation. Please verify the donor and project selections.",
        });
      }
      throw e;
    }
  }),

  update: protectedProcedure.input(updateDonationSchema).mutation(async ({ input, ctx }) => {
    // Authorize access to the existing donation
    await authorizeDonationAccess(input.id, ctx.auth.user.organizationId);

    // If updating donor or project, verify they belong to the organization
    if (input.donorId) {
      const donor = await getDonorById(input.donorId, ctx.auth.user.organizationId);
      if (!donor) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "The new donor you selected doesn't exist in your organization.",
        });
      }
    }

    if (input.projectId) {
      const project = await getProjectById(input.projectId);
      if (!project || project.organizationId !== ctx.auth.user.organizationId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "The new project you selected doesn't exist in your organization.",
        });
      }
    }

    const { id, ...updateData } = input;
    const updated = await updateDonation(id, updateData);
    if (!updated) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "The donation you're looking for doesn't exist or has been deleted.",
      });
    }
    return updated;
  }),

  delete: protectedProcedure.input(donationIdSchema).mutation(async ({ input, ctx }) => {
    // Authorize access to the donation before deleting
    await authorizeDonationAccess(input.id, ctx.auth.user.organizationId);

    try {
      await deleteDonation(input.id);
    } catch {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to delete the donation. Please try again.",
      });
    }
  }),

  list: protectedProcedure.input(listDonationsSchema).query(async ({ input, ctx }) => {
    // Pass organizationId to the data layer function
    const { donations, totalCount } = await listDonations(input, ctx.auth.user.organizationId);

    // The data layer function now handles organization scoping.
    // No need for manual filtering here.
    // const filteredDonations = donations.filter((donation) => {
    //   const donorOrgMatch = donation.donor?.organizationId === ctx.auth.user.organizationId;
    //   const projectOrgMatch = donation.project?.organizationId === ctx.auth.user.organizationId;
    //   return donorOrgMatch && projectOrgMatch;
    // });

    return {
      donations: donations, // Already filtered by listDonations if organizationId was passed
      totalCount: totalCount,
    };
  }),

  getDonorStats: protectedProcedure.input(z.object({ donorId: z.number() })).query(async ({ input, ctx }) => {
    // First verify the donor belongs to the organization
    const donor = await getDonorById(input.donorId, ctx.auth.user.organizationId);
    if (!donor) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "The selected donor doesn't exist in your organization.",
      });
    }

    return getDonorDonationStats(input.donorId, ctx.auth.user.organizationId);
  }),

  getMultipleDonorStats: protectedProcedure
    .input(z.object({ donorIds: z.array(z.number()) }))
    .query(async ({ input, ctx }) => {
      // Verify all donors belong to the organization using batch fetch
      const donors = await getDonorsByIds(input.donorIds, ctx.auth.user.organizationId);

      // Check if we got all the requested donors
      if (donors.length !== input.donorIds.length) {
        const foundIds = new Set(donors.map(d => d.id));
        const missingIds = input.donorIds.filter(id => !foundIds.has(id));
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Donors not found in your organization: ${missingIds.join(', ')}`,
        });
      }

      return getMultipleDonorDonationStats(input.donorIds, ctx.auth.user.organizationId);
    }),
});
