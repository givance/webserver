"use client";

import { trpc } from "@/app/lib/trpc/client";
import { type InferSelectModel } from "drizzle-orm";
import { organizations } from "@/app/lib/db/schema";
import { useCallback } from "react";
import { toast } from "sonner";
import type { DonorJourney, DonorJourneyNode, DonorJourneyEdge } from "@/app/lib/data/organizations";

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

  const getDonorJourney = () => {
    return trpc.organizations.getDonorJourney.useQuery(undefined, {
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

  const updateDonorJourneyMutation = trpc.organizations.updateDonorJourney.useMutation({
    onSuccess: () => {
      utils.organizations.getDonorJourney.invalidate();
    },
  });

  const moveFromUserMutation = trpc.organizations.moveMemoryFromUser.useMutation({
    onSuccess: () => {
      // Invalidate both user and organization queries
      utils.organizations.getCurrent.invalidate();
      utils.users.getCurrent.invalidate();
    },
  });

  const { data: organization } = getOrganization();
  const { data: donorJourney } = getDonorJourney();

  // Donor Journey operations
  const updateDonorJourney = useCallback(
    async (journey: DonorJourney) => {
      try {
        await updateDonorJourneyMutation.mutateAsync(journey);
        toast.success("Donor journey updated successfully");
      } catch (error) {
        console.error("Failed to update donor journey:", error);
        toast.error("Failed to update donor journey. Please try again.");
      }
    },
    [updateDonorJourneyMutation]
  );

  const addDonorJourneyNode = useCallback(
    async (node: DonorJourneyNode) => {
      try {
        const currentJourney = donorJourney || { nodes: [], edges: [] };
        const updatedJourney = {
          ...currentJourney,
          nodes: [...currentJourney.nodes, node],
        };
        await updateDonorJourneyMutation.mutateAsync(updatedJourney);
        toast.success("Node added successfully");
      } catch (error) {
        console.error("Failed to add node:", error);
        toast.error("Failed to add node. Please try again.");
      }
    },
    [donorJourney, updateDonorJourneyMutation]
  );

  const addDonorJourneyEdge = useCallback(
    async (edge: DonorJourneyEdge) => {
      try {
        const currentJourney = donorJourney || { nodes: [], edges: [] };
        const updatedJourney = {
          ...currentJourney,
          edges: [...currentJourney.edges, edge],
        };
        await updateDonorJourneyMutation.mutateAsync(updatedJourney);
        toast.success("Edge added successfully");
      } catch (error) {
        console.error("Failed to add edge:", error);
        toast.error("Failed to add edge. Please try again.");
      }
    },
    [donorJourney, updateDonorJourneyMutation]
  );

  const removeDonorJourneyNode = useCallback(
    async (nodeId: string) => {
      try {
        const currentJourney = donorJourney || { nodes: [], edges: [] };
        const updatedJourney = {
          nodes: currentJourney.nodes.filter((node) => node.id !== nodeId),
          edges: currentJourney.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
        };
        await updateDonorJourneyMutation.mutateAsync(updatedJourney);
        toast.success("Node removed successfully");
      } catch (error) {
        console.error("Failed to remove node:", error);
        toast.error("Failed to remove node. Please try again.");
      }
    },
    [donorJourney, updateDonorJourneyMutation]
  );

  const removeDonorJourneyEdge = useCallback(
    async (edgeId: string) => {
      try {
        const currentJourney = donorJourney || { nodes: [], edges: [] };
        const updatedJourney = {
          ...currentJourney,
          edges: currentJourney.edges.filter((edge) => edge.id !== edgeId),
        };
        await updateDonorJourneyMutation.mutateAsync(updatedJourney);
        toast.success("Edge removed successfully");
      } catch (error) {
        console.error("Failed to remove edge:", error);
        toast.error("Failed to remove edge. Please try again.");
      }
    },
    [donorJourney, updateDonorJourneyMutation]
  );

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

  const moveMemoryFromUser = useCallback(
    async (memoryIndex: number) => {
      try {
        await moveFromUserMutation.mutateAsync({ memoryIndex });
        toast.success("Memory moved to organization successfully");
      } catch (error) {
        console.error("Failed to move memory:", error);
        toast.error("Failed to move memory to organization. Please try again.");
      }
    },
    [moveFromUserMutation]
  );

  return {
    // Query functions
    getOrganization,
    getDonorJourney,

    // Mutation functions
    updateOrganization: updateMutation.mutateAsync,
    moveMemoryFromUser,

    // Donor Journey operations
    updateDonorJourney,
    addDonorJourneyNode,
    addDonorJourneyEdge,
    removeDonorJourneyNode,
    removeDonorJourneyEdge,

    // Memory operations
    addMemoryItem,
    updateMemoryItem,
    deleteMemoryItem,

    // Loading states
    isUpdating: updateMutation.isPending || moveFromUserMutation.isPending || updateDonorJourneyMutation.isPending,

    // Mutation results
    updateResult: updateMutation.data,
  };
}
