"use client";

import { useTodos } from "@/app/hooks/use-todos";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/app/lib/utils/format";
import { CheckCircle2, Circle, Clock, XCircle } from "lucide-react";
import Link from "next/link";
import type { Todo } from "@/app/types/todo";

function TodoStatusIcon({ status }: { status: string }) {
  switch (status.toUpperCase()) {
    case "COMPLETED":
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case "IN_PROGRESS":
      return <Clock className="w-4 h-4 text-blue-500" />;
    case "CANCELLED":
      return <XCircle className="w-4 h-4 text-red-500" />;
    default:
      return <Circle className="w-4 h-4 text-gray-500" />;
  }
}

function TodoCard({ todo }: { todo: Todo }) {
  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg">{todo.title}</CardTitle>
            <CardDescription className="mt-1">
              {todo.donorId && (
                <Link href={`/donors/${todo.donorId}`} className="text-blue-500 hover:underline">
                  View Donor
                </Link>
              )}
            </CardDescription>
          </div>
          <TodoStatusIcon status={todo.status} />
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-600 mb-2">{todo.description}</p>
        <div className="flex gap-4 text-xs text-gray-500">
          {todo.dueDate && <span>Due: {formatDate(todo.dueDate)}</span>}
          {todo.scheduledDate && <span>Scheduled: {formatDate(todo.scheduledDate)}</span>}
        </div>
        {todo.instruction && (
          <div className="mt-2 p-2 bg-gray-50 rounded-md text-sm">
            <strong>Instructions:</strong> {todo.instruction}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TodoGroup({ title, todos }: { title: string; todos: Todo[] }) {
  return (
    <div className="mb-8">
      <h2 className="text-xl font-semibold mb-4">{title}</h2>
      <div className="space-y-4">
        {todos.map((todo) => (
          <TodoCard key={todo.id} todo={todo} />
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const { groupedTodos, isLoadingGroupedTodos } = useTodos();

  if (isLoadingGroupedTodos) {
    return (
      <div className="container mx-auto py-8">
        <h1 className="text-2xl font-bold mb-6">Organization Tasks</h1>
        <div className="space-y-8">
          {[1, 2].map((i) => (
            <div key={i} className="space-y-4">
              <Skeleton className="h-8 w-48" />
              <div className="space-y-4">
                {[1, 2, 3].map((j) => (
                  <Skeleton key={j} className="h-32 w-full" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const todoGroups = (groupedTodos || {}) as Record<string, Todo[]>;
  const hasAnyTodos = Object.values(todoGroups).some((group) => group.length > 0);

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Organization Tasks</h1>
        <Link href="/donors">
          <Button>View All Donors</Button>
        </Link>
      </div>

      {hasAnyTodos ? (
        Object.entries(todoGroups).map(([type, todos]) =>
          todos.length > 0 ? <TodoGroup key={type} title={type} todos={todos} /> : null
        )
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500">No tasks found. Start by analyzing your donors to get predictions.</p>
          <Link href="/donors" className="mt-4 inline-block">
            <Button>Go to Donors</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
