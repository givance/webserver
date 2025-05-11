/**
 * This is your entry point to setup the root configuration for tRPC on the server.
 * - `initTRPC` should only be used once per app.
 * - We export only the functionality that we use so we can enforce which base procedures should be used
 */
import { initTRPC, TRPCError } from "@trpc/server";
import { ZodError } from "zod";
import { getAuth } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";

/**
 * Context type containing user and organization information
 */
export type Context = {
  userId: string | null;
  orgId: string | null;
};

/**
 * Creates context for each request
 */
export const createContext = async (opts: { req: NextRequest }) => {
  const { userId, orgId } = getAuth(opts.req);
  return { userId, orgId };
};

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
 * Middleware to ensure user is authenticated
 */
const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  return next({
    ctx: {
      userId: ctx.userId,
      orgId: ctx.orgId,
    },
  });
});

/**
 * Middleware to ensure user is in an organization
 */
const isInOrg = t.middleware(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  if (!ctx.orgId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You must be in an organization to access this resource",
    });
  }
  return next({
    ctx: {
      userId: ctx.userId,
      orgId: ctx.orgId,
    },
  });
});

/**
 * Export reusable router and procedure helpers
 * that can be used throughout the router
 */
export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(isAuthed);
export const orgProcedure = t.procedure.use(isInOrg);
