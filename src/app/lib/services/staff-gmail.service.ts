import { db } from "@/app/lib/db";
import { staffGmailTokens, staff } from "@/app/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "@/app/lib/logger";
import { wrapDatabaseOperation } from "@/app/lib/utils/error-handler";

/**
 * Service for handling staff Gmail database operations
 */
export class StaffGmailService {
  /**
   * Get staff member by ID and organization
   */
  async getStaffMember(staffId: number, organizationId: string) {
    return await wrapDatabaseOperation(async () => {
      const staffMember = await db.query.staff.findFirst({
        where: and(eq(staff.id, staffId), eq(staff.organizationId, organizationId)),
        with: {
          gmailToken: true, // Include Gmail token relation
        },
      });
      return staffMember;
    });
  }

  /**
   * Delete Gmail token for a staff member
   */
  async disconnectStaffGmailToken(staffId: number): Promise<void> {
    return await wrapDatabaseOperation(async () => {
      await db.delete(staffGmailTokens).where(eq(staffGmailTokens.staffId, staffId));
      logger.info(`Staff Gmail account disconnected for staff member ${staffId}`);
    });
  }
}