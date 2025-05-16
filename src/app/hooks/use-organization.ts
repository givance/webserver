"use client";

import { trpc } from "@/app/lib/trpc/client";
import { type InferSelectModel } from "drizzle-orm";
import { organizations } from "@/app/lib/db/schema";
import { useCallback } from "react";
import { toast } from "sonner";

type Organization = InferSelectModel<typeof organizations>;

/**
 * Input types for organization operations
 */
export type UpdateOrganizationInput = {
  websiteUrl?: string;
  websiteSummary?: string;
  description?: string;
  writingInstructions?: string;
  memory?: string[];
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

  const { data: organization } = getOrganization();

  const addMemoryItem = useCallback(
    async (memoryItem: string) => {
      try {
        const currentMemory = organization?.memory || [];
        const newMemory = [...currentMemory, memoryItem];
        await updateMutation.mutateAsync({ memory: newMemory });
        toast.success("Memory added successfully");
      } catch (error) {
        console.error("Failed to add memory:", error);
        toast.error("Failed to add memory. Please try again.");
      }
    },
    [organization?.memory, updateMutation]
  );

  const updateMemoryItem = useCallback(
    async (index: number, newMemory: string) => {
      try {
        const currentMemory = organization?.memory || [];
        const updatedMemory = [...currentMemory];
        updatedMemory[index] = newMemory;
        await updateMutation.mutateAsync({ memory: updatedMemory });
        toast.success("Memory updated successfully");
      } catch (error) {
        console.error("Failed to update memory:", error);
        toast.error("Failed to update memory. Please try again.");
      }
    },
    [organization?.memory, updateMutation]
  );

  const deleteMemoryItem = useCallback(
    async (index: number) => {
      try {
        const currentMemory = organization?.memory || [];
        const updatedMemory = currentMemory.filter((_, i) => i !== index);
        await updateMutation.mutateAsync({ memory: updatedMemory });
        toast.success("Memory deleted successfully");
      } catch (error) {
        console.error("Failed to delete memory:", error);
        toast.error("Failed to delete memory. Please try again.");
      }
    },
    [organization?.memory, updateMutation]
  );

  return {
    // Query functions
    getOrganization,

    // Mutation functions
    updateOrganization: updateMutation.mutateAsync,

    // Memory operations
    addMemoryItem,
    updateMemoryItem,
    deleteMemoryItem,

    // Loading states
    isUpdating: updateMutation.isPending,

    // Mutation results
    updateResult: updateMutation.data,
  };
}
