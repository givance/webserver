import { db } from "@/app/lib/db";
import { todos } from "@/app/lib/db/schema";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import type { PredictedAction } from "@/app/lib/analysis/types";

export interface CreateTodoInput {
  title: string;
  description: string;
  type: string;
  priority?: string;
  dueDate?: Date;
  scheduledDate?: Date;
  donorId?: number;
  staffId?: number;
  organizationId: string;
  explanation?: string;
  instruction?: string;
}

export interface UpdateTodoInput extends Partial<CreateTodoInput> {
  status?: string;
  completedDate?: Date;
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

  async getTodosGroupedByType(organizationId: string) {
    const allTodos = await db
      .select()
      .from(todos)
      .where(eq(todos.organizationId, organizationId))
      .orderBy(asc(todos.type), desc(todos.createdAt));

    // Group todos by type
    return allTodos.reduce((groups, todo) => {
      const type = todo.type;
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(todo);
      return groups;
    }, {} as Record<string, typeof allTodos>);
  }
}
