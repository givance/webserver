import { db } from '../db';
import { donorLists, donorListMembers, donors, donations } from '../db/schema';
import { eq, and, desc, asc, ilike, inArray, count, sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

// Type definitions
export type DonorList = InferSelectModel<typeof donorLists>;
export type InsertDonorList = InferInsertModel<typeof donorLists>;
export type DonorListMember = InferSelectModel<typeof donorListMembers>;
export type InsertDonorListMember = InferInsertModel<typeof donorListMembers>;

export interface DonorListWithMemberCount extends DonorList {
  memberCount: number;
}

export interface DonorListWithMembers extends DonorList {
  members: Array<{
    id: number;
    donorId: number;
    addedAt: Date;
    addedBy: string | null;
    donor: {
      id: number;
      firstName: string;
      lastName: string;
      displayName: string | null;
      email: string;
      phone: string | null;
    };
  }>;
}

/**
 * Create a new donor list
 * @param data The donor list data to create
 * @returns The created donor list
 */
export async function createDonorList(data: InsertDonorList): Promise<DonorList> {
  const [list] = await db.insert(donorLists).values(data).returning();
  return list;
}

/**
 * Get a donor list by ID
 * @param id The donor list ID
 * @param organizationId The organization ID for authorization
 * @returns The donor list if found and authorized
 */
export async function getDonorListById(
  id: number,
  organizationId: string
): Promise<DonorList | null> {
  const [list] = await db
    .select()
    .from(donorLists)
    .where(and(eq(donorLists.id, id), eq(donorLists.organizationId, organizationId)))
    .limit(1);

  return list || null;
}

/**
 * Get multiple donor lists by their IDs
 * @param ids Array of donor list IDs
 * @param organizationId The organization ID for authorization
 * @returns Array of donor lists
 */
export async function getDonorListsByIds(
  ids: number[],
  organizationId: string
): Promise<DonorList[]> {
  if (ids.length === 0) {
    return [];
  }

  const lists = await db
    .select()
    .from(donorLists)
    .where(and(inArray(donorLists.id, ids), eq(donorLists.organizationId, organizationId)));

  return lists;
}

/**
 * Get a donor list with member count
 * @param id The donor list ID
 * @param organizationId The organization ID for authorization
 * @returns The donor list with member count if found and authorized
 */
export async function getDonorListWithMemberCount(
  id: number,
  organizationId: string
): Promise<DonorListWithMemberCount | null> {
  // First get the list
  const list = await getDonorListById(id, organizationId);
  if (!list) return null;

  // Then get the member count
  const [memberCountResult] = await db
    .select({ count: count() })
    .from(donorListMembers)
    .where(eq(donorListMembers.listId, id));

  return {
    ...list,
    memberCount: memberCountResult?.count || 0,
  };
}

/**
 * Get a donor list with all members
 * @param id The donor list ID
 * @param organizationId The organization ID for authorization
 * @returns The donor list with members if found and authorized
 */
export async function getDonorListWithMembers(
  id: number,
  organizationId: string
): Promise<DonorListWithMembers | null> {
  const list = await getDonorListById(id, organizationId);
  if (!list) return null;

  const members = await db
    .select({
      id: donorListMembers.id,
      donorId: donorListMembers.donorId,
      addedAt: donorListMembers.addedAt,
      addedBy: donorListMembers.addedBy,
      donor: {
        id: donors.id,
        firstName: donors.firstName,
        lastName: donors.lastName,
        displayName: donors.displayName,
        email: donors.email,
        phone: donors.phone,
      },
    })
    .from(donorListMembers)
    .innerJoin(donors, eq(donorListMembers.donorId, donors.id))
    .where(eq(donorListMembers.listId, id))
    .orderBy(asc(donorListMembers.addedAt));

  return {
    ...list,
    members,
  };
}

/**
 * List donor lists for an organization
 * @param organizationId The organization ID
 * @param options Filtering and pagination options
 * @returns Array of donor lists with member counts and total count
 */
export async function listDonorLists(
  organizationId: string,
  options: {
    searchTerm?: string;
    isActive?: boolean;
    limit?: number;
    offset?: number;
    orderBy?: 'name' | 'createdAt' | 'updatedAt' | 'memberCount';
    orderDirection?: 'asc' | 'desc';
    includeMemberCount?: boolean;
  } = {}
): Promise<{ lists: DonorListWithMemberCount[]; totalCount: number }> {
  const {
    searchTerm,
    isActive,
    limit = 50,
    offset = 0,
    orderBy = 'name',
    orderDirection = 'asc',
    includeMemberCount = true,
  } = options;

  // Build where conditions
  const whereConditions = [eq(donorLists.organizationId, organizationId)];

  if (searchTerm) {
    whereConditions.push(ilike(donorLists.name, `%${searchTerm}%`));
  }

  if (isActive !== undefined) {
    whereConditions.push(eq(donorLists.isActive, isActive));
  }

  const whereClause = whereConditions.length > 1 ? and(...whereConditions) : whereConditions[0];

  // Get total count
  const [{ count: totalCount }] = await db
    .select({ count: count() })
    .from(donorLists)
    .where(whereClause);

  // Build order clause
  let orderClause;
  const direction = orderDirection === 'desc' ? desc : asc;

  switch (orderBy) {
    case 'createdAt':
      orderClause = direction(donorLists.createdAt);
      break;
    case 'updatedAt':
      orderClause = direction(donorLists.updatedAt);
      break;
    case 'memberCount':
      // For member count ordering, we'll need a subquery
      orderClause = direction(donorLists.name); // Fallback to name for now
      break;
    default:
      orderClause = direction(donorLists.name);
  }

  // Get lists
  const lists = await db
    .select()
    .from(donorLists)
    .where(whereClause)
    .orderBy(orderClause)
    .limit(limit)
    .offset(offset);

  // Get member counts if requested
  if (includeMemberCount && lists.length > 0) {
    const listIds = lists.map((list) => list.id);
    const memberCounts = await db
      .select({
        listId: donorListMembers.listId,
        count: count(),
      })
      .from(donorListMembers)
      .where(inArray(donorListMembers.listId, listIds))
      .groupBy(donorListMembers.listId);

    const memberCountMap = new Map(memberCounts.map((mc) => [mc.listId, mc.count]));

    const listsWithCounts = lists.map((list) => ({
      ...list,
      memberCount: memberCountMap.get(list.id) || 0,
    }));

    return { lists: listsWithCounts, totalCount };
  } else {
    const listsWithCounts = lists.map((list) => ({ ...list, memberCount: 0 }));
    return { lists: listsWithCounts, totalCount };
  }
}

/**
 * Update a donor list
 * @param id The donor list ID
 * @param data The data to update
 * @param organizationId The organization ID for authorization
 * @returns The updated donor list
 */
export async function updateDonorList(
  id: number,
  data: Partial<InsertDonorList>,
  organizationId: string
): Promise<DonorList | null> {
  const [updated] = await db
    .update(donorLists)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(donorLists.id, id), eq(donorLists.organizationId, organizationId)))
    .returning();

  return updated || null;
}

export type ListDeletionMode = 'listOnly' | 'withExclusiveDonors' | 'withAllDonors';

export interface ListDeletionResult {
  listDeleted: boolean;
  donorsDeleted: number;
}

/**
 * Delete a donor list with various deletion modes
 * @param id The donor list ID
 * @param organizationId The organization ID for authorization
 * @param deleteMode The deletion mode:
 *   - "listOnly": Delete only the list, keep all donors
 *   - "withExclusiveDonors": Delete the list and donors that are only in this list
 *   - "withAllDonors": Delete the list and all donors in it
 * @returns Object with deletion results
 */
export async function deleteDonorList(
  id: number,
  organizationId: string,
  deleteMode: ListDeletionMode = 'listOnly'
): Promise<ListDeletionResult> {
  // Start transaction
  return await db.transaction(async (tx) => {
    // First verify the list belongs to the organization
    const list = await getDonorListById(id, organizationId);
    if (!list) {
      return { listDeleted: false, donorsDeleted: 0 };
    }

    let donorsDeleted = 0;

    if (deleteMode === 'withExclusiveDonors') {
      // Get donors that are only in this list
      const exclusiveDonorIds = await getDonorsExclusiveToList(id, organizationId);

      if (exclusiveDonorIds.length > 0) {
        // First delete donations for these donors
        await tx.delete(donations).where(inArray(donations.donorId, exclusiveDonorIds));

        // Then delete the donors (cascade will handle other related data)
        const deleteResult = await tx
          .delete(donors)
          .where(
            and(inArray(donors.id, exclusiveDonorIds), eq(donors.organizationId, organizationId))
          );
        donorsDeleted = deleteResult.rowCount || 0;
      }
    } else if (deleteMode === 'withAllDonors') {
      // Get all donor IDs in this list
      const allDonorIds = await getDonorIdsFromLists([id], organizationId);

      if (allDonorIds.length > 0) {
        // First delete donations for these donors
        await tx.delete(donations).where(inArray(donations.donorId, allDonorIds));

        // Then delete all donors in the list (cascade will handle other related data)
        const deleteResult = await tx
          .delete(donors)
          .where(and(inArray(donors.id, allDonorIds), eq(donors.organizationId, organizationId)));
        donorsDeleted = deleteResult.rowCount || 0;
      }
    }

    // Delete the list (cascade will remove all list memberships)
    const result = await tx
      .delete(donorLists)
      .where(and(eq(donorLists.id, id), eq(donorLists.organizationId, organizationId)));

    return {
      listDeleted: (result.rowCount || 0) > 0,
      donorsDeleted,
    };
  });
}

/**
 * Add donors to a list
 * @param listId The donor list ID
 * @param donorIds Array of donor IDs to add
 * @param addedBy User ID who is adding the donors
 * @param organizationId The organization ID for authorization
 * @returns Array of created list member records
 */
export async function addDonorsToList(
  listId: number,
  donorIds: number[],
  addedBy: string,
  organizationId: string
): Promise<DonorListMember[]> {
  // First verify the list belongs to the organization
  const list = await getDonorListById(listId, organizationId);
  if (!list) {
    throw new Error('List not found or access denied');
  }

  // Verify all donors belong to the same organization
  const donorCheck = await db
    .select({ id: donors.id })
    .from(donors)
    .where(and(inArray(donors.id, donorIds), eq(donors.organizationId, organizationId)));

  if (donorCheck.length !== donorIds.length) {
    throw new Error('Some donors do not belong to the organization');
  }

  // Get existing memberships to avoid duplicates
  const existingMembers = await db
    .select({ donorId: donorListMembers.donorId })
    .from(donorListMembers)
    .where(and(eq(donorListMembers.listId, listId), inArray(donorListMembers.donorId, donorIds)));

  const existingDonorIds = existingMembers.map((m) => m.donorId);
  const newDonorIds = donorIds.filter((id) => !existingDonorIds.includes(id));

  if (newDonorIds.length === 0) {
    return []; // All donors are already in the list
  }

  // Insert new memberships
  const memberships = newDonorIds.map((donorId) => ({
    listId,
    donorId,
    addedBy,
  }));

  const created = await db.insert(donorListMembers).values(memberships).returning();
  return created;
}

/**
 * Remove donors from a list
 * @param listId The donor list ID
 * @param donorIds Array of donor IDs to remove
 * @param organizationId The organization ID for authorization
 * @returns Number of donors removed
 */
export async function removeDonorsFromList(
  listId: number,
  donorIds: number[],
  organizationId: string
): Promise<number> {
  // First verify the list belongs to the organization
  const list = await getDonorListById(listId, organizationId);
  if (!list) {
    throw new Error('List not found or access denied');
  }

  const result = await db
    .delete(donorListMembers)
    .where(and(eq(donorListMembers.listId, listId), inArray(donorListMembers.donorId, donorIds)));

  return result.rowCount || 0;
}

/**
 * Get list members by list ID
 * @param listId The list ID
 * @returns Array of donor list members
 */
export async function getListMembers(listId: number): Promise<DonorListMember[]> {
  try {
    return await db.query.donorListMembers.findMany({
      where: eq(donorListMembers.listId, listId),
    });
  } catch (error) {
    console.error('Failed to get list members:', error);
    throw new Error('Could not retrieve list members.');
  }
}

/**
 * Get donor IDs for multiple lists (useful for communication flow)
 * @param listIds Array of list IDs
 * @param organizationId The organization ID for authorization
 * @returns Array of unique donor IDs from all lists
 */
export async function getDonorIdsFromLists(
  listIds: number[],
  organizationId: string
): Promise<number[]> {
  if (listIds.length === 0) return [];

  // Verify all lists belong to the organization
  const listCheck = await db
    .select({ id: donorLists.id })
    .from(donorLists)
    .where(and(inArray(donorLists.id, listIds), eq(donorLists.organizationId, organizationId)));

  if (listCheck.length !== listIds.length) {
    throw new Error('Some lists do not belong to the organization');
  }

  // Get all donor IDs from the lists
  const members = await db
    .select({ donorId: donorListMembers.donorId })
    .from(donorListMembers)
    .where(inArray(donorListMembers.listId, listIds));

  // Return unique donor IDs
  const uniqueDonorIds = [...new Set(members.map((m) => m.donorId))];
  return uniqueDonorIds;
}

/**
 * Get lists that contain a specific donor
 * @param donorId The donor ID
 * @param organizationId The organization ID for authorization
 * @returns Array of lists containing the donor
 */
export async function getListsForDonor(
  donorId: number,
  organizationId: string
): Promise<DonorList[]> {
  const lists = await db
    .select({
      id: donorLists.id,
      organizationId: donorLists.organizationId,
      name: donorLists.name,
      description: donorLists.description,
      isActive: donorLists.isActive,
      createdBy: donorLists.createdBy,
      createdAt: donorLists.createdAt,
      updatedAt: donorLists.updatedAt,
    })
    .from(donorLists)
    .innerJoin(donorListMembers, eq(donorLists.id, donorListMembers.listId))
    .where(
      and(
        eq(donorListMembers.donorId, donorId),
        eq(donorLists.organizationId, organizationId),
        eq(donorLists.isActive, true)
      )
    )
    .orderBy(asc(donorLists.name));

  return lists;
}

/**
 * Count the number of lists a donor belongs to
 * @param donorId The donor ID
 * @param organizationId The organization ID for authorization
 * @returns The number of lists the donor belongs to
 */
export async function countListsForDonor(donorId: number, organizationId: string): Promise<number> {
  const [result] = await db
    .select({ count: count() })
    .from(donorListMembers)
    .innerJoin(donorLists, eq(donorLists.id, donorListMembers.listId))
    .where(
      and(
        eq(donorListMembers.donorId, donorId),
        eq(donorLists.organizationId, organizationId),
        eq(donorLists.isActive, true)
      )
    );

  return result?.count || 0;
}

/**
 * Remove a donor from all lists
 * @param donorId The donor ID
 * @param organizationId The organization ID for authorization
 * @returns The number of list memberships removed
 */
export async function removeFromAllLists(donorId: number, organizationId: string): Promise<number> {
  // First verify the donor belongs to the organization
  const [donor] = await db
    .select({ id: donors.id })
    .from(donors)
    .where(and(eq(donors.id, donorId), eq(donors.organizationId, organizationId)))
    .limit(1);

  if (!donor) {
    throw new Error('Donor not found or access denied');
  }

  // Get all list IDs that belong to the organization and contain this donor
  const listMemberships = await db
    .select({ listId: donorListMembers.listId })
    .from(donorListMembers)
    .innerJoin(donorLists, eq(donorLists.id, donorListMembers.listId))
    .where(
      and(eq(donorListMembers.donorId, donorId), eq(donorLists.organizationId, organizationId))
    );

  if (listMemberships.length === 0) {
    return 0;
  }

  // Delete all memberships for this donor in lists belonging to the organization
  const listIds = listMemberships.map((m) => m.listId);
  const result = await db
    .delete(donorListMembers)
    .where(and(eq(donorListMembers.donorId, donorId), inArray(donorListMembers.listId, listIds)));

  return result.rowCount || 0;
}

/**
 * Get donors that belong exclusively to a specific list (not in any other lists)
 * @param listId The list ID
 * @param organizationId The organization ID for authorization
 * @returns Array of donor IDs that are only in this list
 */
export async function getDonorsExclusiveToList(
  listId: number,
  organizationId: string
): Promise<number[]> {
  // First verify the list belongs to the organization
  const list = await getDonorListById(listId, organizationId);
  if (!list) {
    throw new Error('List not found or access denied');
  }

  // Get donors that are in this list but not in any other list
  const exclusiveDonors = await db
    .select({ donorId: donorListMembers.donorId })
    .from(donorListMembers)
    .innerJoin(donors, eq(donorListMembers.donorId, donors.id))
    .where(
      and(
        eq(donorListMembers.listId, listId),
        eq(donors.organizationId, organizationId),
        sql`NOT EXISTS (
          SELECT 1 FROM ${donorListMembers} dlm2
          INNER JOIN ${donorLists} dl2 ON dl2.id = dlm2.list_id
          WHERE dlm2.donor_id = ${donorListMembers.donorId}
          AND dlm2.list_id != ${listId}
          AND dl2.organization_id = ${organizationId}
        )`
      )
    );

  return exclusiveDonors.map((d) => d.donorId);
}

/**
 * Bulk update the assigned staff for all members of a list
 * @param listId The list ID
 * @param staffId The staff ID to assign (null for unassigned)
 * @param organizationId The organization ID for authorization
 * @returns Object with the number of donors updated
 */
export async function bulkUpdateListMembersStaff(
  listId: number,
  staffId: number | null,
  organizationId: string
): Promise<{ updated: number }> {
  // First verify the list belongs to the organization
  const list = await getDonorListById(listId, organizationId);
  if (!list) {
    throw new Error('List not found or access denied');
  }

  // Get all donor IDs in this list
  const listMembers = await db
    .select({ donorId: donorListMembers.donorId })
    .from(donorListMembers)
    .where(eq(donorListMembers.listId, listId));

  if (listMembers.length === 0) {
    return { updated: 0 };
  }

  const donorIds = listMembers.map((m) => m.donorId);

  // Update all donors in the list
  const result = await db
    .update(donors)
    .set({
      assignedToStaffId: staffId,
      updatedAt: new Date(),
    })
    .where(and(inArray(donors.id, donorIds), eq(donors.organizationId, organizationId)));

  return { updated: result.rowCount || 0 };
}
