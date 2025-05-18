/**
 * This is your entry point to setup the root configuration for tRPC on the server.
 * - `initTRPC` should only be used once per app.
 * - We export only the functionality that we use so we can enforce which base procedures should be used
 */
import { initTRPC, TRPCError } from "@trpc/server";
import { ZodError } from "zod";
import { Context } from "./context";
import { logger } from "@/app/lib/logger";

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
 * Protected procedure - requires authenticated user
 * Provides strongly typed user object in context
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.auth.user) {
    logger.error(`No user found in auth (function: protectedProcedure)`);
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return next({ ctx: { ...ctx, auth: { user: ctx.auth.user } } });
});

/**
 * Admin procedure - requires authenticated user with admin role
 * Extends protectedProcedure to ensure user is authenticated first
 */
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!ctx.auth.user.isAdmin()) {
    logger.error(
      `User is not an admin (function: adminProcedure, userId: ${ctx.auth.user.id}, role: ${ctx.auth.user.role})`
    );
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  return next({ ctx });
});
