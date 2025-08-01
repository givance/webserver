/**
 * Tool for adding notes to donors via WhatsApp
 */

import { z } from 'zod';
import { logger } from '@/app/lib/logger';
import { WhatsAppStaffLoggingService } from './whatsapp-staff-logging.service';
import { db } from '@/app/lib/db';
import { donors } from '@/app/lib/db/schema/donors';
import { eq, and, sql } from 'drizzle-orm';
import { DonorNote } from '@/app/lib/db/schema/types';

const ADD_DONOR_NOTE_DESCRIPTION = `Add a note to a donor's record. This tool allows you to append notes about donors such as personal information, family details, preferences, or any other relevant information.

Examples of notes you can add:
- Family information: "Daughter attends Harvard University"
- Personal preferences: "Prefers to be contacted by email"
- Meeting notes: "Met at the gala, interested in education initiatives"
- Important dates: "Birthday is March 15th"
- Giving preferences: "Interested in supporting youth programs"

The note will be timestamped and attributed to the staff member who added it.`;

export function createAddDonorNoteTool(
  organizationId: string,
  loggingService: WhatsAppStaffLoggingService,
  staffId: number,
  fromPhoneNumber: string
) {
  return {
    addDonorNote: {
      description: ADD_DONOR_NOTE_DESCRIPTION,
      parameters: z.object({
        donorId: z.number().describe('The ID of the donor to add the note to'),
        donorName: z
          .string()
          .optional()
          .describe('The name of the donor (for confirmation/logging purposes)'),
        noteContent: z.string().describe('The content of the note to add'),
      }),
      execute: async (params: { donorId: number; donorName?: string; noteContent: string }) => {
        const startTime = Date.now();

        try {
          logger.info('[WhatsApp Add Note] Starting to add note to donor', {
            donorId: params.donorId,
            donorName: params.donorName,
            organizationId,
            staffId,
          });

          // First, verify the donor exists and belongs to the organization
          const donor = await db.query.donors.findFirst({
            where: and(eq(donors.id, params.donorId), eq(donors.organizationId, organizationId)),
          });

          if (!donor) {
            logger.warn('[WhatsApp Add Note] Donor not found', {
              donorId: params.donorId,
              organizationId,
            });

            return {
              success: false,
              error: `Donor with ID ${params.donorId} not found in your organization.`,
            };
          }

          // Create the new note
          const newNote: DonorNote = {
            createdAt: new Date().toISOString(),
            createdBy: `staff_${staffId}`, // Format: staff_[id]
            content: params.noteContent,
          };

          // Update the donor record by appending the new note
          const currentNotes = (donor.notes as DonorNote[]) || [];
          const updatedNotes = [...currentNotes, newNote];

          await db
            .update(donors)
            .set({
              notes: updatedNotes,
              updatedAt: new Date(),
            })
            .where(and(eq(donors.id, params.donorId), eq(donors.organizationId, organizationId)));

          const processingTime = Date.now() - startTime;

          // Log the activity
          await loggingService.logActivity({
            staffId,
            organizationId,
            phoneNumber: fromPhoneNumber,
            activityType: 'donor_note_added',
            summary: `Added note to donor: ${donor.displayName || (donor.firstName && donor.lastName ? `${donor.firstName} ${donor.lastName}` : 'Unknown')} (ID: ${params.donorId})`,
            data: {
              donorId: params.donorId,
              donorName:
                donor.displayName ||
                (donor.firstName && donor.lastName
                  ? `${donor.firstName} ${donor.lastName}`
                  : 'Unknown'),
              notePreview: params.noteContent.substring(0, 100),
            },
          });

          logger.info('[WhatsApp Add Note] Note added successfully', {
            donorId: params.donorId,
            donorName:
              donor.displayName ||
              (donor.firstName && donor.lastName
                ? `${donor.firstName} ${donor.lastName}`
                : 'Unknown'),
            processingTimeMs: processingTime,
          });

          return {
            success: true,
            donorId: params.donorId,
            donorName:
              donor.displayName ||
              (donor.firstName && donor.lastName
                ? `${donor.firstName} ${donor.lastName}`
                : 'Unknown'),
            noteAdded: params.noteContent,
            totalNotes: updatedNotes.length,
            message: `Note successfully added to ${donor.displayName || (donor.firstName && donor.lastName ? `${donor.firstName} ${donor.lastName}` : 'donor')}.`,
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

          logger.error('[WhatsApp Add Note] Unexpected error', {
            error,
            donorId: params.donorId,
          });

          await loggingService.logError(
            staffId,
            organizationId,
            fromPhoneNumber,
            `Failed to add note to donor: ${errorMessage}`,
            error,
            'add_donor_note_error'
          );

          return {
            success: false,
            error: errorMessage,
          };
        }
      },
    },
  };
}
