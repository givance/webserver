import { db } from '../db';
import { generatedEmails, users, staff, donors } from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

// Note: Gmail OAuth token functions have been removed as they are deprecated.
// The system now uses staff-level Gmail tokens (staffGmailTokens) instead.

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
