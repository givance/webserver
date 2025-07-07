import { logger } from '@/app/lib/logger';
import { wrapDatabaseOperation } from '@/app/lib/utils/error-handler';
import {
  getMicrosoftTokenByUserId,
  getDonorWithOrgVerification,
  getStaffWithOrgVerification,
  getUserById,
  deleteMicrosoftToken,
} from '@/app/lib/data/microsoft-oauth';

/**
 * Service for handling Microsoft OAuth database operations
 */
export class MicrosoftOAuthService {
  /**
   * Get Microsoft OAuth token for a user
   */
  async getMicrosoftToken(userId: string) {
    return await wrapDatabaseOperation(async () => {
      return await getMicrosoftTokenByUserId(userId);
    });
  }

  /**
   * Get donor information by ID and organization
   */
  async getDonorInfo(donorId: number, organizationId: string) {
    return await wrapDatabaseOperation(async () => {
      return await getDonorWithOrgVerification(donorId, organizationId);
    });
  }

  /**
   * Get primary staff information by ID and organization
   */
  async getStaffInfo(staffId: number, organizationId: string) {
    return await wrapDatabaseOperation(async () => {
      return await getStaffWithOrgVerification(staffId, organizationId);
    });
  }

  /**
   * Get fallback Microsoft token for an organization
   */
  async getFallbackMicrosoftToken(organizationId: string) {
    return await wrapDatabaseOperation(async () => {
      // This would require joining through organization memberships
      // For now, return null and let the router handle the complex query
      return null;
    });
  }

  /**
   * Get user information by ID
   */
  async getUserInfo(userId: string) {
    return await wrapDatabaseOperation(async () => {
      return await getUserById(userId);
    });
  }

  /**
   * Delete Microsoft OAuth token for a user
   */
  async disconnectMicrosoftToken(userId: string): Promise<void> {
    return await wrapDatabaseOperation(async () => {
      await deleteMicrosoftToken(userId);
      logger.info(`Microsoft account disconnected for user ${userId}`);
    });
  }
}
