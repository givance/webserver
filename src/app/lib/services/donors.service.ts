import { addNoteToDonor, bulkUpdateAssignedStaff } from '@/app/lib/data/donors';
import { type DonorNote } from '@/app/lib/db/schema';
import { logger } from '@/app/lib/logger';

/**
 * Service for handling donor business logic
 */
export class DonorsService {
  /**
   * Bulk update assigned staff for multiple donors
   */
  async bulkUpdateAssignedStaff(
    donorIds: number[],
    staffId: number | null,
    organizationId: string
  ): Promise<void> {
    await bulkUpdateAssignedStaff(donorIds, staffId, organizationId);
    logger.info(
      `Bulk updated assigned staff for ${donorIds.length} donors in organization ${organizationId}`
    );
  }

  /**
   * Add a note to a donor
   */
  async addNoteToDonor(donorId: number, note: DonorNote, organizationId: string): Promise<any> {
    const updatedDonor = await addNoteToDonor(donorId, note, organizationId);
    logger.info(`Added note to donor ${donorId} in organization ${organizationId}`);
    return updatedDonor;
  }
}
