"use client";

import { useTodos } from "@/app/hooks/use-todos";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/app/lib/utils/format";
import {
  CheckCircle2,
  Circle,
  Clock,
  XCircle,
  Star,
  MoreHorizontal,
  Search,
  Mail,
  CheckSquare,
  Square,
  User,
} from "lucide-react";
import Link from "next/link";
import type { Todo } from "@/app/types/todo";
import { cn } from "@/lib/utils";
import React from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/app/lib/trpc/client";
import { useOrganization } from "@/app/hooks/use-organization";

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

  const showBadge = type.toUpperCase() !== "PREDICTED_ACTION";

  return (
    <div className="flex items-center gap-2">
      {showBadge && (
        <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium", getTagStyle(type))}>{type}</span>
      )}
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

function TodoList({
  todos,
  selectedTodoIds,
  onToggleSelection,
  onPushTodo,
  onCompleteTodo,
  onSkipTodo,
  onAssignStaff,
  staffMembers,
}: {
  todos: (Todo & { donorName: string | null })[];
  selectedTodoIds: Set<number>;
  onToggleSelection: (todoId: number) => void;
  onPushTodo: (todoId: number, days: number) => void;
  onCompleteTodo: (todoId: number) => void;
  onSkipTodo: (todoId: number) => void;
  onAssignStaff: (todoId: number, staffId: number | undefined) => void;
  staffMembers: { id: number; firstName: string; lastName: string }[];
}) {
  const todosByDate = groupTodosByDate(todos);

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
                className={cn(
                  "group flex items-center gap-3 rounded-lg border bg-white p-3 shadow-sm transition-all hover:shadow-md",
                  selectedTodoIds.has(todo.id) && "bg-blue-50 border-blue-200 hover:bg-blue-100"
                )}
              >
                <div className="flex-none">
                  <Checkbox
                    id={`todo-select-${todo.id}`}
                    checked={selectedTodoIds.has(todo.id)}
                    onCheckedChange={() => onToggleSelection(todo.id)}
                    aria-label={`Select task ${todo.title}`}
                    className="h-4 w-4 rounded-sm border-gray-300 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground focus:ring-primary"
                  />
                </div>

                <Star className="h-4 w-4 flex-none text-gray-300 hover:text-yellow-400 cursor-pointer" />

                <div className="min-w-0 flex-auto">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-gray-900">{todo.title}</p>
                    <TodoTypeTag type={todo.type} title={todo.title} donorId={todo.donorId ?? undefined} />
                  </div>
                  {todo.description && <p className="mt-1 truncate text-sm text-gray-600">{todo.description}</p>}
                </div>

                {todo.donorName && (
                  <div className="flex-none ml-auto mr-2">
                    <Link
                      href={`/donors/${todo.donorId}`}
                      className="flex items-center gap-2 text-sm text-gray-700 hover:text-blue-600"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-700">
                        {todo.donorName
                          .split(" ")
                          .map((name) => name[0])
                          .join("")}
                      </div>
                      <span className="hidden sm:inline">{todo.donorName}</span>
                    </Link>
                  </div>
                )}

                {/* Staff Assignment */}
                <div className="flex-none">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-700">
                      {todo.staffId ? (
                        (() => {
                          const staff = staffMembers.find((s) => s.id === todo.staffId);
                          return staff ? (
                            `${staff.firstName[0]}${staff.lastName[0]}`
                          ) : (
                            <User className="h-4 w-4 text-gray-400" />
                          );
                        })()
                      ) : (
                        <User className="h-4 w-4 text-gray-400" />
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex-none">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-500 hover:text-gray-700">
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onPushTodo(todo.id, 1)}>Push 1 day</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onPushTodo(todo.id, 7)}>Push 7 days</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <User className="mr-2 h-4 w-4" />
                          <span>Assign to</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          <DropdownMenuItem onClick={() => onAssignStaff(todo.id, undefined)}>
                            Unassign
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {staffMembers.map((staff) => (
                            <DropdownMenuItem key={staff.id} onClick={() => onAssignStaff(todo.id, staff.id)}>
                              {staff.firstName} {staff.lastName}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onCompleteTodo(todo.id)}
                        disabled={todo.status.toUpperCase() === "COMPLETED"}
                      >
                        Complete
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onSkipTodo(todo.id)}>Skip</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const {
    groupedTodos,
    isLoadingGroupedTodos,
    updateTodoStatus,
    pushTodoScheduledDate,
    bulkUpdateTodosStatus,
    bulkPushTodosScheduledDate,
    updateTodo,
  } = useTodos();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedTodoIds, setSelectedTodoIds] = React.useState<Set<number>>(new Set());
  const { getOrganization } = useOrganization();
  const { data: organizationData } = getOrganization();

  // Fetch staff members
  const { data: staffListResponse } = trpc.staff.list.useQuery(
    {}, // Empty object for input, as organizationId is from context
    { enabled: !!organizationData?.id } // Only run query if organizationId is available
  );

  const staffMembers = React.useMemo(
    () =>
      staffListResponse?.staff?.map((s) => ({
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
      })) || [],
    [staffListResponse?.staff]
  );

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

  const toggleTodoSelection = (todoId: number) => {
    setSelectedTodoIds((prevSelectedIds) => {
      const newSelectedIds = new Set(prevSelectedIds);
      if (newSelectedIds.has(todoId)) {
        newSelectedIds.delete(todoId);
      } else {
        newSelectedIds.add(todoId);
      }
      return newSelectedIds;
    });
  };

  const toggleSelectAll = () => {
    if (selectedTodoIds.size === filteredTodos.length) {
      setSelectedTodoIds(new Set());
    } else {
      setSelectedTodoIds(new Set(filteredTodos.map((todo) => todo.id)));
    }
  };

  const handleBulkPush = async (days: number) => {
    if (selectedTodoIds.size === 0) return;
    try {
      await bulkPushTodosScheduledDate(Array.from(selectedTodoIds), days);
      setSelectedTodoIds(new Set()); // Clear selection after action
    } catch (error) {
      // TODO: Add proper error handling/toast notification
    }
  };

  const handleBulkComplete = async () => {
    if (selectedTodoIds.size === 0) return;
    try {
      await bulkUpdateTodosStatus(Array.from(selectedTodoIds), "COMPLETED");
      setSelectedTodoIds(new Set()); // Clear selection after action
    } catch (error) {
      // TODO: Add proper error handling/toast notification
    }
  };

  const handleBulkSkip = async () => {
    if (selectedTodoIds.size === 0) return;
    try {
      await bulkUpdateTodosStatus(Array.from(selectedTodoIds), "CANCELLED");
      setSelectedTodoIds(new Set()); // Clear selection after action
    } catch (error) {
      // TODO: Add proper error handling/toast notification
    }
  };

  // Individual todo action handlers
  const handlePushTodo = async (todoId: number, days: number) => {
    try {
      await pushTodoScheduledDate(todoId, days);
    } catch (error) {
      // TODO: Add proper error handling/toast notification
    }
  };

  const handleCompleteTodo = async (todoId: number) => {
    try {
      await updateTodoStatus(todoId, "COMPLETED");
    } catch (error) {
      // TODO: Add proper error handling/toast notification
    }
  };

  const handleSkipTodo = async (todoId: number) => {
    try {
      await updateTodoStatus(todoId, "CANCELLED");
    } catch (error) {
      // TODO: Add proper error handling/toast notification
    }
  };

  const handleAssignStaff = async (todoId: number, staffId: number | undefined) => {
    try {
      await updateTodo({
        id: todoId,
        staffId,
      });
    } catch (error) {
      // TODO: Add proper error handling/toast notification
    }
  };

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

      {hasAnyTodos && selectedTodoIds.size > 0 && (
        <div className="mb-4 p-3 rounded-lg border bg-gray-100 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Checkbox
                id="select-all-checkbox"
                checked={selectedTodoIds.size > 0 && selectedTodoIds.size === filteredTodos.length}
                onCheckedChange={toggleSelectAll}
                disabled={filteredTodos.length === 0}
                aria-label="Select all tasks"
              />
              <label htmlFor="select-all-checkbox" className="text-sm font-medium text-gray-700 cursor-pointer">
                {selectedTodoIds.size} task{selectedTodoIds.size === 1 ? "" : "s"} selected
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkPush(1)}
                disabled={selectedTodoIds.size === 0}
              >
                Push 1 Day
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkPush(7)}
                disabled={selectedTodoIds.size === 0}
              >
                Push 7 Days
              </Button>
              <Button variant="outline" size="sm" onClick={handleBulkComplete} disabled={selectedTodoIds.size === 0}>
                Complete
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkSkip}
                disabled={selectedTodoIds.size === 0}
                className="text-red-600 hover:bg-red-50 hover:text-red-700 border-red-300 hover:border-red-400 focus:ring-red-500"
              >
                Skip
              </Button>
            </div>
          </div>
        </div>
      )}

      {hasAnyTodos ? (
        <div className="rounded-xl border bg-gray-50/50 p-4">
          <TodoList
            todos={filteredTodos}
            selectedTodoIds={selectedTodoIds}
            onToggleSelection={toggleTodoSelection}
            onPushTodo={handlePushTodo}
            onCompleteTodo={handleCompleteTodo}
            onSkipTodo={handleSkipTodo}
            onAssignStaff={handleAssignStaff}
            staffMembers={staffMembers}
          />
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500">
            {searchQuery
              ? "No tasks match your search."
              : "No active tasks. Check back later or go to donors to analyze and generate new tasks."}
          </p>
          {filteredTodos.length === 0 && Object.keys(todoGroups || {}).length === 0 && !searchQuery && (
            <TodoList
              todos={[]}
              selectedTodoIds={selectedTodoIds}
              onToggleSelection={toggleTodoSelection}
              onPushTodo={handlePushTodo}
              onCompleteTodo={handleCompleteTodo}
              onSkipTodo={handleSkipTodo}
              onAssignStaff={handleAssignStaff}
              staffMembers={staffMembers}
            />
          )}
          <Link href="/donors" className="mt-4 inline-block">
            <Button>Go to Donors</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
