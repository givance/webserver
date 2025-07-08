import {
  addNoteToDonor,
  editDonorNote,
  deleteDonorNote,
  bulkUpdateAssignedStaff,
} from '@/app/lib/data/donors';
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

  /**
   * Edit an existing note for a donor
   */
  async editDonorNote(
    donorId: number,
    noteIndex: number,
    newContent: string,
    organizationId: string
  ): Promise<any> {
    const updatedDonor = await editDonorNote(donorId, noteIndex, newContent, organizationId);
    logger.info(`Edited note ${noteIndex} for donor ${donorId} in organization ${organizationId}`);
    return updatedDonor;
  }

  /**
   * Delete a note from a donor
   */
  async deleteDonorNote(donorId: number, noteIndex: number, organizationId: string): Promise<any> {
    const updatedDonor = await deleteDonorNote(donorId, noteIndex, organizationId);
    logger.info(
      `Deleted note ${noteIndex} from donor ${donorId} in organization ${organizationId}`
    );
    return updatedDonor;
  }
}
