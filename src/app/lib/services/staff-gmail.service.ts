import { logger } from '@/app/lib/logger';
import { wrapDatabaseOperation } from '@/app/lib/utils/error-handler';
import { getStaffMemberWithGmailToken, deleteStaffGmailToken } from '@/app/lib/data/staff';

/**
 * Service for handling staff Gmail database operations
 */
export class StaffGmailService {
  /**
   * Get staff member by ID and organization
   */
  async getStaffMember(staffId: number, organizationId: string) {
    return await wrapDatabaseOperation(async () => {
      const staffMember = await getStaffMemberWithGmailToken(staffId, organizationId);
      return staffMember;
    });
  }

  /**
   * Delete Gmail token for a staff member
   */
  async disconnectStaffGmailToken(staffId: number): Promise<void> {
    return await wrapDatabaseOperation(async () => {
      await deleteStaffGmailToken(staffId);
      logger.info(`Staff Gmail account disconnected for staff member ${staffId}`);
    });
  }
}
