import { TRPCError } from '@trpc/server';
import {
  addDonorToThread,
  addMessageToThread,
  addStaffToThread,
  createCommunicationThread,
  getCommunicationThreadById,
  getDonorCommunicationHistory,
  getMessagesInThread,
  listCommunicationThreads,
  removeDonorFromThread,
  removeStaffFromThread,
  type CommunicationThreadWithDetails,
} from '@/app/lib/data/communications';
import { getDonorById } from '@/app/lib/data/donors';
import { getStaffById } from '@/app/lib/data/staff';
import { logger } from '@/app/lib/logger';
import { check, createTRPCError, ERROR_MESSAGES, validateNotNullish } from '@/app/api/trpc/trpc';

/**
 * Service for handling communication operations
 * Encapsulates business logic for thread management and authorization
 */
export class CommunicationsService {
  /**
   * Authorizes thread access for a given organization
   * @param threadId - The ID of the thread to authorize
   * @param organizationId - The organization ID to check against
   * @param includeDetails - Options for what details to include in the response
   * @returns The authorized thread with requested details
   * @throws TRPCError if thread not found or access denied
   */
  async authorizeThreadAccess(
    threadId: number,
    organizationId: string,
    includeDetails: {
      includeStaff?: boolean;
      includeDonors?: boolean;
      includeMessages?: boolean | { limit: number };
    } = {}
  ): Promise<CommunicationThreadWithDetails> {
    const thread = await getCommunicationThreadById(threadId, {
      includeStaff: true, // Always include staff for auth check
      includeDonors: true, // Always include donors for auth check
      ...includeDetails,
    });

    validateNotNullish(thread, 'NOT_FOUND', 'Communication thread not found');

    const belongsToOrg =
      (thread.staff?.some((s) => s.staff?.organizationId === organizationId) ?? false) ||
      (thread.donors?.some((d) => d.donor?.organizationId === organizationId) ?? false);

    if (!belongsToOrg) {
      logger.error(`Thread ${threadId} access denied for organization ${organizationId}`);
      throw createTRPCError({
        code: 'FORBIDDEN',
        message: 'Communication thread does not belong to your organization',
      });
    }

    return thread;
  }

  /**
   * Creates a new communication thread with participants
   * @param channel - The communication channel type
   * @param staffIds - Array of staff IDs to add to the thread
   * @param donorIds - Array of donor IDs to add to the thread
   * @param organizationId - The organization ID for validation
   * @returns The created thread
   */
  async createThreadWithParticipants(
    channel: 'email' | 'phone' | 'text',
    staffIds: number[] | undefined,
    donorIds: number[] | undefined,
    organizationId: string
  ) {
    // Verify all staff members belong to organization
    if (staffIds) {
      for (const staffId of staffIds) {
        const staff = await getStaffById(staffId, organizationId);
        validateNotNullish(
          staff,
          'NOT_FOUND',
          `Staff member ${staffId} not found in your organization`
        );
      }
    }

    // Verify all donors belong to organization
    if (donorIds) {
      for (const donorId of donorIds) {
        const donor = await getDonorById(donorId, organizationId);
        validateNotNullish(donor, 'NOT_FOUND', `Donor ${donorId} not found in your organization`);
      }
    }

    try {
      const thread = await createCommunicationThread({ channel }, staffIds, donorIds);
      logger.info(
        `Created communication thread ${thread.id} for organization ${organizationId} with ${
          staffIds?.length || 0
        } staff and ${donorIds?.length || 0} donors`
      );
      return thread;
    } catch (error) {
      logger.error(
        `Failed to create communication thread for organization ${organizationId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
      throw createTRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Could not create communication thread',
      });
    }
  }

  /**
   * Lists communication threads with filtering and authorization
   * @param options - Filtering and pagination options
   * @param organizationId - The organization ID for authorization
   * @returns Filtered and authorized threads
   */
  async listAuthorizedThreads(
    options: {
      channel?: 'email' | 'phone' | 'text';
      staffId?: number | null;
      donorId?: number | null;
      limit?: number;
      offset?: number;
      includeStaff?: boolean;
      includeDonors?: boolean;
      includeLatestMessage?: boolean;
    },
    organizationId: string
  ) {
    const threads = await listCommunicationThreads({
      ...options,
      organizationId,
    });

    // Filter threads to only include those matching the staff/donor filters
    const filteredThreads = threads.filter((thread) => {
      // Apply staff filter
      if (
        options.staffId !== undefined &&
        options.staffId !== null &&
        !thread.staff?.some((s) => s.staffId === options.staffId)
      ) {
        return false;
      }

      // Apply donor filter
      if (
        options.donorId !== undefined &&
        options.donorId !== null &&
        !thread.donors?.some((d) => d.donorId === options.donorId)
      ) {
        return false;
      }

      return true;
    });

    logger.info(
      `Listed ${filteredThreads.length} communication threads for organization ${organizationId}`
    );
    return {
      threads: filteredThreads,
      totalCount: filteredThreads.length,
    };
  }

  /**
   * Adds a message to a thread with authorization
   * @param threadId - The thread ID
   * @param content - The message content
   * @param fromStaffId - Optional staff sender ID
   * @param fromDonorId - Optional donor sender ID
   * @param toStaffId - Optional staff recipient ID
   * @param toDonorId - Optional donor recipient ID
   * @param organizationId - The organization ID for authorization
   * @returns The created message
   */
  async addAuthorizedMessage(
    threadId: number,
    content: string,
    fromStaffId: number | undefined,
    fromDonorId: number | undefined,
    toStaffId: number | undefined,
    toDonorId: number | undefined,
    organizationId: string
  ) {
    // Authorize thread access first
    await this.authorizeThreadAccess(threadId, organizationId);

    try {
      const message = await addMessageToThread({
        threadId,
        content,
        fromStaffId,
        fromDonorId,
        toStaffId,
        toDonorId,
      });

      logger.info(`Added message to thread ${threadId} for organization ${organizationId}`);
      return message;
    } catch (error) {
      logger.error(
        `Failed to add message to thread ${threadId}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      throw createTRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Could not add message to thread',
      });
    }
  }

  /**
   * Gets messages in a thread with authorization
   * @param threadId - The thread ID
   * @param limit - Maximum number of messages to return
   * @param offset - Number of messages to skip
   * @param includeSendersRecipients - Whether to include sender/recipient details
   * @param organizationId - The organization ID for authorization
   * @returns The messages in the thread
   */
  async getAuthorizedMessages(
    threadId: number,
    limit: number | undefined,
    offset: number | undefined,
    includeSendersRecipients: boolean | undefined,
    organizationId: string
  ) {
    // Authorize thread access first
    await this.authorizeThreadAccess(threadId, organizationId);

    try {
      const messages = await getMessagesInThread(threadId, {
        limit,
        offset,
        includeSendersRecipients,
      });

      logger.info(
        `Retrieved ${messages.length} messages from thread ${threadId} for organization ${organizationId}`
      );
      return messages;
    } catch (error) {
      logger.error(
        `Failed to get messages from thread ${threadId}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      throw createTRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Could not retrieve messages',
      });
    }
  }

  /**
   * Adds a participant to a thread with authorization
   * @param threadId - The thread ID
   * @param participantId - The participant ID
   * @param participantType - Whether the participant is staff or donor
   * @param organizationId - The organization ID for authorization
   * @returns The updated thread
   */
  async addAuthorizedParticipant(
    threadId: number,
    participantId: number,
    participantType: 'staff' | 'donor',
    organizationId: string
  ) {
    // Authorize thread access first
    await this.authorizeThreadAccess(threadId, organizationId);

    // Verify participant belongs to organization
    if (participantType === 'staff') {
      const staff = await getStaffById(participantId, organizationId);
      validateNotNullish(staff, 'NOT_FOUND', 'Staff member not found in your organization');
    } else {
      const donor = await getDonorById(participantId, organizationId);
      validateNotNullish(donor, 'NOT_FOUND', 'Donor not found in your organization');
    }

    try {
      const result =
        participantType === 'staff'
          ? await addStaffToThread(threadId, participantId)
          : await addDonorToThread(threadId, participantId);

      logger.info(
        `Added ${participantType} ${participantId} to thread ${threadId} for organization ${organizationId}`
      );
      return result;
    } catch (error) {
      logger.error(
        `Failed to add ${participantType} to thread ${threadId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
      throw createTRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Could not add ${participantType} to thread`,
      });
    }
  }

  /**
   * Removes a participant from a thread with authorization
   * @param threadId - The thread ID
   * @param participantId - The participant ID
   * @param participantType - Whether the participant is staff or donor
   * @param organizationId - The organization ID for authorization
   * @returns The updated thread
   */
  async removeAuthorizedParticipant(
    threadId: number,
    participantId: number,
    participantType: 'staff' | 'donor',
    organizationId: string
  ) {
    // Authorize thread access first
    await this.authorizeThreadAccess(threadId, organizationId);

    try {
      const result =
        participantType === 'staff'
          ? await removeStaffFromThread(threadId, participantId)
          : await removeDonorFromThread(threadId, participantId);

      logger.info(
        `Removed ${participantType} ${participantId} from thread ${threadId} for organization ${organizationId}`
      );
      return result;
    } catch (error) {
      logger.error(
        `Failed to remove ${participantType} from thread ${threadId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
      throw createTRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Could not remove ${participantType} from thread`,
      });
    }
  }
}
