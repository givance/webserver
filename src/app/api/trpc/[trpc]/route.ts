import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "../routers/_app";

/**
 * Handle tRPC API requests
 * @param req The request object
 * @returns Response from the tRPC API
 */
const handler = async (req: Request) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => ({}),
    onError:
      process.env.NODE_ENV === "development"
        ? ({ path, error }) => {
            console.error(`❌ tRPC error on '${path}':`, error);
          }
        : undefined,
  });
};

export { handler as GET, handler as POST };
