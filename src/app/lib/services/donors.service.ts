import { db } from "@/app/lib/db";
import { donors, type DonorNote } from "@/app/lib/db/schema";
import { and, inArray, eq, sql } from "drizzle-orm";
import { logger } from "@/app/lib/logger";
import { wrapDatabaseOperation } from "@/app/lib/utils/error-handler";

/**
 * Service for handling donor database operations
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
    return await wrapDatabaseOperation(async () => {
      await db
        .update(donors)
        .set({ assignedToStaffId: staffId, updatedAt: sql`now()` })
        .where(and(inArray(donors.id, donorIds), eq(donors.organizationId, organizationId)));

      logger.info(`Bulk updated assigned staff for ${donorIds.length} donors in organization ${organizationId}`);
    });
  }

  /**
   * Add a note to a donor
   */
  async addNoteTodonor(
    donorId: number,
    note: DonorNote,
    organizationId: string
  ): Promise<any> {
    return await wrapDatabaseOperation(async () => {
      // Get existing donor to retrieve current notes
      const [existingDonor] = await db
        .select()
        .from(donors)
        .where(
          and(
            eq(donors.id, donorId),
            eq(donors.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!existingDonor) {
        throw new Error("Donor not found");
      }

      // Get existing notes
      const existingNotes = (existingDonor.notes as DonorNote[]) || [];

      // Update donor with new note
      const [updatedDonor] = await db
        .update(donors)
        .set({
          notes: [...existingNotes, note],
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(donors.id, donorId),
            eq(donors.organizationId, organizationId)
          )
        )
        .returning();

      if (!updatedDonor) {
        throw new Error("Failed to add note to donor");
      }

      logger.info(`Added note to donor ${donorId} in organization ${organizationId}`);
      return updatedDonor;
    });
  }
}