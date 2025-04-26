"use client";

import { useState } from "react";
import { trpc } from "../lib/trpc/client";

/**
 * Hook for interacting with the example tRPC router
 * Provides simple methods for common example operations
 */
export function useExample() {
  // State for add mutation inputs
  const [a, setA] = useState(0);
  const [b, setB] = useState(0);

  // Get the hello query with the name "TRPC"
  const hello = trpc.example.hello.useQuery({ name: "TRPC" });

  // Get the server time query
  const serverTime = trpc.example.getServerTime.useQuery();

  // Add mutation hook
  const addMutation = trpc.example.add.useMutation();

  /**
   * Add two numbers using the tRPC mutation
   */
  const handleAdd = async () => {
    try {
      const result = await addMutation.mutateAsync({ a, b });
      return result.sum;
    } catch (error) {
      console.error("Failed to add numbers:", error);
      return null;
    }
  };

  return {
    hello: hello.data?.greeting,
    isHelloLoading: hello.isLoading,
    serverTime: serverTime.data?.formatted,
    isServerTimeLoading: serverTime.isLoading,
    a,
    b,
    setA,
    setB,
    handleAdd,
    isAddingLoading: addMutation.isPending,
    addResult: addMutation.data?.sum,
  };
}
