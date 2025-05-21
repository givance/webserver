import { trpc } from "@/app/lib/trpc/client";
import { useCallback } from "react";
import type { Todo } from "@/app/types/todo";

export function useTodos() {
  const utils = trpc.useUtils();

  const { data: groupedTodos, isLoading: isLoadingGroupedTodos } = trpc.todos.getGroupedByType.useQuery<
    Record<string, Todo[]>
  >({
    statusesToExclude: ["COMPLETED", "CANCELLED"],
  });

  const createTodoMutation = trpc.todos.create.useMutation({
    onSuccess: () => {
      utils.todos.getGroupedByType.invalidate();
      utils.todos.getByOrganization.invalidate();
    },
  });

  const updateTodoMutation = trpc.todos.update.useMutation({
    onSuccess: () => {
      utils.todos.getGroupedByType.invalidate();
      utils.todos.getByOrganization.invalidate();
    },
  });

  const updateManyTodosMutation = trpc.todos.updateMany.useMutation({
    onSuccess: () => {
      utils.todos.getGroupedByType.invalidate();
      utils.todos.getByOrganization.invalidate();
      // Potentially invalidate other queries if needed, e.g., getByDonor if todos from specific donors were updated.
    },
  });

  const deleteTodoMutation = trpc.todos.delete.useMutation({
    onSuccess: () => {
      utils.todos.getGroupedByType.invalidate();
      utils.todos.getByOrganization.invalidate();
    },
  });

  const createTodo = useCallback(
    async (input: Parameters<typeof createTodoMutation.mutateAsync>[0]) => {
      return await createTodoMutation.mutateAsync(input);
    },
    [createTodoMutation]
  );

  const updateTodo = useCallback(
    async (input: Parameters<typeof updateTodoMutation.mutateAsync>[0]) => {
      return await updateTodoMutation.mutateAsync(input);
    },
    [updateTodoMutation]
  );

  const updateTodoStatus = useCallback(
    async (todoId: number, status: string, completedDate?: Date | null) => {
      const input: Parameters<typeof updateTodoMutation.mutateAsync>[0] = {
        id: todoId,
        status,
      };
      if (status.toUpperCase() === "COMPLETED") {
        input.completedDate = completedDate instanceof Date ? completedDate : new Date();
      } else if (
        status.toUpperCase() === "CANCELLED" ||
        status.toUpperCase() === "IN_PROGRESS" ||
        status.toUpperCase() === "OPEN"
      ) {
        // When moving to a non-completed state, ensure completedDate is cleared if it was set
        // The backend input for update allows completedDate to be explicitly set to null to clear it.
        // However, our current `updateTodo` in the router expects `Date | undefined`.
        // For now, we won't explicitly send null, but rely on the backend to handle status transitions appropriately.
        // If explicit clearing is needed via frontend, the backend API input for update might need to accept null for completedDate.
        // For now, let's assume backend handles it or we add explicit null later.
      }
      return await updateTodoMutation.mutateAsync(input);
    },
    [updateTodoMutation]
  );

  const pushTodoScheduledDate = useCallback(
    async (todoId: number, days: number) => {
      const newScheduledDate = new Date();
      newScheduledDate.setDate(newScheduledDate.getDate() + days);
      return await updateTodoMutation.mutateAsync({
        id: todoId,
        scheduledDate: newScheduledDate,
      });
    },
    [updateTodoMutation]
  );

  const bulkUpdateTodosStatus = useCallback(
    async (todoIds: number[], status: string, completedDate?: Date | null) => {
      const data: Parameters<typeof updateManyTodosMutation.mutateAsync>[0]["data"] = {
        status,
      };
      if (status.toUpperCase() === "COMPLETED") {
        data.completedDate = completedDate instanceof Date ? completedDate : new Date();
      } else {
        // If moving to a non-completed state, and we want to ensure completedDate is cleared,
        // the `updateMany` input schema allows `completedDate: null`.
        data.completedDate = null;
      }
      return await updateManyTodosMutation.mutateAsync({ ids: todoIds, data });
    },
    [updateManyTodosMutation]
  );

  const bulkPushTodosScheduledDate = useCallback(
    async (todoIds: number[], days: number) => {
      const newScheduledDate = new Date();
      newScheduledDate.setDate(newScheduledDate.getDate() + days);
      const data: Parameters<typeof updateManyTodosMutation.mutateAsync>[0]["data"] = {
        scheduledDate: newScheduledDate,
      };
      return await updateManyTodosMutation.mutateAsync({ ids: todoIds, data });
    },
    [updateManyTodosMutation]
  );

  const deleteTodo = useCallback(
    async (input: Parameters<typeof deleteTodoMutation.mutateAsync>[0]) => {
      return await deleteTodoMutation.mutateAsync(input);
    },
    [deleteTodoMutation]
  );

  return {
    groupedTodos,
    isLoadingGroupedTodos,
    createTodo,
    updateTodo,
    updateTodoStatus,
    pushTodoScheduledDate,
    bulkUpdateTodosStatus,
    bulkPushTodosScheduledDate,
    deleteTodo,
    createTodoMutation,
    updateTodoMutation,
    updateManyTodosMutation,
    deleteTodoMutation,
  };
}
