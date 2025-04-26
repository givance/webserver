import { db } from "./index";
import { users, posts } from "./schema";
import { eq, and, desc } from "drizzle-orm";

/**
 * Find a user by their ID
 * @param id The user's ID
 * @returns The user or undefined if not found
 */
export async function getUserById(id: number) {
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);

  return result[0];
}

/**
 * Create a new user
 * @param name The user's name
 * @param email The user's email
 * @returns The created user
 */
export async function createUser(name: string, email: string) {
  const result = await db
    .insert(users)
    .values({
      name,
      email,
    })
    .returning();

  return result[0];
}

/**
 * Create a new post for a user
 * @param title The post title
 * @param content The post content
 * @param authorId The author's user ID
 * @param published Whether the post should be published
 * @returns The created post
 */
export async function createPost(title: string, content: string | null, authorId: number, published: boolean = false) {
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
 * @param userId The user ID
 * @param publishedOnly Whether to only return published posts
 * @returns Array of posts
 */
export async function getPostsByUserId(userId: number, publishedOnly: boolean = false) {
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
