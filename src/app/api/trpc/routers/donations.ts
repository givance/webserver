import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import {
  getDonationById,
  createDonation,
  updateDonation,
  deleteDonation,
  listDonations,
} from "@/app/lib/data/donations";
import { getDonorById } from "@/app/lib/data/donors";
import { getProjectById } from "@/app/lib/data/projects";

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
  donorId: z.number().optional(),
  projectId: z.number().optional(),
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
        message: "Donor not found in your organization",
      });
    }

    // Verify project belongs to organization
    const project = await getProjectById(input.projectId);
    if (!project || project.organizationId !== ctx.auth.user.organizationId) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Project not found in your organization",
      });
    }

    try {
      return await createDonation(input);
    } catch (e) {
      if (e instanceof Error && e.message.includes("Ensure donor and project exist")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: e.message,
        });
      }
      throw e;
    }
  }),

  update: protectedProcedure.input(updateDonationSchema).mutation(async ({ input, ctx }) => {
    // First get the existing donation with donor and project details
    const existingDonation = await getDonationById(input.id, {
      includeDonor: true,
      includeProject: true,
    });
    if (!existingDonation) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Donation not found",
      });
    }

    // Verify the donation belongs to the organization through donor and project
    if (
      !existingDonation.donor ||
      !existingDonation.project ||
      existingDonation.donor.organizationId !== ctx.auth.user.organizationId ||
      existingDonation.project.organizationId !== ctx.auth.user.organizationId
    ) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Donation does not belong to your organization",
      });
    }

    // If updating donor or project, verify they belong to the organization
    if (input.donorId) {
      const donor = await getDonorById(input.donorId, ctx.auth.user.organizationId);
      if (!donor) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "New donor not found in your organization",
        });
      }
    }

    if (input.projectId) {
      const project = await getProjectById(input.projectId);
      if (!project || project.organizationId !== ctx.auth.user.organizationId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "New project not found in your organization",
        });
      }
    }

    const { id, ...updateData } = input;
    const updated = await updateDonation(id, updateData);
    if (!updated) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Donation not found",
      });
    }
    return updated;
  }),

  delete: protectedProcedure.input(donationIdSchema).mutation(async ({ input, ctx }) => {
    // First get the donation with donor and project details
    const donation = await getDonationById(input.id, {
      includeDonor: true,
      includeProject: true,
    });
    if (!donation) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Donation not found",
      });
    }

    // Verify the donation belongs to the organization through donor and project
    if (
      !donation.donor ||
      !donation.project ||
      donation.donor.organizationId !== ctx.auth.user.organizationId ||
      donation.project.organizationId !== ctx.auth.user.organizationId
    ) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Donation does not belong to your organization",
      });
    }

    try {
      await deleteDonation(input.id);
    } catch {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Could not delete donation",
      });
    }
  }),

  list: protectedProcedure.input(listDonationsSchema).query(async ({ input, ctx }) => {
    // We'll need to filter the results after fetching to ensure we only return
    // donations that belong to the organization through both donor and project
    const { donations, totalCount } = await listDonations(input);

    const filteredDonations = donations.filter((donation) => {
      const donorOrgMatch = donation.donor?.organizationId === ctx.auth.user.organizationId;
      const projectOrgMatch = donation.project?.organizationId === ctx.auth.user.organizationId;
      return donorOrgMatch && projectOrgMatch;
    });

    return {
      donations: filteredDonations,
      totalCount: totalCount, // This will be used for pagination
    };
  }),
});
