import { db } from '../db';
import { donors, staff, users } from '../db/schema';
import { eq } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';

// Note: Microsoft OAuth token functions have been removed as they are deprecated.
// The system now uses staff-level Microsoft tokens (staffMicrosoftTokens) instead.

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
