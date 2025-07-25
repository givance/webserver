import { db } from '../db';
import {
  donors,
  staff,
  organizations,
  personResearch,
  donations,
  communicationContent,
  donorListMembers,
  emailTrackers,
  generatedEmails,
  todos,
  type DonorNote,
} from '../db/schema';
import {
  eq,
  sql,
  like,
  or,
  desc,
  asc,
  SQL,
  AnyColumn,
  and,
  isNull,
  count,
  inArray,
  notExists,
} from 'drizzle-orm';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { clerkClient } from '@clerk/nextjs/server';
import type { DonorJourney } from './organizations';
import { removeFromAllLists } from './donor-lists';

export type Donor = InferSelectModel<typeof donors>;
export type NewDonor = InferInsertModel<typeof donors>;

export type DonorWithDetails = Omit<Donor, 'predictedActions'> & {
  stageName?: string;
  stageExplanation?: string;
  possibleActions?: string[];
  predictedActions?: string[];
  highPotentialDonorRationale?: string | null; // NEW: Rationale from person research
};

export type CommunicationDonor = Pick<
  Donor,
  | 'id'
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'displayName'
  | 'hisTitle'
  | 'hisFirstName'
  | 'hisInitial'
  | 'hisLastName'
  | 'herTitle'
  | 'herFirstName'
  | 'herInitial'
  | 'herLastName'
  | 'isCouple'
>;

/**
 * Helper function to normalize notes field from string to array format
 * This ensures backward compatibility during the migration period
 */
function normalizeDonorNotes(donor: any): any {
  if (!donor) return donor;

  // If notes is already an array or null/undefined, return as is
  if (!donor.notes || Array.isArray(donor.notes)) {
    return donor;
  }

  // Convert string notes to array format
  if (typeof donor.notes === 'string') {
    return {
      ...donor,
      notes: [
        {
          createdAt: new Date().toISOString(),
          createdBy: 'system_migration',
          content: donor.notes,
        },
      ],
    };
  }

  return donor;
}

/**
 * Retrieves a donor by their ID and organization ID.
 * @param id - The ID of the donor to retrieve.
 * @param organizationId - The ID of the organization the donor belongs to.
 * @returns The donor object if found, otherwise undefined.
 */
export async function getDonorById(id: number, organizationId: string): Promise<Donor | undefined> {
  try {
    const result = await db
      .select()
      .from(donors)
      .where(and(eq(donors.id, id), eq(donors.organizationId, organizationId)))
      .limit(1);
    return normalizeDonorNotes(result[0]);
  } catch (error) {
    console.error('Failed to retrieve donor by ID:', error);
    throw new Error('Could not retrieve donor.');
  }
}

/**
 * Retrieves a donor by their email and organization ID.
 * @param email - The email of the donor to retrieve.
 * @param organizationId - The ID of the organization the donor belongs to.
 * @returns The donor object if found, otherwise undefined.
 */
export async function getDonorByEmail(
  email: string,
  organizationId: string
): Promise<Donor | undefined> {
  try {
    const result = await db
      .select()
      .from(donors)
      .where(and(eq(donors.email, email), eq(donors.organizationId, organizationId)))
      .limit(1);
    return result[0];
  } catch (error) {
    console.error('Failed to retrieve donor by email:', error);
    throw new Error('Could not retrieve donor by email.');
  }
}

/**
 * Retrieves multiple donors by their IDs and organization ID.
 * @param ids - Array of donor IDs to retrieve.
 * @param organizationId - The ID of the organization the donors belong to.
 * @returns Array of donor objects found.
 */
export async function getDonorsByIds(ids: number[], organizationId: string): Promise<Donor[]> {
  try {
    if (ids.length === 0) {
      return [];
    }

    const result = await db
      .select()
      .from(donors)
      .where(and(inArray(donors.id, ids), eq(donors.organizationId, organizationId)));
    return result.map((donor) => normalizeDonorNotes(donor));
  } catch (error) {
    console.error('Failed to retrieve donors by IDs:', error);
    throw new Error('Could not retrieve donors by IDs.');
  }
}

/**
 * Creates a new donor.
 * @param donorData - The data for the new donor. `id`, `createdAt`, `updatedAt` are typically auto-generated.
 * @returns The newly created donor object.
 */
export async function createDonor(
  donorData: Omit<NewDonor, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Donor> {
  try {
    const result = await db.insert(donors).values(donorData).returning();
    return normalizeDonorNotes(result[0]);
  } catch (error) {
    console.error('Failed to create donor:', error);
    if (
      error instanceof Error &&
      error.message.includes('duplicate key value violates unique constraint')
    ) {
      throw new Error('Donor with this email already exists in this organization.');
    }
    throw new Error('Could not create donor.');
  }
}

/**
 * Updates an existing donor.
 * @param id - The ID of the donor to update.
 * @param donorData - The data to update for the donor.
 * @param organizationId - The ID of the organization the donor belongs to.
 * @returns The updated donor object.
 */
export async function updateDonor(
  id: number,
  donorData: Partial<Omit<NewDonor, 'id' | 'createdAt' | 'updatedAt'>>,
  organizationId: string
): Promise<Donor | undefined> {
  try {
    const result = await db
      .update(donors)
      .set({ ...donorData, updatedAt: sql`now()` })
      .where(and(eq(donors.id, id), eq(donors.organizationId, organizationId)))
      .returning();
    return normalizeDonorNotes(result[0]);
  } catch (error) {
    console.error('Failed to update donor:', error);
    if (
      error instanceof Error &&
      error.message.includes('duplicate key value violates unique constraint')
    ) {
      throw new Error(
        'Cannot update to an email that already exists for another donor in this organization.'
      );
    }
    throw new Error('Could not update donor.');
  }
}

/**
 * Deletes a donor with different deletion modes.
 * @param id - The ID of the donor to delete.
 * @param organizationId - The ID of the organization the donor belongs to.
 * @param options - Optional deletion mode configuration.
 */
export async function deleteDonor(
  id: number,
  organizationId: string,
  options?: {
    deleteMode?: 'fromList' | 'fromAllLists' | 'entirely';
    listId?: number;
  }
): Promise<void> {
  try {
    // First verify the donor exists and belongs to the organization
    const donor = await getDonorById(id, organizationId);
    if (!donor) {
      throw new Error('Donor not found or access denied');
    }

    const deleteMode = options?.deleteMode || 'entirely';

    if (deleteMode === 'fromList') {
      // Delete from specific list only
      if (!options?.listId) {
        throw new Error('List ID is required when deleting from a specific list');
      }

      const result = await db
        .delete(donorListMembers)
        .where(and(eq(donorListMembers.donorId, id), eq(donorListMembers.listId, options.listId)));

      if ((result.rowCount || 0) === 0) {
        throw new Error('Donor is not a member of the specified list');
      }
    } else if (deleteMode === 'fromAllLists') {
      // Remove from all lists but keep donor record
      await removeFromAllLists(id, organizationId);
    } else {
      // Delete entirely - original behavior
      // Start a transaction to ensure all deletes succeed or all fail
      await db.transaction(async (tx) => {
        // 1. Delete donations (these don't have cascade delete)
        await tx.delete(donations).where(eq(donations.donorId, id));

        // 2. Delete communication content where donor is sender or receiver
        await tx
          .delete(communicationContent)
          .where(
            or(eq(communicationContent.fromDonorId, id), eq(communicationContent.toDonorId, id))
          );

        // 3. Delete donor list memberships
        await tx.delete(donorListMembers).where(eq(donorListMembers.donorId, id));

        // 4. Delete email trackers
        await tx.delete(emailTrackers).where(eq(emailTrackers.donorId, id));

        // 5. Delete generated emails
        await tx.delete(generatedEmails).where(eq(generatedEmails.donorId, id));

        // 6. Delete person research records
        await tx.delete(personResearch).where(eq(personResearch.donorId, id));

        // 7. Delete todos associated with this donor
        await tx.delete(todos).where(eq(todos.donorId, id));

        // 8. Finally delete the donor (communication thread donors will cascade automatically)
        await tx
          .delete(donors)
          .where(and(eq(donors.id, id), eq(donors.organizationId, organizationId)));
      });
    }
  } catch (error) {
    console.error('Failed to delete donor:', error);
    throw new Error(error instanceof Error ? error.message : 'Could not delete donor.');
  }
}

/**
 * Assigns a donor to a staff member.
 * @param donorId - The ID of the donor to assign.
 * @param staffId - The ID of the staff member to assign the donor to.
 * @param organizationId - The ID of the organization both donor and staff belong to.
 * @returns The updated donor object.
 */
export async function assignDonorToStaff(
  donorId: number,
  staffId: number,
  organizationId: string
): Promise<Donor | undefined> {
  try {
    // First verify the staff member exists and belongs to the organization
    const staffMember = await db
      .select()
      .from(staff)
      .where(and(eq(staff.id, staffId), eq(staff.organizationId, organizationId)))
      .limit(1);

    if (!staffMember[0]) {
      throw new Error('Staff member not found in this organization.');
    }

    // Update the donor's assigned staff
    const result = await db
      .update(donors)
      .set({ assignedToStaffId: staffId, updatedAt: sql`now()` })
      .where(and(eq(donors.id, donorId), eq(donors.organizationId, organizationId)))
      .returning();
    return result[0];
  } catch (error) {
    console.error('Failed to assign donor to staff:', error);
    throw new Error('Could not assign donor to staff member.');
  }
}

/**
 * Removes staff assignment from a donor.
 * @param donorId - The ID of the donor to unassign.
 * @param organizationId - The ID of the organization the donor belongs to.
 * @returns The updated donor object.
 */
export async function unassignDonorFromStaff(
  donorId: number,
  organizationId: string
): Promise<Donor | undefined> {
  try {
    const result = await db
      .update(donors)
      .set({ assignedToStaffId: null, updatedAt: sql`now()` })
      .where(and(eq(donors.id, donorId), eq(donors.organizationId, organizationId)))
      .returning();
    return result[0];
  } catch (error) {
    console.error('Failed to unassign donor from staff:', error);
    throw new Error('Could not unassign donor from staff member.');
  }
}

/**
 * Gets the stage information and possible actions for a donor based on their current stage
 * and the organization's donor journey configuration.
 */
async function getDonorStageInfo(
  donor: Donor,
  organizationId: string
): Promise<Pick<DonorWithDetails, 'stageName' | 'stageExplanation' | 'possibleActions'>> {
  try {
    // Get the organization's donor journey
    const org = await db
      .select({ donorJourney: organizations.donorJourney })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    const journey = org[0]?.donorJourney as DonorJourney;
    if (!journey || !journey.nodes || !journey.edges) {
      return {
        stageName: 'No Journey Defined',
        stageExplanation: 'The organization has not defined a donor journey.',
        possibleActions: [],
      };
    }

    // Find the current stage node
    const currentStage = journey.nodes.find((node) => node.label === donor.currentStageName);

    if (!currentStage) {
      // If no current stage is set, assume they're at the first stage
      const firstStage = journey.nodes[0];
      if (!firstStage) {
        return {
          stageName: 'No Stages Defined',
          stageExplanation: 'No stages have been defined in the donor journey.',
          possibleActions: [],
        };
      }
      return {
        stageName: firstStage.label,
        stageExplanation: firstStage.properties.description,
        possibleActions: [
          ...(firstStage.properties.actions || []),
          ...journey.edges
            .filter((edge) => edge.source === firstStage.id)
            .map((edge) => edge.label),
        ],
      };
    }

    return {
      stageName: currentStage.label,
      stageExplanation: currentStage.properties.description,
      possibleActions: [
        ...(currentStage.properties.actions || []),
        ...journey.edges
          .filter((edge) => edge.source === currentStage.id)
          .map((edge) => edge.label),
      ],
    };
  } catch (error) {
    console.error('Failed to get donor stage info:', error);
    return {
      stageName: 'Error',
      stageExplanation: 'Failed to retrieve stage information.',
      possibleActions: [],
    };
  }
}

/**
 * Lists donors with optional search, filtering, and sorting.
 * @param options - Options for searching, filtering, pagination, and sorting.
 * @param organizationId - The ID of the organization to filter donors by.
 * @returns An object containing an array of donor objects and the total count.
 */
export async function listDonors(
  options: {
    searchTerm?: string;
    state?: string;
    gender?: 'male' | 'female' | null;
    assignedToStaffId?: number | null;
    listId?: number;
    notInAnyList?: boolean;
    onlyResearched?: boolean;
    limit?: number;
    offset?: number;
    orderBy?: 'firstName' | 'lastName' | 'email' | 'createdAt' | 'totalDonated';
    orderDirection?: 'asc' | 'desc';
  } = {},
  organizationId: string
): Promise<{ donors: DonorWithDetails[]; totalCount: number }> {
  try {
    const {
      searchTerm,
      state,
      gender,
      assignedToStaffId,
      listId,
      notInAnyList,
      onlyResearched,
      limit, // No default limit - if not provided, fetch all
      offset = 0,
      orderBy,
      orderDirection = 'asc',
    } = options;
    const whereClauses: SQL[] = [eq(donors.organizationId, organizationId)];

    if (searchTerm) {
      const term = `%${searchTerm.toLowerCase()}%`;
      const searchCondition = or(
        like(sql`lower(${donors.firstName})`, term),
        like(sql`lower(${donors.lastName})`, term),
        like(sql`lower(${donors.displayName})`, term),
        like(sql`lower(${donors.email})`, term)
      );
      if (searchCondition) {
        whereClauses.push(searchCondition);
      }
    }
    if (state) {
      whereClauses.push(eq(donors.state, state.toUpperCase()));
    }
    if (gender !== undefined) {
      if (gender === null) {
        whereClauses.push(isNull(donors.gender));
      } else {
        whereClauses.push(eq(donors.gender, gender));
      }
    }

    if (assignedToStaffId === null) {
      whereClauses.push(isNull(donors.assignedToStaffId));
    } else if (assignedToStaffId !== undefined) {
      whereClauses.push(eq(donors.assignedToStaffId, assignedToStaffId));
    }

    // Add filter for researched donors
    if (onlyResearched) {
      // Only include donors that have a matching research record
      whereClauses.push(sql`EXISTS (
        SELECT 1 FROM ${personResearch} 
        WHERE ${personResearch.donorId} = ${donors.id} 
        AND ${personResearch.isLive} = true
      )`);
    }

    // Add filter for list membership
    if (listId !== undefined) {
      whereClauses.push(sql`EXISTS (
        SELECT 1 FROM ${donorListMembers} 
        WHERE ${donorListMembers.donorId} = ${donors.id} 
        AND ${donorListMembers.listId} = ${listId}
      )`);
    }

    // Add filter for donors not in any list
    if (notInAnyList) {
      whereClauses.push(sql`NOT EXISTS (
        SELECT 1 FROM ${donorListMembers} 
        WHERE ${donorListMembers.donorId} = ${donors.id}
      )`);
    }

    // If ordering by totalDonated, we need to join with donations table
    const needsDonationJoin = orderBy === 'totalDonated';

    let queryBuilder;
    if (needsDonationJoin) {
      queryBuilder = db
        .select({
          // All donor fields
          id: donors.id,
          organizationId: donors.organizationId,
          externalId: donors.externalId,
          firstName: donors.firstName,
          lastName: donors.lastName,
          displayName: donors.displayName,
          email: donors.email,
          phone: donors.phone,
          address: donors.address,
          state: donors.state,
          notes: donors.notes,
          isCouple: donors.isCouple,
          gender: donors.gender,
          hisTitle: donors.hisTitle,
          hisFirstName: donors.hisFirstName,
          hisInitial: donors.hisInitial,
          hisLastName: donors.hisLastName,
          herTitle: donors.herTitle,
          herFirstName: donors.herFirstName,
          herInitial: donors.herInitial,
          herLastName: donors.herLastName,
          assignedToStaffId: donors.assignedToStaffId,
          currentStageName: donors.currentStageName,
          classificationReasoning: donors.classificationReasoning,
          predictedActions: donors.predictedActions,
          highPotentialDonor: donors.highPotentialDonor,
          createdAt: donors.createdAt,
          updatedAt: donors.updatedAt,
          // Research rationale from the live person research record
          highPotentialDonorRationale: sql<string | null>`
            (${personResearch.researchData}->>'structuredData')::jsonb->>'highPotentialDonorRationale'
          `,
          // Total donated amount for sorting
          totalDonated: sql<number>`COALESCE(SUM(${donations.amount}), 0)`,
        })
        .from(donors)
        .leftJoin(
          personResearch,
          and(eq(personResearch.donorId, donors.id), eq(personResearch.isLive, true))
        )
        .leftJoin(donations, eq(donations.donorId, donors.id))
        .where(and(...whereClauses))
        .groupBy(
          donors.id,
          donors.organizationId,
          donors.externalId,
          donors.firstName,
          donors.lastName,
          donors.displayName,
          donors.email,
          donors.phone,
          donors.address,
          donors.state,
          donors.notes,
          donors.isCouple,
          donors.gender,
          donors.hisTitle,
          donors.hisFirstName,
          donors.hisInitial,
          donors.hisLastName,
          donors.herTitle,
          donors.herFirstName,
          donors.herInitial,
          donors.herLastName,
          donors.assignedToStaffId,
          donors.currentStageName,
          donors.classificationReasoning,
          donors.predictedActions,
          donors.highPotentialDonor,
          donors.createdAt,
          donors.updatedAt,
          personResearch.researchData
        );
    } else {
      queryBuilder = db
        .select({
          // All donor fields
          id: donors.id,
          organizationId: donors.organizationId,
          externalId: donors.externalId,
          firstName: donors.firstName,
          lastName: donors.lastName,
          displayName: donors.displayName,
          email: donors.email,
          phone: donors.phone,
          address: donors.address,
          state: donors.state,
          notes: donors.notes,
          isCouple: donors.isCouple,
          gender: donors.gender,
          hisTitle: donors.hisTitle,
          hisFirstName: donors.hisFirstName,
          hisInitial: donors.hisInitial,
          hisLastName: donors.hisLastName,
          herTitle: donors.herTitle,
          herFirstName: donors.herFirstName,
          herInitial: donors.herInitial,
          herLastName: donors.herLastName,
          assignedToStaffId: donors.assignedToStaffId,
          currentStageName: donors.currentStageName,
          classificationReasoning: donors.classificationReasoning,
          predictedActions: donors.predictedActions,
          highPotentialDonor: donors.highPotentialDonor,
          createdAt: donors.createdAt,
          updatedAt: donors.updatedAt,
          // Research rationale from the live person research record
          highPotentialDonorRationale: sql<string | null>`
            (${personResearch.researchData}->>'structuredData')::jsonb->>'highPotentialDonorRationale'
          `,
        })
        .from(donors)
        .leftJoin(
          personResearch,
          and(eq(personResearch.donorId, donors.id), eq(personResearch.isLive, true))
        )
        .where(and(...whereClauses));
    }

    if (orderBy) {
      if (orderBy === 'totalDonated') {
        const directionFn = orderDirection === 'asc' ? asc : desc;
        queryBuilder = queryBuilder.orderBy(
          directionFn(sql<number>`COALESCE(SUM(${donations.amount}), 0)`)
        );
      } else {
        const columnMap: { [key in Exclude<typeof orderBy, 'totalDonated'>]: AnyColumn } = {
          firstName: donors.firstName,
          lastName: donors.lastName,
          email: donors.email,
          createdAt: donors.createdAt,
        };
        const selectedColumn = columnMap[orderBy];
        if (selectedColumn) {
          const directionFn = orderDirection === 'asc' ? asc : desc;
          // @ts-ignore Drizzle's orderBy type can be tricky with dynamic columns
          queryBuilder = queryBuilder.orderBy(directionFn(selectedColumn));
        }
      }
    }

    // Apply pagination if limit is provided, otherwise get all results
    let results;
    if (limit !== undefined) {
      results = await queryBuilder.limit(limit).offset(offset);
    } else {
      results = await queryBuilder;
    }

    const totalCountResult = await db
      .select({ count: count() })
      .from(donors)
      .where(and(...whereClauses));

    // Get stage info for each donor
    const donorsWithStageInfo = await Promise.all(
      results.map(async (donor) => {
        const stageInfo = await getDonorStageInfo(donor, organizationId);
        // Ensure predictedActions conforms to string[] | undefined
        let processedPredictedActions: string[] | undefined = undefined;
        if (Array.isArray(donor.predictedActions)) {
          if (donor.predictedActions.every((item) => typeof item === 'string')) {
            processedPredictedActions = donor.predictedActions as string[];
          }
        }

        return normalizeDonorNotes({
          ...donor,
          predictedActions: processedPredictedActions, // Use processed value
          ...stageInfo,
        });
      })
    );

    return {
      donors: donorsWithStageInfo,
      totalCount: totalCountResult[0]?.count || 0,
    };
  } catch (error) {
    console.error('Failed to list donors:', error);
    throw new Error('Could not list donors.');
  }
}

/**
 * Lists donors with minimal data for communication features (optimized for performance).
 * Returns only essential fields without stage information processing.
 * @param options - Options for searching, filtering, pagination, and sorting.
 * @param organizationId - The ID of the organization to filter donors by.
 * @returns An object containing an array of lightweight donor objects and the total count.
 */
export async function listDonorsForCommunication(
  options: {
    searchTerm?: string;
    limit?: number;
    offset?: number;
    orderBy?: 'firstName' | 'lastName' | 'email' | 'createdAt';
    orderDirection?: 'asc' | 'desc';
  } = {},
  organizationId: string
): Promise<{ donors: CommunicationDonor[]; totalCount: number }> {
  try {
    const { searchTerm, limit, offset = 0, orderBy, orderDirection = 'asc' } = options;
    const whereClauses: SQL[] = [eq(donors.organizationId, organizationId)];

    if (searchTerm) {
      const term = `%${searchTerm.toLowerCase()}%`;
      const searchCondition = or(
        like(sql`lower(${donors.firstName})`, term),
        like(sql`lower(${donors.lastName})`, term),
        like(sql`lower(${donors.displayName})`, term),
        like(sql`lower(${donors.email})`, term)
      );
      if (searchCondition) {
        whereClauses.push(searchCondition);
      }
    }

    let queryBuilder = db
      .select({
        id: donors.id,
        firstName: donors.firstName,
        lastName: donors.lastName,
        email: donors.email,
        phone: donors.phone,
        displayName: donors.displayName,
        hisTitle: donors.hisTitle,
        hisFirstName: donors.hisFirstName,
        hisInitial: donors.hisInitial,
        hisLastName: donors.hisLastName,
        herTitle: donors.herTitle,
        herFirstName: donors.herFirstName,
        herInitial: donors.herInitial,
        herLastName: donors.herLastName,
        isCouple: donors.isCouple,
      })
      .from(donors)
      .where(and(...whereClauses));

    if (orderBy) {
      const columnMap: { [key in NonNullable<typeof orderBy>]: AnyColumn } = {
        firstName: donors.firstName,
        lastName: donors.lastName,
        email: donors.email,
        createdAt: donors.createdAt,
      };
      const selectedColumn = columnMap[orderBy];
      if (selectedColumn) {
        const directionFn = orderDirection === 'asc' ? asc : desc;
        // @ts-ignore Drizzle's orderBy type can be tricky with dynamic columns
        queryBuilder = queryBuilder.orderBy(directionFn(selectedColumn));
      }
    }

    // Apply pagination if limit is provided, otherwise get all results
    let results;
    if (limit !== undefined) {
      results = await queryBuilder.limit(limit).offset(offset);
    } else {
      results = await queryBuilder;
    }

    const totalCountResult = await db
      .select({ count: count() })
      .from(donors)
      .where(and(...whereClauses));

    return {
      donors: results,
      totalCount: totalCountResult[0]?.count || 0,
    };
  } catch (error) {
    console.error('Failed to list donors for communication:', error);
    throw new Error('Could not list donors for communication.');
  }
}

/**
 * Deletes multiple donors and all associated records efficiently (batch cascading delete).
 * @param ids - Array of donor IDs to delete.
 * @param organizationId - The ID of the organization the donors belong to.
 * @returns Object with success and failure counts
 */
export async function bulkDeleteDonors(
  ids: number[],
  organizationId: string
): Promise<{
  success: number;
  failed: number;
  errors: string[];
}> {
  if (ids.length === 0) {
    return { success: 0, failed: 0, errors: [] };
  }

  const results = { success: 0, failed: 0, errors: [] as string[] };

  try {
    // First verify all donors exist and belong to the organization
    const existingDonors = await getDonorsByIds(ids, organizationId);
    const validDonorIds = existingDonors.map((d) => d.id);

    if (validDonorIds.length === 0) {
      return {
        success: 0,
        failed: ids.length,
        errors: ['No valid donors found in your organization'],
      };
    }

    // Start a transaction for batch deletion
    await db.transaction(async (tx) => {
      // 1. Delete donations in batch
      await tx.delete(donations).where(inArray(donations.donorId, validDonorIds));

      // 2. Delete communication content where donor is sender or receiver
      await tx
        .delete(communicationContent)
        .where(
          or(
            inArray(communicationContent.fromDonorId, validDonorIds),
            inArray(communicationContent.toDonorId, validDonorIds)
          )
        );

      // 3. Delete donor list memberships in batch
      await tx.delete(donorListMembers).where(inArray(donorListMembers.donorId, validDonorIds));

      // 4. Delete email trackers in batch
      await tx.delete(emailTrackers).where(inArray(emailTrackers.donorId, validDonorIds));

      // 5. Delete generated emails in batch
      await tx.delete(generatedEmails).where(inArray(generatedEmails.donorId, validDonorIds));

      // 6. Delete person research records in batch
      await tx.delete(personResearch).where(inArray(personResearch.donorId, validDonorIds));

      // 7. Delete todos associated with donors in batch
      await tx.delete(todos).where(inArray(todos.donorId, validDonorIds));

      // 8. Finally delete the donors in batch (communication thread donors will cascade automatically)
      await tx
        .delete(donors)
        .where(and(inArray(donors.id, validDonorIds), eq(donors.organizationId, organizationId)));
    });

    results.success = validDonorIds.length;
    results.failed = ids.length - validDonorIds.length;

    if (results.failed > 0) {
      results.errors.push(`${results.failed} donor(s) not found in your organization`);
    }
  } catch (error) {
    console.error('Failed to bulk delete donors:', error);
    results.failed = ids.length;
    results.errors.push(
      'Failed to delete donors: ' + (error instanceof Error ? error.message : 'Unknown error')
    );
  }

  return results;
}

/**
 * Lists donors based on comprehensive criteria including donation history
 * @param criteria - Filtering criteria for donors
 * @param organizationId - The organization ID to filter by
 * @returns Object containing filtered donors and total count
 */
/**
 * Bulk update assigned staff for multiple donors
 */
export async function bulkUpdateAssignedStaff(
  donorIds: number[],
  staffId: number | null,
  organizationId: string
): Promise<void> {
  try {
    await db
      .update(donors)
      .set({ assignedToStaffId: staffId, updatedAt: sql`now()` })
      .where(and(inArray(donors.id, donorIds), eq(donors.organizationId, organizationId)));
  } catch (error) {
    console.error('Failed to bulk update assigned staff:', error);
    throw new Error('Could not update assigned staff for donors.');
  }
}

/**
 * Add a note to a donor
 */
export async function addNoteToDonor(
  donorId: number,
  note: DonorNote,
  organizationId: string
): Promise<Donor> {
  try {
    // Get existing donor to retrieve current notes
    const existingDonor = await getDonorById(donorId, organizationId);

    if (!existingDonor) {
      throw new Error('Donor not found');
    }

    // Get existing notes
    const existingNotes = (existingDonor.notes as DonorNote[]) || [];

    // Update donor with new note
    const result = await db
      .update(donors)
      .set({
        notes: [...existingNotes, note],
        updatedAt: new Date(),
      })
      .where(and(eq(donors.id, donorId), eq(donors.organizationId, organizationId)))
      .returning();

    if (!result[0]) {
      throw new Error('Failed to add note to donor');
    }

    return normalizeDonorNotes(result[0]);
  } catch (error) {
    console.error('Failed to add note to donor:', error);
    throw new Error('Could not add note to donor.');
  }
}

export async function editDonorNote(
  donorId: number,
  noteIndex: number,
  newContent: string,
  organizationId: string
): Promise<Donor> {
  try {
    // Get existing donor to retrieve current notes
    const existingDonor = await getDonorById(donorId, organizationId);

    if (!existingDonor) {
      throw new Error('Donor not found');
    }

    // Get existing notes
    const existingNotes = (existingDonor.notes as DonorNote[]) || [];

    // Validate note index
    if (noteIndex < 0 || noteIndex >= existingNotes.length) {
      throw new Error('Note index out of bounds');
    }

    // Update the note at the specified index
    const updatedNotes = [...existingNotes];
    updatedNotes[noteIndex] = {
      ...updatedNotes[noteIndex],
      content: newContent,
    };

    // Update donor with modified notes
    const result = await db
      .update(donors)
      .set({
        notes: updatedNotes,
        updatedAt: new Date(),
      })
      .where(and(eq(donors.id, donorId), eq(donors.organizationId, organizationId)))
      .returning();

    if (!result[0]) {
      throw new Error('Failed to edit note');
    }

    return normalizeDonorNotes(result[0]);
  } catch (error) {
    console.error('Failed to edit donor note:', error);
    throw new Error('Could not edit donor note.');
  }
}

export async function deleteDonorNote(
  donorId: number,
  noteIndex: number,
  organizationId: string
): Promise<Donor> {
  try {
    // Get existing donor to retrieve current notes
    const existingDonor = await getDonorById(donorId, organizationId);

    if (!existingDonor) {
      throw new Error('Donor not found');
    }

    // Get existing notes
    const existingNotes = (existingDonor.notes as DonorNote[]) || [];

    // Validate note index
    if (noteIndex < 0 || noteIndex >= existingNotes.length) {
      throw new Error('Note index out of bounds');
    }

    // Remove the note at the specified index
    const updatedNotes = existingNotes.filter((_, index) => index !== noteIndex);

    // Update donor with modified notes
    const result = await db
      .update(donors)
      .set({
        notes: updatedNotes,
        updatedAt: new Date(),
      })
      .where(and(eq(donors.id, donorId), eq(donors.organizationId, organizationId)))
      .returning();

    if (!result[0]) {
      throw new Error('Failed to delete note');
    }

    return normalizeDonorNotes(result[0]);
  } catch (error) {
    console.error('Failed to delete donor note:', error);
    throw new Error('Could not delete donor note.');
  }
}

export async function listDonorsByCriteria(
  criteria: {
    createdDateFrom?: Date;
    createdDateTo?: Date;
    lastDonationDateFrom?: Date;
    lastDonationDateTo?: Date;
    highestDonationMin?: number; // in cents
    highestDonationMax?: number; // in cents
    totalDonationMin?: number; // in cents
    totalDonationMax?: number; // in cents
    assignedToStaffId?: number | null;
    includeNoDonations?: boolean;
    limit?: number;
    offset?: number;
  },
  organizationId: string
): Promise<{ donors: DonorWithDetails[]; totalCount: number }> {
  try {
    const {
      createdDateFrom,
      createdDateTo,
      lastDonationDateFrom,
      lastDonationDateTo,
      highestDonationMin,
      highestDonationMax,
      totalDonationMin,
      totalDonationMax,
      assignedToStaffId,
      includeNoDonations = false,
      limit,
      offset = 0,
    } = criteria;

    // Build base where conditions for donors
    const whereClauses: SQL[] = [eq(donors.organizationId, organizationId)];

    // Add donor creation date filters
    if (createdDateFrom) {
      whereClauses.push(sql`${donors.createdAt} >= ${createdDateFrom}`);
    }
    if (createdDateTo) {
      whereClauses.push(sql`${donors.createdAt} <= ${createdDateTo}`);
    }

    // Add staff assignment filter
    if (assignedToStaffId === null) {
      whereClauses.push(isNull(donors.assignedToStaffId));
    } else if (assignedToStaffId !== undefined) {
      whereClauses.push(eq(donors.assignedToStaffId, assignedToStaffId));
    }

    // Build donation-related subqueries and filters
    const donationFilters: SQL[] = [];

    // Last donation date filters
    if (lastDonationDateFrom || lastDonationDateTo) {
      const lastDonationConditions: SQL[] = [];
      if (lastDonationDateFrom) {
        lastDonationConditions.push(sql`MAX(${donations.date}) >= ${lastDonationDateFrom}`);
      }
      if (lastDonationDateTo) {
        lastDonationConditions.push(sql`MAX(${donations.date}) <= ${lastDonationDateTo}`);
      }

      donationFilters.push(sql`EXISTS (
        SELECT 1 FROM ${donations} 
        WHERE ${donations.donorId} = ${donors.id}
        GROUP BY ${donations.donorId}
        HAVING ${and(...lastDonationConditions)}
      )`);
    }

    // Highest donation amount filters
    if (highestDonationMin !== undefined || highestDonationMax !== undefined) {
      const highestDonationConditions: SQL[] = [];
      if (highestDonationMin !== undefined) {
        highestDonationConditions.push(sql`MAX(${donations.amount}) >= ${highestDonationMin}`);
      }
      if (highestDonationMax !== undefined) {
        highestDonationConditions.push(sql`MAX(${donations.amount}) <= ${highestDonationMax}`);
      }

      donationFilters.push(sql`EXISTS (
        SELECT 1 FROM ${donations} 
        WHERE ${donations.donorId} = ${donors.id}
        GROUP BY ${donations.donorId}
        HAVING ${and(...highestDonationConditions)}
      )`);
    }

    // Total donation amount filters
    if (totalDonationMin !== undefined || totalDonationMax !== undefined) {
      const totalDonationConditions: SQL[] = [];
      if (totalDonationMin !== undefined) {
        totalDonationConditions.push(sql`SUM(${donations.amount}) >= ${totalDonationMin}`);
      }
      if (totalDonationMax !== undefined) {
        totalDonationConditions.push(sql`SUM(${donations.amount}) <= ${totalDonationMax}`);
      }

      donationFilters.push(sql`EXISTS (
        SELECT 1 FROM ${donations} 
        WHERE ${donations.donorId} = ${donors.id}
        GROUP BY ${donations.donorId}
        HAVING ${and(...totalDonationConditions)}
      )`);
    }

    // Add donation filters to main where clause
    if (donationFilters.length > 0) {
      if (includeNoDonations) {
        // Include donors with no donations OR donors that match the donation criteria
        whereClauses.push(
          or(
            sql`NOT EXISTS (SELECT 1 FROM ${donations} WHERE ${donations.donorId} = ${donors.id})`,
            and(...donationFilters)
          )!
        );
      } else {
        // Only include donors that match the donation criteria
        whereClauses.push(and(...donationFilters)!);
      }
    } else if (!includeNoDonations) {
      // If no donation filters but not including no donations, only include donors with donations
      whereClauses.push(
        sql`EXISTS (SELECT 1 FROM ${donations} WHERE ${donations.donorId} = ${donors.id})`
      );
    }

    // Build the main query
    const queryBuilder = db
      .select({
        id: donors.id,
        organizationId: donors.organizationId,
        externalId: donors.externalId,
        firstName: donors.firstName,
        lastName: donors.lastName,
        displayName: donors.displayName,
        email: donors.email,
        phone: donors.phone,
        address: donors.address,
        state: donors.state,
        notes: donors.notes,
        isCouple: donors.isCouple,
        gender: donors.gender,
        hisTitle: donors.hisTitle,
        hisFirstName: donors.hisFirstName,
        hisInitial: donors.hisInitial,
        hisLastName: donors.hisLastName,
        herTitle: donors.herTitle,
        herFirstName: donors.herFirstName,
        herInitial: donors.herInitial,
        herLastName: donors.herLastName,
        assignedToStaffId: donors.assignedToStaffId,
        currentStageName: donors.currentStageName,
        classificationReasoning: donors.classificationReasoning,
        predictedActions: donors.predictedActions,
        highPotentialDonor: donors.highPotentialDonor,
        createdAt: donors.createdAt,
        updatedAt: donors.updatedAt,
        // Research rationale from the live person research record
        highPotentialDonorRationale: sql<string | null>`
          (${personResearch.researchData}->>'structuredData')::jsonb->>'highPotentialDonorRationale'
        `,
      })
      .from(donors)
      .leftJoin(
        personResearch,
        and(eq(personResearch.donorId, donors.id), eq(personResearch.isLive, true))
      )
      .where(and(...whereClauses))
      .orderBy(asc(donors.firstName), asc(donors.lastName));

    // Get total count
    const countQuery = db
      .select({ count: count(donors.id) })
      .from(donors)
      .leftJoin(
        personResearch,
        and(eq(personResearch.donorId, donors.id), eq(personResearch.isLive, true))
      )
      .where(and(...whereClauses));

    const [totalResult, donorsResult] = await Promise.all([
      countQuery,
      limit !== undefined ? queryBuilder.limit(limit).offset(offset) : queryBuilder,
    ]);

    const totalCount = totalResult[0]?.count || 0;

    // Map to DonorWithDetails format
    const donorsWithDetails: DonorWithDetails[] = donorsResult.map((donor) => ({
      ...donor,
      predictedActions: (donor.predictedActions as string[]) || [],
    }));

    return {
      donors: donorsWithDetails,
      totalCount,
    };
  } catch (error) {
    console.error('Failed to list donors by criteria:', error);
    throw new Error('Could not list donors by criteria.');
  }
}

/**
 * Updates a donor's stage classification
 */
export async function updateDonorStageClassification(
  donorId: number,
  stageName: string,
  reasoning?: string
): Promise<void> {
  try {
    await db
      .update(donors)
      .set({
        currentStageName: stageName,
        classificationReasoning: reasoning,
        updatedAt: sql`now()`,
      })
      .where(eq(donors.id, donorId));
  } catch (error) {
    console.error('Failed to update donor stage classification:', error);
    throw new Error('Could not update donor stage classification.');
  }
}

/**
 * Updates a donor's predicted actions
 */
export async function updateDonorPredictedActions(
  donorId: number,
  predictedActions: any[]
): Promise<void> {
  try {
    await db
      .update(donors)
      .set({
        predictedActions: predictedActions,
        updatedAt: sql`now()`,
      })
      .where(eq(donors.id, donorId));
  } catch (error) {
    console.error('Failed to update donor predicted actions:', error);
    throw new Error('Could not update donor predicted actions.');
  }
}

/**
 * Updates a donor's high potential flag
 */
export async function updateDonorHighPotentialFlag(
  donorId: number,
  highPotentialDonor: boolean
): Promise<void> {
  try {
    await db
      .update(donors)
      .set({
        highPotentialDonor: highPotentialDonor,
        updatedAt: sql`now()`,
      })
      .where(eq(donors.id, donorId));
  } catch (error) {
    console.error('Failed to update donor high potential flag:', error);
    throw new Error('Could not update donor high potential flag.');
  }
}

/**
 * Gets count statistics for researched and unresearched donors
 */
export async function getUnresearchedDonorsCount(
  organizationId: string,
  donorIds?: number[]
): Promise<{
  totalDonors: number;
  unresearchedDonors: number;
  researchedDonors: number;
}> {
  try {
    let totalDonorsQuery;
    let unresearchedDonorsQuery;

    // If specific donor IDs are provided, filter by them
    if (donorIds && donorIds.length > 0) {
      totalDonorsQuery = db
        .select({ count: count() })
        .from(donors)
        .where(and(eq(donors.organizationId, organizationId), inArray(donors.id, donorIds)));

      unresearchedDonorsQuery = db
        .select({ count: count() })
        .from(donors)
        .where(
          and(
            eq(donors.organizationId, organizationId),
            inArray(donors.id, donorIds),
            notExists(db.select().from(personResearch).where(eq(personResearch.donorId, donors.id)))
          )
        );
    } else {
      totalDonorsQuery = db
        .select({ count: count() })
        .from(donors)
        .where(eq(donors.organizationId, organizationId));

      unresearchedDonorsQuery = db
        .select({ count: count() })
        .from(donors)
        .where(
          and(
            eq(donors.organizationId, organizationId),
            notExists(db.select().from(personResearch).where(eq(personResearch.donorId, donors.id)))
          )
        );
    }

    const [totalResult, unresearchedResult] = await Promise.all([
      totalDonorsQuery,
      unresearchedDonorsQuery,
    ]);

    const totalDonors = totalResult[0]?.count || 0;
    const unresearchedDonors = unresearchedResult[0]?.count || 0;
    const researchedDonors = totalDonors - unresearchedDonors;

    return {
      totalDonors,
      unresearchedDonors,
      researchedDonors,
    };
  } catch (error) {
    console.error('Failed to get unresearched donors count:', error);
    throw new Error('Could not get donor research statistics.');
  }
}

/**
 * Get all donors for an organization
 */
export async function getAllDonorsByOrganization(organizationId: string): Promise<Donor[]> {
  try {
    return await db.query.donors.findMany({
      where: eq(donors.organizationId, organizationId),
    });
  } catch (error) {
    console.error('Failed to get all donors by organization:', error);
    throw new Error('Could not retrieve donors.');
  }
}
