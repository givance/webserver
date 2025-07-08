import { logger } from '@/app/lib/logger';
import { getStaffMemberWithGmailToken, deleteStaffGmailToken } from '@/app/lib/data/staff';

/**
 * Service for handling staff Gmail database operations
 */
export class StaffGmailService {
  /**
   * Get staff member by ID and organization
   */
  async getStaffMember(staffId: number, organizationId: string) {
    const staffMember = await getStaffMemberWithGmailToken(staffId, organizationId);
    return staffMember;
  }

  /**
   * Delete Gmail token for a staff member
   */
  async disconnectStaffGmailToken(staffId: number): Promise<void> {
    await deleteStaffGmailToken(staffId);
    logger.info(`Staff Gmail account disconnected for staff member ${staffId}`);
  }
}
