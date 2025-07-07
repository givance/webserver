import { db } from '../db';
import { microsoftOAuthTokens, donors, staff, users } from '../db/schema';
import { eq } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';

export type MicrosoftOAuthToken = InferSelectModel<typeof microsoftOAuthTokens>;

/**
 * Get Microsoft OAuth token for a user
 */
export async function getMicrosoftTokenByUserId(
  userId: string
): Promise<MicrosoftOAuthToken | undefined> {
  try {
    const result = await db.query.microsoftOAuthTokens.findFirst({
      where: eq(microsoftOAuthTokens.userId, userId),
    });
    return result;
  } catch (error) {
    console.error('Failed to get Microsoft token by user ID:', error);
    throw new Error('Could not retrieve Microsoft token.');
  }
}

/**
 * Get donor information by ID with organization verification
 */
export async function getDonorWithOrgVerification(
  donorId: number,
  organizationId: string
): Promise<InferSelectModel<typeof donors> | null> {
  try {
    const donorInfo = await db.query.donors.findFirst({
      where: eq(donors.id, donorId),
    });

    // Verify donor belongs to organization
    if (donorInfo && donorInfo.organizationId !== organizationId) {
      return null;
    }

    return donorInfo || null;
  } catch (error) {
    console.error('Failed to get donor with organization verification:', error);
    throw new Error('Could not retrieve donor information.');
  }
}

/**
 * Get staff information by ID with organization verification
 */
export async function getStaffWithOrgVerification(
  staffId: number,
  organizationId: string
): Promise<InferSelectModel<typeof staff> | null> {
  try {
    const staffInfo = await db.query.staff.findFirst({
      where: eq(staff.id, staffId),
    });

    // Verify staff belongs to organization
    if (staffInfo && staffInfo.organizationId !== organizationId) {
      return null;
    }

    return staffInfo || null;
  } catch (error) {
    console.error('Failed to get staff with organization verification:', error);
    throw new Error('Could not retrieve staff information.');
  }
}

/**
 * Get user information by ID
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
 * Delete Microsoft OAuth token for a user
 */
export async function deleteMicrosoftToken(userId: string): Promise<void> {
  try {
    await db.delete(microsoftOAuthTokens).where(eq(microsoftOAuthTokens.userId, userId));
  } catch (error) {
    console.error('Failed to delete Microsoft token:', error);
    throw new Error('Could not delete Microsoft token.');
  }
}
