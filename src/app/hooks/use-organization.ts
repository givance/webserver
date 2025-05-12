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
  const getOrganization = trpc.organizations.getCurrent.useQuery;

  // Mutation hooks
  const updateMutation = trpc.organizations.updateCurrent.useMutation({
    onSuccess: () => {
      utils.organizations.getCurrent.invalidate();
    },
  });

  /**
   * Update the current organization
   * @param input The organization data to update
   * @returns The updated organization or null if update failed
   */
  const updateOrganization = async (input: UpdateOrganizationInput) => {
    try {
      return await updateMutation.mutateAsync(input);
    } catch (error) {
      console.error("Failed to update organization:", error);
      return null;
    }
  };

  return {
    // Query functions
    getOrganization,

    // Mutation functions
    updateOrganization,

    // Loading states
    isUpdating: updateMutation.isPending,

    // Mutation results
    updateResult: updateMutation.data,
  };
}
