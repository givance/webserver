import { db } from '../db';
import { todos, donors } from '../db/schema';
import { eq, and, desc, asc, sql, notInArray } from 'drizzle-orm';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

export type Todo = InferSelectModel<typeof todos>;
export type NewTodo = InferInsertModel<typeof todos>;

/**
 * Creates a new todo
 */
export async function createTodo(
  todoData: Omit<NewTodo, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Todo> {
  try {
    const result = await db.insert(todos).values(todoData).returning();
    return result[0];
  } catch (error) {
    console.error('Failed to create todo:', error);
    throw new Error('Could not create todo.');
  }
}

/**
 * Bulk creates todos
 */
export async function bulkCreateTodos(
  todosData: Array<Omit<NewTodo, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<Todo[]> {
  try {
    if (todosData.length === 0) return [];

    const result = await db.insert(todos).values(todosData).returning();
    return result;
  } catch (error) {
    console.error('Failed to bulk create todos:', error);
    throw new Error('Could not create todos.');
  }
}

/**
 * Updates a todo
 */
export async function updateTodo(
  id: number,
  updates: Partial<Omit<NewTodo, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<Todo | undefined> {
  try {
    const result = await db
      .update(todos)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(todos.id, id))
      .returning();
    return result[0];
  } catch (error) {
    console.error('Failed to update todo:', error);
    throw new Error('Could not update todo.');
  }
}

/**
 * Deletes a todo
 */
export async function deleteTodo(id: number): Promise<Todo | undefined> {
  try {
    const result = await db.delete(todos).where(eq(todos.id, id)).returning();
    return result[0];
  } catch (error) {
    console.error('Failed to delete todo:', error);
    throw new Error('Could not delete todo.');
  }
}

/**
 * Gets todos by organization with optional filtering
 */
export async function getTodosByOrganization(
  organizationId: string,
  options?: {
    type?: string;
    status?: string;
    donorId?: number;
    staffId?: number;
  }
): Promise<Todo[]> {
  try {
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

    const result = await db
      .select()
      .from(todos)
      .where(and(...conditions))
      .orderBy(desc(todos.createdAt));

    return result;
  } catch (error) {
    console.error('Failed to get todos by organization:', error);
    throw new Error('Could not retrieve todos.');
  }
}

/**
 * Gets todos by donor
 */
export async function getTodosByDonor(donorId: number): Promise<Todo[]> {
  try {
    const result = await db
      .select()
      .from(todos)
      .where(eq(todos.donorId, donorId))
      .orderBy(desc(todos.createdAt));
    return result;
  } catch (error) {
    console.error('Failed to get todos by donor:', error);
    throw new Error('Could not retrieve todos by donor.');
  }
}

/**
 * Gets todos by staff member
 */
export async function getTodosByStaff(staffId: number): Promise<Todo[]> {
  try {
    const result = await db
      .select()
      .from(todos)
      .where(eq(todos.staffId, staffId))
      .orderBy(desc(todos.createdAt));
    return result;
  } catch (error) {
    console.error('Failed to get todos by staff:', error);
    throw new Error('Could not retrieve todos by staff.');
  }
}

/**
 * Gets todos grouped by type with donor information
 */
export async function getTodosGroupedByType(
  organizationId: string,
  statusesToExclude?: string[]
): Promise<
  Array<{
    id: number;
    title: string;
    description: string | null;
    type: string;
    status: string;
    priority: string;
    dueDate: string | null;
    scheduledDate: string | null;
    completedDate: string | null;
    donorId: number | null;
    staffId: number | null;
    organizationId: string;
    explanation: string | null;
    createdAt: string;
    updatedAt: string;
    donorFirstName: string | null;
    donorLastName: string | null;
  }>
> {
  try {
    const conditions = [eq(todos.organizationId, organizationId)];

    if (statusesToExclude && statusesToExclude.length > 0) {
      conditions.push(notInArray(todos.status, statusesToExclude));
    }

    const result = await db
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
        createdAt: sql<string>`${todos.createdAt}::text`,
        updatedAt: sql<string>`${todos.updatedAt}::text`,
        donorFirstName: donors.firstName,
        donorLastName: donors.lastName,
      })
      .from(todos)
      .leftJoin(donors, eq(todos.donorId, donors.id))
      .where(and(...conditions))
      .orderBy(asc(todos.type), desc(todos.createdAt));

    return result;
  } catch (error) {
    console.error('Failed to get todos grouped by type:', error);
    throw new Error('Could not retrieve todos grouped by type.');
  }
}
