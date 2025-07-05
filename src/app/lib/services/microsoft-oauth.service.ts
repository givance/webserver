import { db } from "@/app/lib/db";
import { donors, microsoftOAuthTokens, staff, users } from "@/app/lib/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/app/lib/logger";
import { wrapDatabaseOperation } from "@/app/lib/utils/error-handler";

/**
 * Service for handling Microsoft OAuth database operations
 */
export class MicrosoftOAuthService {
  /**
   * Get Microsoft OAuth token for a user
   */
  async getMicrosoftToken(userId: string) {
    return await wrapDatabaseOperation(async () => {
      const tokenInfo = await db.query.microsoftOAuthTokens.findFirst({
        where: eq(microsoftOAuthTokens.userId, userId),
      });
      return tokenInfo;
    });
  }

  /**
   * Get donor information by ID and organization
   */
  async getDonorInfo(donorId: number, organizationId: string) {
    return await wrapDatabaseOperation(async () => {
      const donorInfo = await db.query.donors.findFirst({
        where: eq(donors.id, donorId),
      });
      
      // Verify donor belongs to organization
      if (donorInfo && donorInfo.organizationId !== organizationId) {
        return null;
      }
      
      return donorInfo;
    });
  }

  /**
   * Get primary staff information by ID and organization
   */
  async getStaffInfo(staffId: number, organizationId: string) {
    return await wrapDatabaseOperation(async () => {
      const staffInfo = await db.query.staff.findFirst({
        where: eq(staff.id, staffId),
      });
      
      // Verify staff belongs to organization
      if (staffInfo && staffInfo.organizationId !== organizationId) {
        return null;
      }
      
      return staffInfo;
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
      const userInfo = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });
      return userInfo;
    });
  }

  /**
   * Delete Microsoft OAuth token for a user
   */
  async disconnectMicrosoftToken(userId: string): Promise<void> {
    return await wrapDatabaseOperation(async () => {
      await db.delete(microsoftOAuthTokens).where(eq(microsoftOAuthTokens.userId, userId));
      logger.info(`Microsoft account disconnected for user ${userId}`);
    });
  }
}