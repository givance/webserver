import { TRPCError } from "@trpc/server";
import { logger } from "../logger";

/**
 * Standard error messages for common scenarios
 */
export const ERROR_MESSAGES = {
  // Authentication & Authorization
  UNAUTHORIZED: "You must be logged in to perform this action",
  FORBIDDEN: "You don't have permission to perform this action",
  ORGANIZATION_MISMATCH: "Access denied to this organization's data",
  
  // Resource errors
  NOT_FOUND: (resource: string) => `${resource} not found`,
  ALREADY_EXISTS: (resource: string) => `${resource} already exists`,
  
  // Validation errors
  INVALID_INPUT: "Invalid input provided",
  MISSING_REQUIRED: (field: string) => `${field} is required`,
  
  // Operation errors
  OPERATION_FAILED: (operation: string) => `Failed to ${operation}`,
  RATE_LIMITED: "Too many requests. Please try again later",
  
  // System errors
  INTERNAL_ERROR: "An unexpected error occurred. Please try again later",
  SERVICE_UNAVAILABLE: "Service temporarily unavailable",
} as const;

/**
 * Options for creating a standardized TRPC error
 */
interface TRPCErrorOptions {
  code: TRPCError["code"];
  message: string;
  cause?: unknown;
  logLevel?: "error" | "warn" | "info";
  metadata?: Record<string, unknown>;
}

/**
 * Creates a standardized TRPC error with consistent logging
 * 
 * @example
 * throw createTRPCError({
 *   code: "NOT_FOUND",
 *   message: ERROR_MESSAGES.NOT_FOUND("Donor"),
 *   cause: originalError
 * });
 */
export function createTRPCError({
  code,
  message,
  cause,
  logLevel = "error",
  metadata = {},
}: TRPCErrorOptions): TRPCError {
  // Log the error with appropriate level
  const logData = {
    code,
    message,
    metadata,
    ...(cause instanceof Error && {
      originalError: cause.message,
      stack: cause.stack,
    }),
  };

  if (logLevel === "error") {
    logger.error("TRPC error occurred", logData);
  } else if (logLevel === "warn") {
    logger.warn("TRPC warning", logData);
  } else {
    logger.info("TRPC info", logData);
  }

  return new TRPCError({
    code,
    message,
    cause,
  });
}

/**
 * Type-safe error handler for async operations
 * 
 * @example
 * const result = await handleAsync(
 *   async () => donorService.getDonor(donorId),
 *   {
 *     errorMessage: ERROR_MESSAGES.NOT_FOUND("Donor"),
 *     errorCode: "NOT_FOUND"
 *   }
 * );
 */
export async function handleAsync<T>(
  operation: () => Promise<T>,
  options: {
    errorMessage?: string;
    errorCode?: TRPCError["code"];
    logMetadata?: Record<string, unknown>;
  } = {}
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw createTRPCError({
      code: options.errorCode || "INTERNAL_SERVER_ERROR",
      message: options.errorMessage || ERROR_MESSAGES.INTERNAL_ERROR,
      cause: error,
      metadata: options.logMetadata,
    });
  }
}

/**
 * Validates that a resource belongs to the specified organization
 * 
 * @example
 * validateOrganizationAccess(donor.organizationId, ctx.auth.user.organizationId);
 */
export function validateOrganizationAccess(
  resourceOrgId: string,
  userOrgId: string,
  resourceName = "Resource"
): void {
  if (resourceOrgId !== userOrgId) {
    throw createTRPCError({
      code: "FORBIDDEN",
      message: ERROR_MESSAGES.ORGANIZATION_MISMATCH,
      logLevel: "warn",
      metadata: {
        resourceOrgId,
        userOrgId,
        resourceName,
      },
    });
  }
}

/**
 * Creates a NOT_FOUND error for a resource
 */
export function notFoundError(resourceName: string): TRPCError {
  return createTRPCError({
    code: "NOT_FOUND",
    message: ERROR_MESSAGES.NOT_FOUND(resourceName),
    logLevel: "info",
  });
}

/**
 * Creates a CONFLICT error for duplicate resources
 */
export function conflictError(resourceName: string): TRPCError {
  return createTRPCError({
    code: "CONFLICT",
    message: ERROR_MESSAGES.ALREADY_EXISTS(resourceName),
    logLevel: "info",
  });
}

/**
 * Wraps a service method with standard error handling
 * 
 * @example
 * const getDonor = withErrorHandling(
 *   async (id: string) => donorService.getDonor(id),
 *   { resourceName: "Donor" }
 * );
 */
export function withErrorHandling<TArgs extends any[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: {
    resourceName?: string;
    operation?: string;
  } = {}
) {
  return async (...args: TArgs): Promise<TResult> => {
    try {
      return await fn(...args);
    } catch (error) {
      // If it's already a TRPC error, re-throw it
      if (error instanceof TRPCError) {
        throw error;
      }

      // Handle specific database errors
      if (error instanceof Error) {
        if (error.message.includes("not found")) {
          throw notFoundError(options.resourceName || "Resource");
        }
        if (error.message.includes("already exists") || error.message.includes("duplicate")) {
          throw conflictError(options.resourceName || "Resource");
        }
      }

      // Default to internal error
      throw createTRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: options.operation
          ? ERROR_MESSAGES.OPERATION_FAILED(options.operation)
          : ERROR_MESSAGES.INTERNAL_ERROR,
        cause: error,
      });
    }
  };
}