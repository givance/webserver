import { db } from "../db";
import { donors, staff, organizations } from "../db/schema";
import { eq, sql, like, or, desc, asc, SQL, AnyColumn, and, isNull, count } from "drizzle-orm";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { clerkClient } from "@clerk/nextjs/server";
import type { DonorJourney } from "./organizations";

export type Donor = InferSelectModel<typeof donors>;
export type NewDonor = InferInsertModel<typeof donors>;

export type DonorWithDetails = Donor & {
  stageName?: string;
  stageExplanation?: string;
  possibleActions?: string[];
};

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
    return result[0];
  } catch (error) {
    console.error("Failed to retrieve donor by ID:", error);
    throw new Error("Could not retrieve donor.");
  }
}

/**
 * Retrieves a donor by their email and organization ID.
 * @param email - The email of the donor to retrieve.
 * @param organizationId - The ID of the organization the donor belongs to.
 * @returns The donor object if found, otherwise undefined.
 */
export async function getDonorByEmail(email: string, organizationId: string): Promise<Donor | undefined> {
  try {
    const result = await db
      .select()
      .from(donors)
      .where(and(eq(donors.email, email), eq(donors.organizationId, organizationId)))
      .limit(1);
    return result[0];
  } catch (error) {
    console.error("Failed to retrieve donor by email:", error);
    throw new Error("Could not retrieve donor by email.");
  }
}

/**
 * Creates a new donor.
 * @param donorData - The data for the new donor. `id`, `createdAt`, `updatedAt` are typically auto-generated.
 * @returns The newly created donor object.
 */
export async function createDonor(donorData: Omit<NewDonor, "id" | "createdAt" | "updatedAt">): Promise<Donor> {
  try {
    const result = await db.insert(donors).values(donorData).returning();
    return result[0];
  } catch (error) {
    console.error("Failed to create donor:", error);
    if (error instanceof Error && error.message.includes("duplicate key value violates unique constraint")) {
      throw new Error("Donor with this email already exists in this organization.");
    }
    throw new Error("Could not create donor.");
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
  donorData: Partial<Omit<NewDonor, "id" | "createdAt" | "updatedAt">>,
  organizationId: string
): Promise<Donor | undefined> {
  try {
    const result = await db
      .update(donors)
      .set({ ...donorData, updatedAt: sql`now()` })
      .where(and(eq(donors.id, id), eq(donors.organizationId, organizationId)))
      .returning();
    return result[0];
  } catch (error) {
    console.error("Failed to update donor:", error);
    if (error instanceof Error && error.message.includes("duplicate key value violates unique constraint")) {
      throw new Error("Cannot update to an email that already exists for another donor in this organization.");
    }
    throw new Error("Could not update donor.");
  }
}

/**
 * Deletes a donor by their ID and organization ID.
 * Note: Consider implications for related donations or communications.
 * @param id - The ID of the donor to delete.
 * @param organizationId - The ID of the organization the donor belongs to.
 */
export async function deleteDonor(id: number, organizationId: string): Promise<void> {
  try {
    await db.delete(donors).where(and(eq(donors.id, id), eq(donors.organizationId, organizationId)));
  } catch (error) {
    console.error("Failed to delete donor:", error);
    // Check for foreign key constraints if donations exist for this donor
    throw new Error("Could not delete donor. They may have existing donations or communications.");
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
      throw new Error("Staff member not found in this organization.");
    }

    // Update the donor's assigned staff
    const result = await db
      .update(donors)
      .set({ assignedToStaffId: staffId, updatedAt: sql`now()` })
      .where(and(eq(donors.id, donorId), eq(donors.organizationId, organizationId)))
      .returning();
    return result[0];
  } catch (error) {
    console.error("Failed to assign donor to staff:", error);
    throw new Error("Could not assign donor to staff member.");
  }
}

/**
 * Removes staff assignment from a donor.
 * @param donorId - The ID of the donor to unassign.
 * @param organizationId - The ID of the organization the donor belongs to.
 * @returns The updated donor object.
 */
export async function unassignDonorFromStaff(donorId: number, organizationId: string): Promise<Donor | undefined> {
  try {
    const result = await db
      .update(donors)
      .set({ assignedToStaffId: null, updatedAt: sql`now()` })
      .where(and(eq(donors.id, donorId), eq(donors.organizationId, organizationId)))
      .returning();
    return result[0];
  } catch (error) {
    console.error("Failed to unassign donor from staff:", error);
    throw new Error("Could not unassign donor from staff member.");
  }
}

/**
 * Gets the stage information and possible actions for a donor based on their current stage
 * and the organization's donor journey configuration.
 */
async function getDonorStageInfo(
  donor: Donor,
  organizationId: string
): Promise<Pick<DonorWithDetails, "stageName" | "stageExplanation" | "possibleActions">> {
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
        stageName: "No Journey Defined",
        stageExplanation: "The organization has not defined a donor journey.",
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
          stageName: "No Stages Defined",
          stageExplanation: "No stages have been defined in the donor journey.",
          possibleActions: [],
        };
      }
      return {
        stageName: firstStage.label,
        stageExplanation: firstStage.properties.description,
        possibleActions: [
          ...(firstStage.properties.actions || []),
          ...journey.edges.filter((edge) => edge.source === firstStage.id).map((edge) => edge.label),
        ],
      };
    }

    return {
      stageName: currentStage.label,
      stageExplanation: currentStage.properties.description,
      possibleActions: [
        ...(currentStage.properties.actions || []),
        ...journey.edges.filter((edge) => edge.source === currentStage.id).map((edge) => edge.label),
      ],
    };
  } catch (error) {
    console.error("Failed to get donor stage info:", error);
    return {
      stageName: "Error",
      stageExplanation: "Failed to retrieve stage information.",
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
    assignedToStaffId?: number | null;
    limit?: number;
    offset?: number;
    orderBy?: "firstName" | "lastName" | "email" | "createdAt";
    orderDirection?: "asc" | "desc";
  } = {},
  organizationId: string
): Promise<{ donors: DonorWithDetails[]; totalCount: number }> {
  try {
    const { searchTerm, state, assignedToStaffId, limit = 10, offset = 0, orderBy, orderDirection = "asc" } = options;
    const whereClauses: SQL[] = [eq(donors.organizationId, organizationId)];

    if (searchTerm) {
      const term = `%${searchTerm.toLowerCase()}%`;
      const searchCondition = or(
        like(sql`lower(${donors.firstName})`, term),
        like(sql`lower(${donors.lastName})`, term),
        like(sql`lower(${donors.email})`, term)
      );
      if (searchCondition) {
        whereClauses.push(searchCondition);
      }
    }
    if (state) {
      whereClauses.push(eq(donors.state, state.toUpperCase()));
    }

    if (assignedToStaffId === null) {
      whereClauses.push(isNull(donors.assignedToStaffId));
    } else if (assignedToStaffId !== undefined) {
      whereClauses.push(eq(donors.assignedToStaffId, assignedToStaffId));
    }

    let queryBuilder = db
      .select()
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
        const directionFn = orderDirection === "asc" ? asc : desc;
        // @ts-ignore Drizzle's orderBy type can be tricky with dynamic columns
        queryBuilder = queryBuilder.orderBy(directionFn(selectedColumn));
      }
    }

    const results = await queryBuilder.limit(limit).offset(offset);

    const totalCountResult = await db
      .select({ count: count() })
      .from(donors)
      .where(and(...whereClauses));

    // Get stage info for each donor
    const donorsWithStageInfo = await Promise.all(
      results.map(async (donor) => {
        const stageInfo = await getDonorStageInfo(donor, organizationId);
        return {
          ...donor,
          ...stageInfo,
        };
      })
    );

    return {
      donors: donorsWithStageInfo,
      totalCount: totalCountResult[0]?.count || 0,
    };
  } catch (error) {
    console.error("Failed to list donors:", error);
    throw new Error("Could not list donors.");
  }
}
