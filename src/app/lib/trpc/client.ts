import { createTRPCReact } from "@trpc/react-query";
import { type AppRouter } from "@/app/api/trpc/routers/_app";

/**
 * tRPC client instance
 * This provides the tRPC functionality for React components
 */
export const trpc = createTRPCReact<AppRouter>();
