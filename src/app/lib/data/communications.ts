import { db } from "../db";
import {
  communicationThreads,
  communicationThreadStaff,
  communicationThreadDonors,
  communicationContent,
  communicationChannelEnum,
  staff,
  donors,
} from "../db/schema";
import { eq, sql, desc, and, SQL } from "drizzle-orm";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type { Staff } from "./staff";
import type { Donor } from "./donors";

// Types for CommunicationThreads
export type CommunicationThread = InferSelectModel<typeof communicationThreads>;
export type NewCommunicationThread = InferInsertModel<typeof communicationThreads>;
export type CommunicationChannel = (typeof communicationChannelEnum.enumValues)[number];

// Types for CommunicationThreadStaff (Join table)
export type CommunicationThreadStaffMember = InferSelectModel<typeof communicationThreadStaff> & {
  staff?: Staff;
};
export type NewCommunicationThreadStaffMember = InferInsertModel<typeof communicationThreadStaff>;

// Types for CommunicationThreadDonors (Join table)
export type CommunicationThreadDonorParticipant = InferSelectModel<typeof communicationThreadDonors> & {
  donor?: Donor;
};
export type NewCommunicationThreadDonorParticipant = InferInsertModel<typeof communicationThreadDonors>;

// Types for CommunicationContent
export type CommunicationMessage = InferSelectModel<typeof communicationContent>;
export type NewCommunicationMessage = InferInsertModel<typeof communicationContent>;

// Enhanced types for returning threads with participants and messages
// These types expect the relations ('staff', 'donor', 'content') to be populated directly by Drizzle's 'with'
export type FullCommunicationThreadStaff = CommunicationThreadStaffMember & {
  staff?: Omit<Staff, "communicationThreads" | "sentMessages" | "receivedMessages"> | null;
};
export type FullCommunicationThreadDonor = CommunicationThreadDonorParticipant & {
  donor?: Omit<Donor, "communicationThreads" | "sentMessages" | "receivedMessages"> | null;
};

export type CommunicationThreadWithDetails = CommunicationThread & {
  staff?: CommunicationThreadStaffMember[];
  donors?: CommunicationThreadDonorParticipant[];
  content?: CommunicationMessage[];
};

export type MessageWithSenderRecipient = CommunicationMessage & {
  fromStaff?: Staff | null;
  fromDonor?: Donor | null;
  toStaff?: Staff | null;
  toDonor?: Donor | null;
};

export interface CommunicationHistory {
  content?: {
    content: string;
  }[];
}

// --- CommunicationThread Functions ---

/**
 * Creates a new communication thread.
 * @param threadData - Data for the new thread (e.g., channel).
 * @param staffIds - Optional array of staff IDs to associate with the thread.
 * @param donorIds - Optional array of donor IDs to associate with the thread.
 * @returns The newly created communication thread with participant associations.
 */
export async function createCommunicationThread(
  threadData: Omit<NewCommunicationThread, "id" | "createdAt" | "updatedAt">,
  staffIds?: number[],
  donorIds?: number[]
): Promise<CommunicationThread> {
  return db.transaction(async (tx) => {
    const [newThread] = await tx.insert(communicationThreads).values(threadData).returning();

    if (staffIds && staffIds.length > 0) {
      const staffToThreadEntries = staffIds.map((staffId) => ({ threadId: newThread.id, staffId }));
      await tx.insert(communicationThreadStaff).values(staffToThreadEntries);
    }

    if (donorIds && donorIds.length > 0) {
      const donorToThreadEntries = donorIds.map((donorId) => ({ threadId: newThread.id, donorId }));
      await tx.insert(communicationThreadDonors).values(donorToThreadEntries);
    }

    return newThread;
  });
}

/**
 * Retrieves a communication thread by its ID, optionally including participants and messages.
 * @param threadId - The ID of the thread.
 * @param options - Options to include related data.
 * @returns The communication thread with details, or undefined if not found.
 */
export async function getCommunicationThreadById(
  threadId: number,
  options?: {
    includeStaff?: boolean;
    includeDonors?: boolean;
    includeMessages?: boolean | { limit?: number };
  }
): Promise<CommunicationThreadWithDetails | undefined> {
  try {
    const result = await db.query.communicationThreads.findFirst({
      where: eq(communicationThreads.id, threadId),
      with: {
        staff: options?.includeStaff ? { with: { staff: true } } : undefined,
        donors: options?.includeDonors ? { with: { donor: true } } : undefined,
        content: options?.includeMessages
          ? {
              limit: typeof options.includeMessages === "object" ? options.includeMessages.limit : 10, // Default to 10 messages
              orderBy: [desc(communicationContent.datetime)],
            }
          : undefined,
      },
    });

    return result as CommunicationThreadWithDetails | undefined;
  } catch (error) {
    console.error("Failed to retrieve communication thread:", error);
    throw new Error("Could not retrieve communication thread.");
  }
}

/**
 * Lists communication threads, with filtering options.
 */
export async function listCommunicationThreads(options: {
  channel?: CommunicationChannel;
  limit?: number;
  offset?: number;
  includeStaff?: boolean;
  includeDonors?: boolean;
  includeLatestMessage?: boolean;
  organizationId: string;
}): Promise<CommunicationThreadWithDetails[]> {
  const {
    channel,
    limit = 10,
    offset = 0,
    includeStaff,
    includeDonors,
    includeLatestMessage,
    organizationId,
  } = options;

  const whereConditions: SQL[] = [];
  if (channel) {
    whereConditions.push(eq(communicationThreads.channel, channel));
  }

  try {
    // Get all threads with their participants
    const results = await db.query.communicationThreads.findMany({
      where: whereConditions.length > 0 ? and(...whereConditions) : undefined,
      with: {
        staff: includeStaff
          ? {
              with: {
                staff: true,
              },
            }
          : undefined,
        donors: includeDonors
          ? {
              with: {
                donor: true,
              },
            }
          : undefined,
        content: includeLatestMessage ? { limit: 1, orderBy: [desc(communicationContent.datetime)] } : undefined,
      },
      limit: limit,
      offset: offset,
      orderBy: [desc(communicationThreads.updatedAt)],
    });

    // Filter threads to only include those with participants from the organization
    const filteredThreads = results.filter((thread) => {
      const hasStaffFromOrg =
        thread.staff?.some((s) => {
          const staffMember = s as CommunicationThreadStaffMember;
          return staffMember.staff?.organizationId === organizationId;
        }) ?? false;

      const hasDonorsFromOrg =
        thread.donors?.some((d) => {
          const donorMember = d as CommunicationThreadDonorParticipant;
          return donorMember.donor?.organizationId === organizationId;
        }) ?? false;

      return hasStaffFromOrg || hasDonorsFromOrg;
    });

    return filteredThreads as CommunicationThreadWithDetails[];
  } catch (error) {
    console.error("Failed to list communication threads:", error);
    throw new Error("Could not list communication threads.");
  }
}

// --- CommunicationMessage Functions ---

/**
 * Adds a message to a communication thread.
 * @param messageData - Data for the new message.
 * @returns The newly created message object.
 */
export async function addMessageToThread(messageData: NewCommunicationMessage): Promise<CommunicationMessage> {
  try {
    // Ensure threadId is valid and sender/recipient IDs are coherent
    // (e.g., fromStaffId or fromDonorId should be set, not both)
    if (
      (messageData.fromStaffId && messageData.fromDonorId) ||
      (!messageData.fromStaffId && !messageData.fromDonorId)
    ) {
      throw new Error("Message must have exactly one sender (either staff or donor).");
    }

    const [newMessage] = await db.insert(communicationContent).values(messageData).returning();
    // Optionally, update the thread's updatedAt timestamp
    await db
      .update(communicationThreads)
      .set({ updatedAt: sql`now()` })
      .where(eq(communicationThreads.id, newMessage.threadId));
    return newMessage;
  } catch (error) {
    console.error("Failed to add message to thread:", error);
    throw new Error("Could not add message to thread.");
  }
}

/**
 * Retrieves messages from a specific thread with pagination.
 * @param threadId - The ID of the thread.
 * @param options - Pagination options (limit, offset), and option to include sender/recipient details.
 * @returns An array of messages with sender/recipient details.
 */
export async function getMessagesInThread(
  threadId: number,
  options: { limit?: number; offset?: number; includeSendersRecipients?: boolean } = {}
): Promise<MessageWithSenderRecipient[]> {
  try {
    const { limit = 25, offset = 0, includeSendersRecipients } = options;
    const messages = await db.query.communicationContent.findMany({
      where: eq(communicationContent.threadId, threadId),
      with: {
        fromStaff: includeSendersRecipients ? true : undefined,
        fromDonor: includeSendersRecipients ? true : undefined,
        toStaff: includeSendersRecipients ? true : undefined,
        toDonor: includeSendersRecipients ? true : undefined,
      },
      orderBy: [desc(communicationContent.datetime)],
      limit: limit,
      offset: offset,
    });

    // The types from Drizzle with '.with()' should align with MessageWithSenderRecipient fields
    // if relation names match the field names in MessageWithSenderRecipient (e.g., fromStaff, fromDonor)
    return messages as MessageWithSenderRecipient[];
  } catch (error) {
    console.error("Failed to retrieve messages from thread:", error);
    throw new Error("Could not retrieve messages from thread.");
  }
}

// Helper functions for managing thread participants (staff/donors)
/** Adds a staff member to a communication thread. */
export async function addStaffToThread(threadId: number, staffId: number): Promise<void> {
  try {
    await db.insert(communicationThreadStaff).values({ threadId, staffId }).onConflictDoNothing();
  } catch (error) {
    console.error("Failed to add staff to thread:", error);
    throw new Error("Could not add staff to thread.");
  }
}

/** Removes a staff member from a communication thread. */
export async function removeStaffFromThread(threadId: number, staffId: number): Promise<void> {
  try {
    await db
      .delete(communicationThreadStaff)
      .where(and(eq(communicationThreadStaff.threadId, threadId), eq(communicationThreadStaff.staffId, staffId)));
  } catch (error) {
    console.error("Failed to remove staff from thread:", error);
    throw new Error("Could not remove staff from thread.");
  }
}

/** Adds a donor to a communication thread. */
export async function addDonorToThread(threadId: number, donorId: number): Promise<void> {
  try {
    await db.insert(communicationThreadDonors).values({ threadId, donorId }).onConflictDoNothing();
  } catch (error) {
    console.error("Failed to add donor to thread:", error);
    throw new Error("Could not add donor to thread.");
  }
}

/** Removes a donor from a communication thread. */
export async function removeDonorFromThread(threadId: number, donorId: number): Promise<void> {
  try {
    await db
      .delete(communicationThreadDonors)
      .where(and(eq(communicationThreadDonors.threadId, threadId), eq(communicationThreadDonors.donorId, donorId)));
  } catch (error) {
    console.error("Failed to remove donor from thread:", error);
    throw new Error("Could not remove donor from thread.");
  }
}

/**
 * Retrieves all communication threads and messages associated with a specific donor.
 * @param donorId - The ID of the donor
 * @param options - Options for filtering and including related data
 *   - limit: Maximum number of threads to return (default: 25)
 *   - offset: Number of threads to skip (default: 0)
 *   - includeStaff: Whether to include staff participant details
 *   - messagesPerThread: Maximum number of messages to include per thread (default: 10)
 *   - organizationId: The organization ID to filter threads by
 * @returns Array of communication threads with messages and participant details
 */
export async function getDonorCommunicationHistory(
  donorId: number,
  options: {
    limit?: number;
    offset?: number;
    includeStaff?: boolean;
    messagesPerThread?: number;
    organizationId: string;
  }
): Promise<CommunicationThreadWithDetails[]> {
  const { limit = 25, offset = 0, includeStaff = true, messagesPerThread = 10, organizationId } = options;

  try {
    // Find all threads where the donor is a participant
    const threads = await db.query.communicationThreads.findMany({
      where: (threads, { exists, and, eq }) =>
        exists(
          db
            .select()
            .from(communicationThreadDonors)
            .where(
              and(eq(communicationThreadDonors.threadId, threads.id), eq(communicationThreadDonors.donorId, donorId))
            )
        ),
      with: {
        staff: includeStaff
          ? {
              with: {
                staff: true,
              },
            }
          : undefined,
        donors: {
          with: {
            donor: true,
          },
        },
        content: {
          limit: messagesPerThread,
          orderBy: [desc(communicationContent.datetime)],
          with: {
            fromStaff: true,
            fromDonor: true,
            toStaff: true,
            toDonor: true,
          },
        },
      },
      limit,
      offset,
      orderBy: [desc(communicationThreads.updatedAt)],
    });

    // Filter threads to only include those from the specified organization
    const filteredThreads = threads.filter((thread) => {
      const hasStaffFromOrg =
        thread.staff?.some((s) => {
          const staffMember = s as CommunicationThreadStaffMember;
          return staffMember.staff?.organizationId === organizationId;
        }) ?? false;

      const hasDonorsFromOrg =
        thread.donors?.some((d) => {
          const donorMember = d as CommunicationThreadDonorParticipant;
          return donorMember.donor?.organizationId === organizationId;
        }) ?? false;

      return hasStaffFromOrg || hasDonorsFromOrg;
    });

    return filteredThreads as CommunicationThreadWithDetails[];
  } catch (error) {
    console.error(`Failed to retrieve communication history for donor ${donorId}:`, error);
    throw new Error("Could not retrieve donor communication history.");
  }
}
