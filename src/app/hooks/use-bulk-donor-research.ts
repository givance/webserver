import { trpc } from "@/app/lib/trpc/client";
import { toast } from "sonner";

export interface UseBulkDonorResearchReturn {
  // Mutations
  startBulkResearch: (donorIds?: number[]) => Promise<void>;

  // Queries
  researchStatistics: any;

  // Loading states
  isStartingResearch: boolean;
  isLoadingStatistics: boolean;
}

export function useBulkDonorResearch(): UseBulkDonorResearchReturn {
  const utils = trpc.useUtils();

  // Get research statistics
  const researchStatisticsQuery = trpc.personResearch.getResearchStatistics.useQuery();

  // Start bulk research mutation
  const startBulkResearchMutation = trpc.personResearch.startBulkDonorResearch.useMutation({
    onMutate: () => {
      toast.loading("Starting bulk donor research...", {
        id: "bulk-research-loading",
      });
    },
    onSuccess: (data) => {
      toast.dismiss("bulk-research-loading");
      toast.success(data.data.message, {
        description: `Job ID: ${data.data.jobId}`,
        duration: 5000,
      });

      // Invalidate research statistics to get updated counts
      utils.personResearch.getResearchStatistics.invalidate();
    },
    onError: (error) => {
      toast.dismiss("bulk-research-loading");
      toast.error("Failed to start bulk research", {
        description: error.message,
        duration: 5000,
      });
    },
  });

  const startBulkResearch = async (donorIds?: number[]) => {
    try {
      await startBulkResearchMutation.mutateAsync({ donorIds });
    } catch (error) {
      // Error is already handled in onError
      console.error("Bulk research failed:", error);
    }
  };

  return {
    // Mutations
    startBulkResearch,

    // Queries
    researchStatistics: researchStatisticsQuery.data,

    // Loading states
    isStartingResearch: startBulkResearchMutation.isPending,
    isLoadingStatistics: researchStatisticsQuery.isLoading,
  };
}
