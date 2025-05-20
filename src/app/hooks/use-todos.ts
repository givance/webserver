import { trpc } from "@/app/lib/trpc/client";
import { useCallback } from "react";
import type { Todo } from "@/app/types/todo";

export function useTodos() {
  const utils = trpc.useUtils();

  const { data: groupedTodos, isLoading: isLoadingGroupedTodos } =
    trpc.todos.getGroupedByType.useQuery<Record<string, Todo[]>>();

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
    deleteTodo,
    createTodoMutation,
    updateTodoMutation,
    deleteTodoMutation,
  };
}
