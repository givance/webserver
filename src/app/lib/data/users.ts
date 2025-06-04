import { db } from "../db";
import { users } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

/**
 * Retrieves a user by their ID.
 * @param id - The ID of the user to retrieve.
 * @returns The user object if found, otherwise undefined.
 */
export async function getUserById(id: string): Promise<User | undefined> {
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

/**
 * Retrieves a user by their email.
 * @param email - The email of the user to retrieve.
 * @returns The user object if found, otherwise undefined.
 */
export async function getUserByEmail(email: string): Promise<User | undefined> {
  try {
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0];
  } catch (error) {
    console.error("Failed to retrieve user by email:", error);
    throw new Error("Could not retrieve user by email.");
  }
}

/**
 * Creates a new user.
 * This is often handled by Clerk webhooks, but this function can be used for manual creation or synchronization.
 * @param userData - The data for the new user.
 * @returns The newly created user object.
 */
export async function createUser(userData: NewUser): Promise<User> {
  try {
    const result = await db.insert(users).values(userData).returning();
    return result[0];
  } catch (error) {
    console.error("Failed to create user:", error);
    // Add more specific error handling, e.g., for unique constraint violations
    if (error instanceof Error && error.message.includes("duplicate key value violates unique constraint")) {
      throw new Error("User with this email already exists.");
    }
    throw new Error("Could not create user.");
  }
}

/**
 * Updates an existing user.
 * @param id - The ID of the user to update.
 * @param userData - The data to update for the user. Note: Clerk User ID ('id') should not be updated here.
 * @returns The updated user object.
 */
export async function updateUser(
  id: string,
  userData: Partial<Omit<NewUser, "id" | "email">>
): Promise<User | undefined> {
  try {
    const result = await db
      .update(users)
      .set({ ...userData, updatedAt: sql`now()` })
      .where(eq(users.id, id))
      .returning();
    return result[0];
  } catch (error) {
    console.error("Failed to update user:", error);
    throw new Error("Could not update user.");
  }
}

/**
 * Lists users.
 * @param limit - Maximum number of users to return.
 * @param offset - Number of users to skip (for pagination).
 * @returns An array of user objects.
 */
export async function listUsers(limit: number = 10, offset: number = 0): Promise<User[]> {
  try {
    return await db.select().from(users).limit(limit).offset(offset);
  } catch (error) {
    console.error("Failed to list users:", error);
    throw new Error("Could not list users.");
  }
}

/**
 * Update a user's memory array
 * @param id The user's ID
 * @param memory The new memory array
 * @returns The updated user or undefined if not found
 */
export async function updateUserMemory(id: string, memory: string[]): Promise<User | undefined> {
  const result = await db.update(users).set({ memory }).where(eq(users.id, id)).returning();
  return result[0];
}

/**
 * Update a user's email signature
 * @param id The user's ID
 * @param emailSignature The new email signature
 * @returns The updated user or undefined if not found
 */
export async function updateUserEmailSignature(id: string, emailSignature: string): Promise<User | undefined> {
  const result = await db
    .update(users)
    .set({ emailSignature, updatedAt: sql`now()` })
    .where(eq(users.id, id))
    .returning();
  return result[0];
}

export async function getUserMemories(id: string): Promise<string[]> {
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0]?.memory || [];
}

export async function getDismissedMemories(id: string): Promise<string[]> {
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0]?.dismissedMemories || [];
}

/**
 * Add a memory to the user's dismissed memories array
 * @param id The user's ID
 * @param memory The memory to dismiss
 * @returns The updated user or undefined if not found
 */
export async function addDismissedMemory(id: string, memory: string): Promise<User | undefined> {
  const user = await getUserById(id);
  const currentDismissedMemories = user?.dismissedMemories || [];

  const result = await db
    .update(users)
    .set({
      dismissedMemories: [...currentDismissedMemories, memory],
      updatedAt: new Date(),
    })
    .where(eq(users.id, id))
    .returning();

  return result[0];
}

// Potentially add a function to delete a user if necessary,
// though this might also be primarily handled by Clerk.
// export async function deleteUser(id: string): Promise<void> {
//   try {
//     await db.delete(users).where(eq(users.id, id));
//   } catch (error) {
//     console.error("Failed to delete user:", error);
//     throw new Error("Could not delete user.");
//   }
// }
