"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import React, { useState } from "react";
import { trpc } from "@/app/lib/trpc/client";
import { errorLink } from "@/app/lib/trpc/error-link";

/**
 * Props for the TRPCProvider component
 */
interface TRPCProviderProps {
  children: React.ReactNode;
}

/**
 * tRPC Provider component
 * This sets up the tRPC client and React Query provider
 * @param children Child components that will have access to tRPC client
 */
export default function TRPCProvider({ children }: TRPCProviderProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes - prevent redundant calls
            refetchOnWindowFocus: false,
            refetchOnMount: "always", // Use "always" instead of true for better control
            refetchOnReconnect: false, // Prevent automatic refetch on reconnect
            retry: 1, // Limit retry attempts
          },
        },
      })
  );
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        errorLink,
        httpBatchLink({
          url: "/api/trpc",
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
