"use client";

import { useTodos } from "@/app/hooks/use-todos";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/app/lib/utils/format";
import { CheckCircle2, Circle, Clock, XCircle, Star, MoreHorizontal, Search, Mail } from "lucide-react";
import Link from "next/link";
import type { Todo } from "@/app/types/todo";
import { cn } from "@/lib/utils";
import React from "react";
import { Input } from "@/components/ui/input";

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

function TodoTypeTag({ type, title, donorId }: { type: string; title: string; donorId?: number | null }) {
  const getTagStyle = (type: string) => {
    const styles = {
      Social: "bg-red-100 text-red-700",
      "Theme Support": "bg-orange-100 text-orange-700",
      Friends: "bg-blue-100 text-blue-700",
      Freelance: "bg-green-100 text-green-700",
      Coding: "bg-purple-100 text-purple-700",
      PREDICTED_ACTION: "bg-purple-100 text-purple-700",
      default: "bg-gray-100 text-gray-700",
    };
    return styles[type as keyof typeof styles] || styles.default;
  };

  const isEmailAction = title.toLowerCase() === "email" || title.toLowerCase() === "custom_message";

  return (
    <div className="flex items-center gap-2">
      <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium", getTagStyle(type))}>{type}</span>
      {isEmailAction && donorId && (
        <Link href={`/donors/email/${donorId}?autoDraft=true`}>
          <Button
            size="sm"
            variant="default"
            className="h-6 px-2 py-1 text-xs gap-1 bg-blue-500 hover:bg-blue-600 text-white"
          >
            <Mail className="h-3 w-3" />
            Draft Email
          </Button>
        </Link>
      )}
    </div>
  );
}

interface TodosByDate {
  [key: string]: (Todo & { donorName: string | null })[];
}

function groupTodosByDate(todos: (Todo & { donorName: string | null })[]): TodosByDate {
  const groups: TodosByDate = {};

  // First, sort todos by scheduled date
  const sortedTodos = [...todos].sort((a, b) => {
    const dateA = a.scheduledDate ? new Date(a.scheduledDate).getTime() : Number.MAX_SAFE_INTEGER;
    const dateB = b.scheduledDate ? new Date(b.scheduledDate).getTime() : Number.MAX_SAFE_INTEGER;
    return dateA - dateB;
  });

  // Group todos by scheduled date
  sortedTodos.forEach((todo) => {
    let dateKey = "Not Scheduled";
    if (todo.scheduledDate) {
      const date = new Date(todo.scheduledDate);
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      if (date.toDateString() === today.toDateString()) {
        dateKey = "Today";
      } else if (date.toDateString() === tomorrow.toDateString()) {
        dateKey = "Tomorrow";
      } else {
        dateKey = formatDate(todo.scheduledDate);
      }
    }

    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(todo);
  });

  return groups;
}

function TodoList({ todos }: { todos: (Todo & { donorName: string | null })[] }) {
  const todosByDate = groupTodosByDate(todos);

  console.log(todosByDate);

  return (
    <div className="space-y-6">
      {Object.entries(todosByDate).map(([date, dateTodos]) => (
        <div key={date} className="space-y-2">
          <div className="sticky top-0 bg-gray-50/95 backdrop-blur-sm z-10 py-2">
            <h2 className="text-sm font-medium text-gray-500">
              {date}
              <span className="ml-2 text-gray-400">({dateTodos.length} tasks)</span>
            </h2>
          </div>
          <div className="space-y-1">
            {dateTodos.map((todo) => (
              <div
                key={todo.id}
                className="group flex items-center gap-3 rounded-lg border border-transparent bg-white p-3 hover:border-gray-200 hover:bg-gray-50/50"
              >
                <div className="flex-none">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded-sm border-gray-300 text-primary focus:ring-primary"
                    checked={todo.status.toUpperCase() === "COMPLETED"}
                    onChange={() => {}}
                  />
                </div>

                <Star className="h-4 w-4 flex-none text-gray-400 hover:text-yellow-400 cursor-pointer" />

                <div className="min-w-0 flex-auto">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-gray-900">{todo.title}</p>
                    <TodoTypeTag type={todo.type} title={todo.title} donorId={todo.donorId ?? undefined} />
                  </div>
                  {todo.description && <p className="mt-1 truncate text-sm text-gray-500">{todo.description}</p>}
                </div>

                {todo.donorName && (
                  <div className="flex-none">
                    <Link
                      href={`/donors/${todo.donorId}`}
                      className="flex items-center gap-2 text-sm text-blue-500 hover:text-blue-700"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                        {todo.donorName
                          .split(" ")
                          .map((name) => name[0])
                          .join("")}
                      </div>
                      <span>{todo.donorName}</span>
                    </Link>
                  </div>
                )}

                <button className="flex-none opacity-0 group-hover:opacity-100">
                  <MoreHorizontal className="h-5 w-5 text-gray-400" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const { groupedTodos, isLoadingGroupedTodos } = useTodos();
  const [searchQuery, setSearchQuery] = React.useState("");

  if (isLoadingGroupedTodos) {
    return (
      <div className="container mx-auto py-8">
        <h1 className="text-2xl font-bold mb-6">Organization Tasks</h1>
        <div className="h-96 w-full animate-pulse bg-gray-100 rounded-lg" />
      </div>
    );
  }

  const todoGroups = (groupedTodos || {}) as Record<string, (Todo & { donorName: string | null })[]>;
  const allTodos = Object.values(todoGroups).flat();
  const hasAnyTodos = allTodos.length > 0;

  const filteredTodos = allTodos.filter(
    (todo) =>
      todo.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      todo.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      todo.donorName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="container mx-auto py-8 max-w-5xl">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Organization Tasks</h1>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              type="search"
              placeholder="Search tasks..."
              className="pl-10 w-64"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button className="bg-primary hover:bg-primary/90">Add Task</Button>
        </div>
      </div>

      {hasAnyTodos ? (
        <div className="rounded-xl border bg-gray-50/50 p-4">
          <TodoList todos={filteredTodos} />
        </div>
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
