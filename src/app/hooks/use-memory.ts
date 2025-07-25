'use client';

import { trpc } from '@/app/lib/trpc/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export function useMemory() {
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  const { data: user, isLoading } = trpc.users.getCurrent.useQuery();
  const { mutateAsync: updateMemory } = trpc.users.updateMemory.useMutation({
    onMutate: async ({ memory }) => {
      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ['users', 'getCurrent'] });

      // Snapshot the previous value
      const previousUser = queryClient.getQueryData(['users', 'getCurrent']);

      // Optimistically update to the new value
      queryClient.setQueryData(['users', 'getCurrent'], (old: any) => ({
        ...old,
        memory,
      }));

      // Return a context object with the snapshotted value
      return { previousUser };
    },
    onSuccess: () => {
      utils.users.getCurrent.invalidate();
      queryClient.invalidateQueries({ queryKey: ['users', 'getCurrent'] });
    },
    onError: (err, newMemory, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      queryClient.setQueryData(['users', 'getCurrent'], context?.previousUser);
      toast.error('Failed to update memory. Please try again.');
    },
    onSettled: () => {
      // Always refetch after error or success to ensure we have the latest data
      queryClient.invalidateQueries({ queryKey: ['users', 'getCurrent'] });
    },
  });

  const { mutateAsync: dismissMemory } = trpc.users.dismissMemory.useMutation({
    onMutate: async ({ memory }) => {
      await queryClient.cancelQueries({ queryKey: ['users', 'getCurrent'] });
      const previousUser = queryClient.getQueryData(['users', 'getCurrent']);
      queryClient.setQueryData(['users', 'getCurrent'], (old: any) => ({
        ...old,
        dismissedMemories: [...(old?.dismissedMemories || []), memory],
      }));
      return { previousUser };
    },
    onSuccess: () => {
      utils.users.getCurrent.invalidate();
      queryClient.invalidateQueries({ queryKey: ['users', 'getCurrent'] });
    },
    onError: (err, newMemory, context) => {
      queryClient.setQueryData(['users', 'getCurrent'], context?.previousUser);
      toast.error('Failed to dismiss memory. Please try again.');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['users', 'getCurrent'] });
    },
  });

  const addMemoryItem = async (memoryItem: string) => {
    try {
      const currentMemory = user?.memory || [];
      const newMemory = [...currentMemory, memoryItem];
      await updateMemory({ memory: newMemory });
      toast.success('Memory added successfully');
    } catch (error) {
      console.error('Failed to add memory:', error);
      toast.error('Failed to add memory. Please try again.');
    }
  };

  const updateMemoryItem = async (index: number, newMemory: string) => {
    try {
      const currentMemory = user?.memory || [];
      const updatedMemory = [...currentMemory];
      updatedMemory[index] = newMemory;
      await updateMemory({ memory: updatedMemory });
      toast.success('Memory updated successfully');
    } catch (error) {
      console.error('Failed to update memory:', error);
      toast.error('Failed to update memory. Please try again.');
    }
  };

  const deleteMemoryItem = async (index: number) => {
    try {
      const currentMemory = user?.memory || [];
      const updatedMemory = currentMemory.filter((_, i) => i !== index);
      await updateMemory({ memory: updatedMemory });
      toast.success('Memory deleted successfully');
    } catch (error) {
      console.error('Failed to delete memory:', error);
      toast.error('Failed to delete memory. Please try again.');
    }
  };

  const dismissMemoryItem = async (memoryItem: string) => {
    try {
      await dismissMemory({ memory: memoryItem });
    } catch (error) {
      console.error('Failed to dismiss memory:', error);
      throw error;
    }
  };

  return {
    memory: user?.memory || [],
    addMemoryItem,
    updateMemoryItem,
    deleteMemoryItem,
    dismissMemoryItem,
    isLoading,
  };
}
