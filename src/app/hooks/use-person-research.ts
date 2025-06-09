import { useState } from "react";
import { trpc } from "@/app/lib/trpc/client";
import { toast } from "sonner";

interface ResearchResult {
  answer: string;
  citations: Array<{
    url: string;
    title: string;
    snippet: string;
    relevance: string;
  }>;
  metadata: {
    researchTopic: string;
    totalLoops: number;
    totalSources: number;
    timestamp: Date;
    summaryCount: number;
  };
  summaries: Array<{
    query: string;
    summary: string;
    sourceCount: number;
    timestamp: Date;
  }>;
}

interface UsePersonResearchReturn {
  // State
  researchTopic: string;
  result: ResearchResult | null;
  isLoading: boolean;
  error: string | null;
  status: any;

  // Actions
  setResearchTopic: (topic: string) => void;
  conductResearch: () => Promise<void>;
  clearResults: () => void;

  // Computed
  canStartResearch: boolean;
}

/**
 * Custom hook for person research functionality
 * Handles state management, API calls, and error handling for research operations
 */
export function usePersonResearch(): UsePersonResearchReturn {
  const [researchTopic, setResearchTopic] = useState("");
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get research status
  const { data: status } = trpc.personResearch.getResearchStatus.useQuery();

  // Research mutation
  const conductResearchMutation = trpc.personResearch.conductResearch.useMutation({
    onSuccess: (data: any) => {
      setResult(data.data);
      setError(null);
      toast.success("Research completed successfully!");
    },
    onError: (error: any) => {
      setError(error.message);
      setResult(null);
      toast.error(`Research failed: ${error.message}`);
    },
    onSettled: () => {
      setIsLoading(false);
    },
  });

  const conductResearch = async () => {
    if (!researchTopic.trim()) {
      toast.error("Please enter a research topic");
      return;
    }

    if (researchTopic.length < 3) {
      toast.error("Research topic must be at least 3 characters");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    conductResearchMutation.mutate({ researchTopic: researchTopic.trim() });
  };

  const clearResults = () => {
    setResearchTopic("");
    setResult(null);
    setError(null);
  };

  const canStartResearch = !isLoading && status?.available === true && researchTopic.trim().length >= 3;

  return {
    // State
    researchTopic,
    result,
    isLoading,
    error,
    status,

    // Actions
    setResearchTopic,
    conductResearch,
    clearResults,

    // Computed
    canStartResearch,
  };
}
