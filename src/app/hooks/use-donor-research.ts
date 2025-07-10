'use client';

import { trpc } from '@/app/lib/trpc/client';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * Types for donor research
 */
interface DonorResearchResult {
  answer: string;
  citations: Array<{
    url: string;
    title: string;
    snippet: string;
    relevance: string;
  }>;
  structuredData?: {
    inferredAge?: number | null;
    employer?: string | null;
    estimatedIncome?: string | null;
    highPotentialDonor: boolean;
    highPotentialDonorRationale: string;
  };
  metadata: {
    researchTopic: string;
    totalLoops: number;
    totalSources: number;
    timestamp: Date;
    summaryCount: number;
  };
}

interface DonorResearchVersion {
  id: number;
  version: number;
  isLive: boolean;
  researchTopic: string;
  createdAt: Date;
  updatedAt: Date;
  metadata: {
    totalLoops: number;
    totalSources: number;
    timestamp: Date;
    citationCount: number;
    answerLength: number;
  };
}

interface UseDonorResearchReturn {
  // State
  isLoading: boolean;
  error: string | null;

  // Data queries
  getResearchQuery: (donorId: number, version?: number) => any;
  getVersionsQuery: (donorId: number) => any;

  // Actions
  conductResearch: (donorId: number) => Promise<void>;
  clearError: () => void;
}

/**
 * Custom hook for donor research functionality
 * Provides methods to conduct research, retrieve results, and manage research state
 */
export function useDonorResearch(): UseDonorResearchReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const utils = trpc.useUtils();

  // Query factories
  const getResearchQuery = (donorId: number, version?: number) => {
    return trpc.personResearch.getDonorResearch.useQuery(
      { donorId, version },
      {
        enabled: !!donorId,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
      }
    );
  };

  const getVersionsQuery = (donorId: number) => {
    return trpc.personResearch.getAllDonorResearchVersions.useQuery(
      { donorId },
      {
        enabled: !!donorId,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
      }
    );
  };

  // Research mutation
  const conductResearchMutation = trpc.personResearch.conductDonorResearch.useMutation({
    onMutate: () => {
      setIsLoading(true);
      setError(null);
    },
    onSuccess: (data) => {
      setIsLoading(false);
      toast.success('Research completed successfully!');

      // Invalidate queries to refetch data
      if (data.data.donorId) {
        utils.personResearch.getDonorResearch.invalidate({ donorId: data.data.donorId });
        utils.personResearch.getAllDonorResearchVersions.invalidate({ donorId: data.data.donorId });
        // Invalidate donor queries since research status will change
        utils.donors.list.invalidate();
        utils.donors.getByIds.invalidate();
      }
    },
    onError: (error) => {
      setIsLoading(false);
      const errorMessage = error.message || 'Research failed. Please try again.';
      setError(errorMessage);
      toast.error(`Research failed: ${errorMessage}`);
    },
  });

  const conductResearch = async (donorId: number) => {
    try {
      await conductResearchMutation.mutateAsync({ donorId });
    } catch (error) {
      // Error is already handled in onError callback
      console.error('Research failed:', error);
      throw error;
    }
  };

  const clearError = () => {
    setError(null);
  };

  return {
    // State
    isLoading,
    error,

    // Data queries
    getResearchQuery,
    getVersionsQuery,

    // Actions
    conductResearch,
    clearError,
  };
}

/**
 * Hook for a specific donor's research data
 * Simplified hook that focuses on a single donor
 */
export function useDonorResearchData(donorId: number) {
  const { getResearchQuery, getVersionsQuery, conductResearch, isLoading, error } =
    useDonorResearch();

  const researchQuery = getResearchQuery(donorId);
  const versionsQuery = getVersionsQuery(donorId);

  return {
    // Data
    research: researchQuery.data as DonorResearchResult | null,
    versions: versionsQuery.data as DonorResearchVersion[] | undefined,

    // Loading states
    isLoadingResearch: researchQuery.isLoading,
    isLoadingVersions: versionsQuery.isLoading,
    isConductingResearch: isLoading,

    // Error states
    researchError: researchQuery.error?.message,
    versionsError: versionsQuery.error?.message,
    conductError: error,

    // Actions
    conductResearch: () => conductResearch(donorId),
    refetchResearch: researchQuery.refetch,
    refetchVersions: versionsQuery.refetch,

    // Computed values
    hasResearch: !!researchQuery.data,
    versionCount: versionsQuery.data?.length || 0,
  };
}
