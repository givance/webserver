import { db } from '../db';
import { gmailOAuthTokens, generatedEmails, users, staff, donors } from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

export type GmailOAuthToken = InferSelectModel<typeof gmailOAuthTokens>;
export type NewGmailOAuthToken = InferInsertModel<typeof gmailOAuthTokens>;

/**
 * Get Gmail OAuth token for a user
 */
export async function getGmailTokenByUserId(userId: string): Promise<GmailOAuthToken | undefined> {
  try {
    const result = await db.query.gmailOAuthTokens.findFirst({
      where: eq(gmailOAuthTokens.userId, userId),
    });
    return result;
  } catch (error) {
    console.error('Failed to get Gmail token by user ID:', error);
    throw new Error('Could not retrieve Gmail token.');
  }
}

/**
 * Create or update Gmail OAuth token for a user
 */
export async function upsertGmailToken(
  userId: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: Date
): Promise<void> {
  try {
    // Check if token exists
    const existing = await db.query.gmailOAuthTokens.findFirst({
      where: eq(gmailOAuthTokens.userId, userId),
    });

    if (existing) {
      // Update existing token
      await db
        .update(gmailOAuthTokens)
        .set({
          accessToken,
          refreshToken,
          expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(gmailOAuthTokens.userId, userId));
    } else {
      // Insert new token
      await db.insert(gmailOAuthTokens).values({
        userId,
        accessToken,
        refreshToken,
        expiresAt,
      });
    }
  } catch (error) {
    console.error('Failed to upsert Gmail token:', error);
    throw new Error('Could not save Gmail token.');
  }
}

/**
 * Update Gmail access token and expiry after refresh
 */
export async function updateGmailAccessToken(
  userId: string,
  accessToken: string,
  expiresAt: Date
): Promise<void> {
  try {
    await db
      .update(gmailOAuthTokens)
      .set({
        accessToken,
        expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(gmailOAuthTokens.userId, userId));
  } catch (error) {
    console.error('Failed to update Gmail access token:', error);
    throw new Error('Could not update Gmail token.');
  }
}

/**
 * Delete Gmail OAuth token for a user
 */
export async function deleteGmailToken(userId: string): Promise<void> {
  try {
    await db.delete(gmailOAuthTokens).where(eq(gmailOAuthTokens.userId, userId));
  } catch (error) {
    console.error('Failed to delete Gmail token:', error);
    throw new Error('Could not delete Gmail token.');
  }
}

/**
 * Get user record by ID
 */
export async function getUserById(
  userId: string
): Promise<InferSelectModel<typeof users> | undefined> {
  try {
    const result = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    return result;
  } catch (error) {
    console.error('Failed to get user by ID:', error);
    throw new Error('Could not retrieve user.');
  }
}

/**
 * Get staff member by email
 */
export async function getStaffByEmail(
  email: string
): Promise<InferSelectModel<typeof staff> | undefined> {
  try {
    const result = await db.query.staff.findFirst({
      where: eq(staff.email, email),
    });
    return result;
  } catch (error) {
    console.error('Failed to get staff by email:', error);
    throw new Error('Could not retrieve staff member.');
  }
}

/**
 * Get generated emails for bulk sending
 */
export async function getGeneratedEmailsForSending(
  sessionId: number,
  emailIds: number[]
): Promise<InferSelectModel<typeof generatedEmails>[]> {
  try {
    const result = await db.query.generatedEmails.findMany({
      where: and(eq(generatedEmails.sessionId, sessionId), inArray(generatedEmails.id, emailIds)),
    });
    return result;
  } catch (error) {
    console.error('Failed to get generated emails for sending:', error);
    throw new Error('Could not retrieve generated emails.');
  }
}

/**
 * Get donor by ID
 */
export async function getDonorById(
  donorId: number
): Promise<InferSelectModel<typeof donors> | undefined> {
  try {
    const result = await db.query.donors.findFirst({
      where: eq(donors.id, donorId),
    });
    return result;
  } catch (error) {
    console.error('Failed to get donor by ID:', error);
    throw new Error('Could not retrieve donor.');
  }
}
