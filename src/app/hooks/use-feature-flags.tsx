'use client';

import React from 'react';
import { trpc } from '@/app/lib/trpc/client';
import { type FeatureFlags } from '@/app/lib/feature-flags/types';

/**
 * Hook for accessing organization feature flags
 * Provides methods for reading feature flags and checking specific features
 */
export function useFeatureFlags() {
  // Query hooks
  const {
    data: featureFlags,
    isLoading,
    error,
  } = trpc.organizations.getFeatureFlags.useQuery(undefined, {
    // Cache for 5 minutes
    staleTime: 5 * 60 * 1000,
    // Don't refetch automatically
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  // Helper function to check if a feature is enabled
  const isFeatureEnabled = (featureName: keyof FeatureFlags): boolean => {
    if (!featureFlags) return false;
    return featureFlags[featureName] === true;
  };

  return {
    featureFlags,
    isLoading,
    error,
    isFeatureEnabled,
    // Specific feature checks for convenience
    useAgenticFlow: isFeatureEnabled('use_agentic_flow'),
    useO3Model: isFeatureEnabled('use_o3_model'),
  };
}

/**
 * Higher-order component to conditionally render based on feature flags
 * Usage: <FeatureFlag flag="use_agentic_flow">Component</FeatureFlag>
 */
export function FeatureFlag({
  flag,
  children,
  fallback = null,
}: {
  flag: keyof FeatureFlags;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { isFeatureEnabled, isLoading } = useFeatureFlags();

  if (isLoading) {
    return null; // Or a loading spinner
  }

  return <>{isFeatureEnabled(flag) ? children : fallback}</>;
}
