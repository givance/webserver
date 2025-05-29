"use client";

import { trpc } from "@/app/lib/trpc/client";

/**
 * Hook to get tracking statistics for an email generation session
 */
export function useSessionTrackingStats(sessionId: number) {
  return trpc.emailTracking.getSessionStats.useQuery(
    { sessionId },
    {
      enabled: !!sessionId,
      refetchInterval: 30000, // Refresh every 30 seconds for live tracking
      staleTime: 25000, // Consider data stale after 25 seconds
    }
  );
}

/**
 * Hook to get donor-level tracking statistics for a session
 */
export function useDonorTrackingStats(sessionId: number) {
  return trpc.emailTracking.getDonorStatsForSession.useQuery(
    { sessionId },
    {
      enabled: !!sessionId,
      refetchInterval: 30000, // Refresh every 30 seconds for live tracking
      staleTime: 25000, // Consider data stale after 25 seconds
    }
  );
}

/**
 * Hook to get detailed tracking data for a specific email
 */
export function useEmailTrackingData(emailTrackerId: string) {
  return trpc.emailTracking.getEmailTrackingData.useQuery(
    { emailTrackerId },
    {
      enabled: !!emailTrackerId,
      refetchInterval: 10000, // Refresh every 10 seconds for real-time tracking
      staleTime: 8000, // Consider data stale after 8 seconds
    }
  );
}

/**
 * Hook to check if an email has been opened
 */
export function useEmailOpenStatus(emailTrackerId: string) {
  return trpc.emailTracking.hasEmailBeenOpened.useQuery(
    { emailTrackerId },
    {
      enabled: !!emailTrackerId,
      refetchInterval: 15000, // Refresh every 15 seconds
      staleTime: 12000, // Consider data stale after 12 seconds
    }
  );
}

/**
 * Combined hook that provides all tracking data for a session
 */
export function useSessionTracking(sessionId: number) {
  const sessionStats = useSessionTrackingStats(sessionId);
  const donorStats = useDonorTrackingStats(sessionId);

  return {
    sessionStats: sessionStats.data,
    donorStats: donorStats.data,
    isLoading: sessionStats.isLoading || donorStats.isLoading,
    error: sessionStats.error || donorStats.error,
    refetch: () => {
      sessionStats.refetch();
      donorStats.refetch();
    },
  };
}
