import { toast } from "sonner";
import type { TRPCClientErrorLike } from "@trpc/client";
import { logger } from "@/app/lib/logger";

/**
 * Standard error handler for mutations
 * Logs the error and shows a toast notification
 */
export const createErrorHandler = (context: string) => {
  return (error: TRPCClientErrorLike<any>) => {
    const message = error.message || `Failed to ${context}`;
    logger.error(`Error in ${context}:`, error);
    toast.error(message);
  };
};

/**
 * Creates a standard mutation error handler with custom messages
 */
export const createMutationErrorHandler = (
  operation: string,
  getCustomMessage?: (error: TRPCClientErrorLike<any>, variables: any) => string
) => {
  return (error: TRPCClientErrorLike<any>, variables: any) => {
    const message = getCustomMessage
      ? getCustomMessage(error, variables)
      : error.message || `Failed to ${operation}`;
    
    logger.error(`Error in ${operation}:`, { error, variables });
    toast.error(message);
  };
};

/**
 * Async wrapper for mutations with consistent error handling
 * Returns null on error instead of throwing
 */
export async function wrapMutationAsync<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  variables: TVariables,
  context: string
): Promise<TData | null> {
  try {
    return await mutationFn(variables);
  } catch (error) {
    console.error(`Failed to ${context}:`, error);
    return null;
  }
}

/**
 * Async wrapper for mutations that need to return boolean success
 */
export async function wrapMutationAsyncBoolean<TVariables>(
  mutationFn: (variables: TVariables) => Promise<any>,
  variables: TVariables,
  context: string
): Promise<boolean> {
  try {
    await mutationFn(variables);
    return true;
  } catch (error) {
    console.error(`Failed to ${context}:`, error);
    return false;
  }
}