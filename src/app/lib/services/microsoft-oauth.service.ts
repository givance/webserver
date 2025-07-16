import { logger } from '@/app/lib/logger';
import {
  // Note: Microsoft OAuth token functions have been removed from microsoft-oauth.ts
  // getMicrosoftTokenByUserId,
  // deleteMicrosoftToken,
  getDonorWithOrgVerification,
  getStaffWithOrgVerification,
  getUserById,
} from '@/app/lib/data/microsoft-oauth';
import { db } from '@/app/lib/db';
import { staff, organizationMemberships } from '@/app/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Service for handling Microsoft OAuth database operations
 */
export class MicrosoftOAuthService {
  /**
   * Get Microsoft OAuth token for a user
   * This checks if the user's organization has any staff with Microsoft connected.
   * Returns a boolean-like object for compatibility with existing code.
   */
  async getMicrosoftToken(userId: string) {
    try {
      // Get user's organization
      const membership = await db.query.organizationMemberships.findFirst({
        where: eq(organizationMemberships.userId, userId),
      });

      if (!membership) {
        return undefined;
      }

      // Check if any staff in the organization has Microsoft connected
      const staffWithMicrosoft = await db.query.staff.findFirst({
        where: eq(staff.organizationId, membership.organizationId),
        with: {
          microsoftToken: true,
        },
      });

      if (staffWithMicrosoft?.microsoftToken) {
        // Return a token-like object for compatibility
        return {
          email: staffWithMicrosoft.microsoftToken.email,
          // Other fields can be undefined as they're not used for connection status
        };
      }

      return undefined;
    } catch (error) {
      logger.error('Failed to check Microsoft connection status', { error, userId });
      return undefined;
    }
  }

  /**
   * Get donor information by ID and organization
   */
  async getDonorInfo(donorId: number, organizationId: string) {
    return await getDonorWithOrgVerification(donorId, organizationId);
  }

  /**
   * Get primary staff information by ID and organization
   */
  async getStaffInfo(staffId: number, organizationId: string) {
    return await getStaffWithOrgVerification(staffId, organizationId);
  }

  /**
   * Get fallback Microsoft token for an organization
   */
  async getFallbackMicrosoftToken(organizationId: string) {
    // This would require joining through organization memberships
    // For now, return null and let the router handle the complex query
    return null;
  }

  /**
   * Get user information by ID
   */
  async getUserInfo(userId: string) {
    return await getUserById(userId);
  }

  /**
   * Delete Microsoft OAuth token for a user
   * @deprecated This method is deprecated as user-level OAuth tokens are no longer used.
   * Staff members should authenticate their Microsoft accounts directly.
   */
  async disconnectMicrosoftToken(userId: string): Promise<void> {
    logger.info(`Microsoft disconnect called for user ${userId} - no action taken (deprecated)`);
  }
}
