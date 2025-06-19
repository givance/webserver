"use client";

import { useOrganization } from "./use-organization";
import { useMemo } from "react";

export interface DonorJourneyStage {
  id: string;
  name: string;
  description?: string;
}

/**
 * Hook for managing donor journey stages
 * Extracts stage information from the organization's donor journey
 */
export function useDonorJourneyStages() {
  const { getDonorJourney } = useOrganization();
  const donorJourneyQuery = getDonorJourney();
  
  // Extract stages from donor journey nodes
  const stages = useMemo(() => {
    if (!donorJourneyQuery.data?.nodes) {
      return [];
    }
    
    return donorJourneyQuery.data.nodes.map((node) => ({
      id: node.id,
      name: node.data.label,
      description: node.data.description,
    }));
  }, [donorJourneyQuery.data]);
  
  return {
    donorJourneyStagesQuery: {
      data: stages,
      isLoading: donorJourneyQuery.isLoading,
      error: donorJourneyQuery.error,
    },
  };
}