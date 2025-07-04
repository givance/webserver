/**
 * Standard query options for tRPC queries to ensure consistency across hooks
 */
export const STANDARD_QUERY_OPTIONS = {
  // Don't refetch automatically to prevent unnecessary API calls
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  refetchOnReconnect: false,
} as const;

/**
 * Query options for queries that should refetch when window regains focus
 * Useful for data that might change frequently or needs to stay fresh
 */
export const REFETCH_ON_FOCUS_QUERY_OPTIONS = {
  refetchOnWindowFocus: true,
  refetchOnMount: false,
  refetchOnReconnect: false,
} as const;

/**
 * Query options for disabled queries that are triggered manually
 */
export const MANUAL_QUERY_OPTIONS = {
  ...STANDARD_QUERY_OPTIONS,
  enabled: false,
} as const;

/**
 * Creates query options with enabled condition
 * @param condition - Boolean condition to enable the query
 */
export const createConditionalQueryOptions = (condition: boolean) => ({
  ...STANDARD_QUERY_OPTIONS,
  enabled: condition,
});