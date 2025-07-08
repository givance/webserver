/**
 * This is your entry point to setup the root configuration for tRPC on the server.
 * - `initTRPC` should only be used once per app.
 * - We export only the functionality that we use so we can enforce which base procedures should be used
 */
import { initTRPC, TRPCError } from '@trpc/server';
import { ZodError } from 'zod';
import { Context } from './context';
import { logger } from '@/app/lib/logger';
import { ErrorHandler } from '@/app/lib/utils/error-handler';

/**
 * Standard error messages for common scenarios
 */
export const ERROR_MESSAGES = {
  // Authentication & Authorization
  UNAUTHORIZED: 'You must be logged in to perform this action',
  FORBIDDEN: "You don't have permission to perform this action",
  ORGANIZATION_MISMATCH: "Access denied to this organization's data",

  // Resource errors
  NOT_FOUND: (resource: string) => `${resource} not found`,
  ALREADY_EXISTS: (resource: string) => `${resource} already exists`,

  // Validation errors
  INVALID_INPUT: 'Invalid input provided',
  MISSING_REQUIRED: (field: string) => `${field} is required`,

  // Operation errors
  OPERATION_FAILED: (operation: string) => `Failed to ${operation}`,
  RATE_LIMITED: 'Too many requests. Please try again later',

  // System errors
  INTERNAL_ERROR: 'An unexpected error occurred. Please try again later',
  SERVICE_UNAVAILABLE: 'Service temporarily unavailable',
} as const;

/**
 * Options for creating a standardized TRPC error
 */
interface TRPCErrorOptions {
  code: TRPCError['code'];
  message: string;
  cause?: unknown;
  logLevel?: 'error' | 'warn' | 'info';
  metadata?: Record<string, unknown>;
}

/**
 * Creates a standardized TRPC error with consistent logging
 */
export function createTRPCError({
  code,
  message,
  cause,
  logLevel = 'error',
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

  if (logLevel === 'error') {
    logger.error('TRPC error occurred', logData);
  } else if (logLevel === 'warn') {
    logger.warn('TRPC warning', logData);
  } else {
    logger.info('TRPC info', logData);
  }

  return new TRPCError({
    code,
    message,
    cause,
  });
}

/**
 * Creates a NOT_FOUND error for a resource
 */
export function notFoundError(resourceName: string): TRPCError {
  return createTRPCError({
    code: 'NOT_FOUND',
    message: ERROR_MESSAGES.NOT_FOUND(resourceName),
    logLevel: 'info',
  });
}

/**
 * Creates a CONFLICT error for duplicate resources
 */
export function conflictError(resourceName: string): TRPCError {
  return createTRPCError({
    code: 'CONFLICT',
    message: ERROR_MESSAGES.ALREADY_EXISTS(resourceName),
    logLevel: 'info',
  });
}

/**
 * Validates that a resource belongs to the specified organization
 */
export function validateOrganizationAccess(
  resourceOrgId: string,
  userOrgId: string,
  resourceName = 'Resource'
): void {
  if (resourceOrgId !== userOrgId) {
    throw createTRPCError({
      code: 'FORBIDDEN',
      message: ERROR_MESSAGES.ORGANIZATION_MISMATCH,
      logLevel: 'warn',
      metadata: {
        resourceOrgId,
        userOrgId,
        resourceName,
      },
    });
  }
}

/**
 * Checks a condition and throws a TRPC error if it's true, with logging
 *
 * @param condition - The condition to check
 * @param code - The TRPC error code
 * @param message - The error message
 *
 * @example
 * // Check if user lacks organization access
 * check(!ctx.auth.user?.organizationId, 'UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED);
 *
 * @example
 * // Check if resource not found
 * check(!project, 'NOT_FOUND', ERROR_MESSAGES.NOT_FOUND('Project'));
 */
export function check(condition: boolean, code: TRPCError['code'], message: string): void {
  if (condition) {
    throw createTRPCError({ code, message });
  }
}

/**
 * Initialization of tRPC backend
 * Should be done only once per backend!
 */
const t = initTRPC.context<Context>().create({
  /**
   * Error handling
   */
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * Export reusable router and procedure helpers
 * that can be used throughout the router
 */
export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Error handling middleware that automatically handles database errors
 * and provides consistent error context for all procedures
 */
const withErrorHandling = t.middleware(async ({ ctx, next, path }) => {
  // Type narrowing: ensure user exists for protected procedures
  if (!ctx.auth.user) {
    // This should never happen in protectedProcedure, but provides TypeScript safety
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not authenticated' });
  }

  const authenticatedCtx = { ...ctx, auth: { user: ctx.auth.user } };

  try {
    return await next({ ctx: authenticatedCtx });
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error; // Re-throw TRPC errors as-is
    }

    if (error instanceof Error) {
      // Check if it's a database error
      if (ErrorHandler.isDatabaseError(error)) {
        throw ErrorHandler.handleDatabaseError(error, {
          userId: authenticatedCtx.auth.user.id,
          organizationId: authenticatedCtx.auth.user.organizationId,
          operation: path,
        });
      }

      // Default to internal server error
      throw ErrorHandler.createError(
        'INTERNAL_SERVER_ERROR',
        'An unexpected error occurred',
        {
          userId: authenticatedCtx.auth.user.id,
          organizationId: authenticatedCtx.auth.user.organizationId,
          operation: path,
        },
        error
      );
    }

    // Handle non-Error objects
    throw ErrorHandler.createError('INTERNAL_SERVER_ERROR', 'An unexpected error occurred', {
      userId: authenticatedCtx.auth.user.id,
      organizationId: authenticatedCtx.auth.user.organizationId,
      operation: path,
    });
  }
});

/**
 * Protected procedure - requires authenticated user with automatic error handling
 * Provides strongly typed user object in context
 */
export const protectedProcedure = t.procedure
  .use(async ({ ctx, next }) => {
    if (!ctx.auth.user) {
      logger.error(`No user found in auth (function: protectedProcedure)`);
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    return next({ ctx: { ...ctx, auth: { user: ctx.auth.user } } });
  })
  .use(withErrorHandling);

/**
 * Admin procedure - requires authenticated user with admin role
 * Extends protectedProcedure to ensure user is authenticated first
 */
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!ctx.auth.user.isAdmin()) {
    logger.error(
      `User is not an admin (function: adminProcedure, userId: ${ctx.auth.user.id}, role: ${ctx.auth.user.role})`
    );
    throw new TRPCError({ code: 'FORBIDDEN' });
  }

  return next({ ctx });
});
