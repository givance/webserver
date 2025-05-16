"use client";

import { useCallback } from "react";
import { trpc } from "@/app/lib/trpc/client";
import { useQueryClient } from "@tanstack/react-query";

export function useMemory() {
  const queryClient = useQueryClient();
  const { data: user } = trpc.users.getCurrent.useQuery();
  const { mutateAsync: updateMemory } = trpc.users.updateMemory.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users", "getCurrent"] });
    },
  });

  const addMemoryItem = useCallback(
    async (memoryItem: string) => {
      if (!user?.memory) return;
      const newMemory = [...user.memory, memoryItem];
      await updateMemory({ memory: newMemory });
    },
    [user?.memory, updateMemory]
  );

  const updateMemoryItem = useCallback(
    async (index: number, newMemory: string) => {
      if (!user?.memory) return;
      const updatedMemory = [...user.memory];
      updatedMemory[index] = newMemory;
      await updateMemory({ memory: updatedMemory });
    },
    [user?.memory, updateMemory]
  );

  const deleteMemoryItem = useCallback(
    async (index: number) => {
      if (!user?.memory) return;
      const newMemory = user.memory.filter((_, i) => i !== index);
      await updateMemory({ memory: newMemory });
    },
    [user?.memory, updateMemory]
  );

  return {
    memory: user?.memory || [],
    addMemoryItem,
    updateMemoryItem,
    deleteMemoryItem,
  };
}
