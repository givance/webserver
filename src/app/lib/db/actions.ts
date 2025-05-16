import { db } from "./index";
import { users, posts } from "./schema";
import { eq, and, desc } from "drizzle-orm";

/**
 * Find a user by their ID
 * @param id The user's ID
 * @returns The user or undefined if not found
 */
export async function getUserById(id: string) {
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);

  return result[0];
}

/**
 * Create a new user
 * @param id The user's ID (Clerk User ID)
 * @param name The user's first name
 * @param email The user's email
 * @returns The created user
 */
export async function createUser(id: string, name: string, email: string) {
  const result = await db
    .insert(users)
    .values({
      id,
      firstName: name,
      email,
    })
    .returning();

  return result[0];
}

/**
 * Create a new post for a user
 * @param title The post title
 * @param content The post content
 * @param authorId The author's user ID (string)
 * @param published Whether the post should be published
 * @returns The created post
 */
export async function createPost(title: string, content: string | null, authorId: string, published: boolean = false) {
  const result = await db
    .insert(posts)
    .values({
      title,
      content,
      authorId,
      published,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return result[0];
}

/**
 * Get all posts for a specific user
 * @param userId The user ID (string)
 * @param publishedOnly Whether to only return published posts
 * @returns Array of posts
 */
export async function getPostsByUserId(userId: string, publishedOnly: boolean = false) {
  const query = db
    .select()
    .from(posts)
    .where(publishedOnly ? and(eq(posts.authorId, userId), eq(posts.published, true)) : eq(posts.authorId, userId))
    .orderBy(desc(posts.createdAt));

  return query;
}

/**
 * Update a post
 * @param id The post ID
 * @param data The data to update
 * @returns The updated post
 */
export async function updatePost(
  id: number,
  data: Partial<{
    title: string;
    content: string | null;
    published: boolean;
  }>
) {
  const result = await db
    .update(posts)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(posts.id, id))
    .returning();

  return result[0];
}

/**
 * Update a user's memory
 * @param userId The user's ID
 * @param memory Array of memory strings
 * @returns The updated user
 */
export async function updateUserMemory(userId: string, memory: string[]) {
  const result = await db
    .update(users)
    .set({
      memory,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  return result[0];
}

/**
 * Add a single memory to a user's memory array
 * @param userId The user's ID
 * @param memoryItem The memory string to add
 * @returns The updated user
 */
export async function addUserMemory(userId: string, memoryItem: string) {
  const user = await getUserById(userId);
  const currentMemory = user?.memory || [];

  const result = await db
    .update(users)
    .set({
      memory: [...currentMemory, memoryItem],
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  return result[0];
}

/**
 * Remove a memory from a user's memory array
 * @param userId The user's ID
 * @param index The index of the memory to remove
 * @returns The updated user
 */
export async function removeUserMemory(userId: string, index: number) {
  const user = await getUserById(userId);
  if (!user?.memory) return user;

  const newMemory = [...user.memory];
  newMemory.splice(index, 1);

  const result = await db
    .update(users)
    .set({
      memory: newMemory,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  return result[0];
}

/**
 * Update a specific memory in a user's memory array
 * @param userId The user's ID
 * @param index The index of the memory to update
 * @param newMemoryItem The new memory string
 * @returns The updated user
 */
export async function updateUserMemoryItem(userId: string, index: number, newMemoryItem: string) {
  const user = await getUserById(userId);
  if (!user?.memory) return user;

  const newMemory = [...user.memory];
  newMemory[index] = newMemoryItem;

  const result = await db
    .update(users)
    .set({
      memory: newMemory,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  return result[0];
}
