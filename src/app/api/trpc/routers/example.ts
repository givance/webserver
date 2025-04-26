import { z } from "zod";
import { publicProcedure, router } from "../trpc";

/**
 * Example router with sample queries and mutations
 */
export const exampleRouter = router({
  /**
   * Get a hello message with optional name
   * @param input.name Optional name to greet
   * @returns A greeting message
   */
  hello: publicProcedure
    .input(
      z.object({
        name: z.string().optional(),
      })
    )
    .query(({ input }) => {
      return {
        greeting: `Hello ${input.name ?? "world"}!`,
        timestamp: new Date().toISOString(),
      };
    }),

  /**
   * Get the current server time
   * @returns Current server time information
   */
  getServerTime: publicProcedure.query(() => {
    const now = new Date();
    return {
      time: now.toISOString(),
      unixTimestamp: Math.floor(now.getTime() / 1000),
      formatted: now.toLocaleString(),
    };
  }),

  /**
   * Add two numbers together
   * @param input.a First number
   * @param input.b Second number
   * @returns The sum of the two numbers
   */
  add: publicProcedure
    .input(
      z.object({
        a: z.number(),
        b: z.number(),
      })
    )
    .mutation(({ input }) => {
      return {
        sum: input.a + input.b,
      };
    }),
});
