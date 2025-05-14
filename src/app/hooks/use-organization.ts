"use client";

import { trpc } from "@/app/lib/trpc/client";
import { type InferSelectModel } from "drizzle-orm";
import { organizations } from "@/app/lib/db/schema";

type Organization = InferSelectModel<typeof organizations>;

/**
 * Input types for organization operations
 */
export type UpdateOrganizationInput = {
  websiteUrl?: string;
  websiteSummary?: string;
  description?: string;
  writingInstructions?: string;
};

/**
 * Hook for managing organization data through the tRPC API
 * Provides methods for reading and updating organization data
 */
export function useOrganization() {
  const utils = trpc.useUtils();

  // Query hooks
  const getOrganization = () => {
    return trpc.organizations.getCurrent.useQuery(undefined, {
      // Don't refetch automatically
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
    });
  };

  // Mutation hooks
  const updateMutation = trpc.organizations.updateCurrent.useMutation({
    onSuccess: () => {
      utils.organizations.getCurrent.invalidate();
    },
  });

  return {
    // Query functions
    getOrganization,

    // Mutation functions
    updateOrganization: updateMutation.mutateAsync,

    // Loading states
    isUpdating: updateMutation.isPending,

    // Mutation results
    updateResult: updateMutation.data,
  };
}
