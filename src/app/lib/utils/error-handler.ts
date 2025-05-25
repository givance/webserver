import { TRPCError } from "@trpc/server";
import { logger } from "@/app/lib/logger";

/**
 * Standard error codes used throughout the application
 */
export const ErrorCodes = {
  NOT_FOUND: "NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
  UNAUTHORIZED: "UNAUTHORIZED",
  BAD_REQUEST: "BAD_REQUEST",
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
  CONFLICT: "CONFLICT",
  VALIDATION_ERROR: "BAD_REQUEST",
} as const;

/**
 * Error context for better logging and debugging
 */
export interface ErrorContext {
  userId?: string;
  organizationId?: string;
  resourceId?: string | number;
  resourceType?: string;
  operation?: string;
  additionalData?: Record<string, unknown>;
}

/**
 * Standardized error handling utility
 * Provides consistent error logging and user-friendly error messages
 */
export class ErrorHandler {
  /**
   * Creates a standardized TRPC error with proper logging
   * @param code - The error code
   * @param message - User-friendly error message
   * @param context - Additional context for logging
   * @param cause - The original error that caused this
   * @returns A properly formatted TRPCError
   */
  static createError(code: keyof typeof ErrorCodes, message: string, context?: ErrorContext, cause?: Error): TRPCError {
    const errorCode = ErrorCodes[code];

    // Log the error with context
    const logMessage = this.formatLogMessage(message, context, cause);

    if (code === "INTERNAL_SERVER_ERROR") {
      logger.error(logMessage);
    } else {
      logger.warn(logMessage);
    }

    return new TRPCError({
      code: errorCode,
      message,
      cause,
    });
  }

  /**
   * Handles database errors and converts them to appropriate TRPC errors
   * @param error - The database error
   * @param context - Additional context
   * @returns A properly formatted TRPCError
   */
  static handleDatabaseError(error: Error, context?: ErrorContext): TRPCError {
    const message = error.message.toLowerCase();

    // Handle common database constraint violations
    if (message.includes("duplicate key") || message.includes("unique constraint")) {
      return this.createError("CONFLICT", "A record with this information already exists", context, error);
    }

    if (message.includes("foreign key") || message.includes("violates")) {
      return this.createError("BAD_REQUEST", "This operation would violate data integrity constraints", context, error);
    }

    if (message.includes("not found") || message.includes("does not exist")) {
      return this.createError("NOT_FOUND", "The requested resource was not found", context, error);
    }

    // Default to internal server error for unknown database errors
    return this.createError("INTERNAL_SERVER_ERROR", "A database error occurred", context, error);
  }

  /**
   * Handles authorization errors
   * @param message - The error message
   * @param context - Additional context
   * @returns A properly formatted TRPCError
   */
  static handleAuthorizationError(message: string, context?: ErrorContext): TRPCError {
    return this.createError("FORBIDDEN", message, context);
  }

  /**
   * Handles authentication errors
   * @param message - The error message
   * @param context - Additional context
   * @returns A properly formatted TRPCError
   */
  static handleAuthenticationError(message: string, context?: ErrorContext): TRPCError {
    return this.createError("UNAUTHORIZED", message, context);
  }

  /**
   * Handles validation errors
   * @param message - The error message
   * @param context - Additional context
   * @returns A properly formatted TRPCError
   */
  static handleValidationError(message: string, context?: ErrorContext): TRPCError {
    return this.createError("VALIDATION_ERROR", message, context);
  }

  /**
   * Handles resource not found errors
   * @param resourceType - The type of resource that wasn't found
   * @param resourceId - The ID of the resource that wasn't found
   * @param context - Additional context
   * @returns A properly formatted TRPCError
   */
  static handleNotFoundError(resourceType: string, resourceId: string | number, context?: ErrorContext): TRPCError {
    return this.createError("NOT_FOUND", `${resourceType} with ID ${resourceId} not found`, {
      ...context,
      resourceType,
      resourceId,
    });
  }

  /**
   * Wraps an async operation with standardized error handling
   * @param operation - The async operation to wrap
   * @param context - Error context
   * @param errorMessage - Custom error message for failures
   * @returns The result of the operation or throws a standardized error
   */
  static async wrapOperation<T>(
    operation: () => Promise<T>,
    context?: ErrorContext,
    errorMessage?: string
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error; // Re-throw TRPC errors as-is
      }

      if (error instanceof Error) {
        // Check if it's a database error
        if (this.isDatabaseError(error)) {
          throw this.handleDatabaseError(error, context);
        }

        // Default to internal server error
        throw this.createError("INTERNAL_SERVER_ERROR", errorMessage || "An unexpected error occurred", context, error);
      }

      // Handle non-Error objects
      throw this.createError("INTERNAL_SERVER_ERROR", errorMessage || "An unexpected error occurred", context);
    }
  }

  /**
   * Formats a log message with context information
   * @param message - The base message
   * @param context - Error context
   * @param cause - The original error
   * @returns A formatted log message
   */
  private static formatLogMessage(message: string, context?: ErrorContext, cause?: Error): string {
    const parts = [message];

    if (context) {
      const contextParts: string[] = [];

      if (context.operation) contextParts.push(`operation: ${context.operation}`);
      if (context.userId) contextParts.push(`userId: ${context.userId}`);
      if (context.organizationId) contextParts.push(`organizationId: ${context.organizationId}`);
      if (context.resourceType && context.resourceId) {
        contextParts.push(`resource: ${context.resourceType}:${context.resourceId}`);
      }

      if (contextParts.length > 0) {
        parts.push(`(${contextParts.join(", ")})`);
      }

      if (context.additionalData) {
        parts.push(`data: ${JSON.stringify(context.additionalData)}`);
      }
    }

    if (cause) {
      parts.push(`cause: ${cause.message}`);
    }

    return parts.join(" ");
  }

  /**
   * Checks if an error is a database-related error
   * @param error - The error to check
   * @returns True if it's a database error
   */
  private static isDatabaseError(error: Error): boolean {
    const message = error.message.toLowerCase();
    const dbErrorKeywords = [
      "duplicate key",
      "unique constraint",
      "foreign key",
      "violates",
      "constraint",
      "relation",
      "column",
      "table",
      "database",
      "connection",
      "timeout",
    ];

    return dbErrorKeywords.some((keyword) => message.includes(keyword));
  }
}

/**
 * Convenience functions for common error scenarios
 */
export const createNotFoundError = (resourceType: string, resourceId: string | number, context?: ErrorContext) =>
  ErrorHandler.handleNotFoundError(resourceType, resourceId, context);

export const createAuthorizationError = (message: string, context?: ErrorContext) =>
  ErrorHandler.handleAuthorizationError(message, context);

export const createAuthenticationError = (message: string, context?: ErrorContext) =>
  ErrorHandler.handleAuthenticationError(message, context);

export const createValidationError = (message: string, context?: ErrorContext) =>
  ErrorHandler.handleValidationError(message, context);

export const wrapDatabaseOperation = <T>(operation: () => Promise<T>, context?: ErrorContext, errorMessage?: string) =>
  ErrorHandler.wrapOperation(operation, context, errorMessage);
