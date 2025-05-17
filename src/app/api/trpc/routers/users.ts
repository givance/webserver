import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { getUserById, updateUserMemory, addDismissedMemory } from "@/app/lib/data/users";
import { logger } from "@/app/lib/logger";

export const usersRouter = router({
  /**
   * Get the current user's details including memory
   */
  getCurrent: protectedProcedure.query(async ({ ctx }) => {
    const user = await getUserById(ctx.auth.user.id);
    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }
    return user;
  }),

  /**
   * Update the user's memory array
   */
  updateMemory: protectedProcedure
    .input(
      z.object({
        memory: z.array(z.string()),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const userId = ctx.auth.user.id;
        const updated = await updateUserMemory(userId, input.memory);
        if (!updated) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found",
          });
        }
        return updated;
      } catch (error) {
        logger.error(`Failed to update user memory: ${error instanceof Error ? error.message : String(error)}`);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update user memory",
          cause: error,
        });
      }
    }),

  /**
   * Dismiss a memory item
   */
  dismissMemory: protectedProcedure
    .input(
      z.object({
        memory: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const userId = ctx.auth.user.id;
        const updated = await addDismissedMemory(userId, input.memory);
        if (!updated) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found",
          });
        }
        return updated;
      } catch (error) {
        logger.error(`Failed to dismiss memory: ${error instanceof Error ? error.message : String(error)}`);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to dismiss memory",
          cause: error,
        });
      }
    }),
});
