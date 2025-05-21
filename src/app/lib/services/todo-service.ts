import { db } from "@/app/lib/db";
import { todos, donors } from "@/app/lib/db/schema";
import { eq, and, desc, asc, sql, notInArray } from "drizzle-orm";
import type { PredictedAction } from "@/app/lib/analysis/types";
import type { Todo } from "@/app/types/todo";

export interface CreateTodoInput {
  title: string;
  description: string;
  type: string;
  priority?: string;
  dueDate?: Date;
  scheduledDate?: Date;
  donorId?: number;
  staffId?: number | null;
  organizationId: string;
  explanation?: string;
  instruction?: string;
}

export interface UpdateTodoInput extends Partial<CreateTodoInput> {
  status?: string;
  completedDate?: Date | null;
}

export interface TodoWithDonor extends Todo {
  donorName: string | null;
}

export class TodoService {
  async createTodo(input: CreateTodoInput) {
    return await db
      .insert(todos)
      .values({
        ...input,
        status: "PENDING",
        priority: input.priority || "MEDIUM",
      })
      .returning();
  }

  async createTodosFromPredictedActions(donorId: number, organizationId: string, predictedActions: PredictedAction[]) {
    const todoInputs = predictedActions.map((action) => ({
      title: action.type,
      description: action.description,
      type: "PREDICTED_ACTION",
      status: "PENDING",
      priority: "MEDIUM",
      donorId,
      organizationId,
      scheduledDate: action.scheduledDate ? new Date(action.scheduledDate) : undefined,
      explanation: action.explanation,
      instruction: action.instruction,
    }));

    return await db.insert(todos).values(todoInputs).returning();
  }

  async updateTodo(id: number, input: UpdateTodoInput) {
    const updateData = { ...input };
    delete (updateData as any).organizationId;

    return await db
      .update(todos)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(eq(todos.id, id))
      .returning();
  }

  async deleteTodo(id: number) {
    return await db.delete(todos).where(eq(todos.id, id)).returning();
  }

  async getTodosByOrganization(
    organizationId: string,
    options?: {
      type?: string;
      status?: string;
      donorId?: number;
      staffId?: number;
    }
  ) {
    const conditions = [eq(todos.organizationId, organizationId)];

    if (options?.type) {
      conditions.push(eq(todos.type, options.type));
    }
    if (options?.status) {
      conditions.push(eq(todos.status, options.status));
    }
    if (options?.donorId) {
      conditions.push(eq(todos.donorId, options.donorId));
    }
    if (options?.staffId) {
      conditions.push(eq(todos.staffId, options.staffId));
    }

    return await db
      .select()
      .from(todos)
      .where(and(...conditions))
      .orderBy(desc(todos.createdAt));
  }

  async getTodosByDonor(donorId: number) {
    return await db.select().from(todos).where(eq(todos.donorId, donorId)).orderBy(desc(todos.createdAt));
  }

  async getTodosByStaff(staffId: number) {
    return await db.select().from(todos).where(eq(todos.staffId, staffId)).orderBy(desc(todos.createdAt));
  }

  async getTodosGroupedByType(organizationId: string, statusesToExclude?: string[]) {
    const conditions = [eq(todos.organizationId, organizationId)];

    if (statusesToExclude && statusesToExclude.length > 0) {
      conditions.push(notInArray(todos.status, statusesToExclude));
    }

    const allTodos = await db
      .select({
        id: todos.id,
        title: todos.title,
        description: todos.description,
        type: todos.type,
        status: todos.status,
        priority: todos.priority,
        dueDate: sql<string | null>`${todos.dueDate}::text`,
        scheduledDate: sql<string | null>`${todos.scheduledDate}::text`,
        completedDate: sql<string | null>`${todos.completedDate}::text`,
        donorId: todos.donorId,
        staffId: todos.staffId,
        organizationId: todos.organizationId,
        explanation: todos.explanation,
        instruction: todos.instruction,
        createdAt: sql<string>`${todos.createdAt}::text`,
        updatedAt: sql<string>`${todos.updatedAt}::text`,
        donorFirstName: donors.firstName,
        donorLastName: donors.lastName,
      })
      .from(todos)
      .leftJoin(donors, eq(todos.donorId, donors.id))
      .where(and(...conditions))
      .orderBy(asc(todos.type), desc(todos.createdAt));

    // Group todos by type
    return allTodos.reduce((groups, todo) => {
      const type = todo.type;
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push({
        ...todo,
        donorName: todo.donorFirstName && todo.donorLastName ? `${todo.donorFirstName} ${todo.donorLastName}` : null,
      });
      return groups;
    }, {} as Record<string, TodoWithDonor[]>);
  }
}
