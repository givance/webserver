import { db } from "../db";
import { donors } from "../db/schema";
import { eq, sql, like, or, desc, asc, SQL, AnyColumn, and } from "drizzle-orm";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

export type Donor = InferSelectModel<typeof donors>;
export type NewDonor = InferInsertModel<typeof donors>;

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
 * Lists donors with optional search, filtering, and sorting.
 * @param options - Options for searching, filtering, pagination, and sorting.
 * @param organizationId - The ID of the organization to filter donors by.
 * @returns An array of donor objects.
 */
export async function listDonors(
  options: {
    searchTerm?: string; // Search by name or email
    state?: string;
    limit?: number;
    offset?: number;
    orderBy?: keyof Pick<Donor, "firstName" | "lastName" | "email" | "createdAt">;
    orderDirection?: "asc" | "desc";
  } = {},
  organizationId: string
): Promise<Donor[]> {
  try {
    const { searchTerm, state, limit = 10, offset = 0, orderBy, orderDirection = "asc" } = options;

    // Base query
    let query = db.select().from(donors);

    const conditions: SQL[] = [eq(donors.organizationId, organizationId)];

    if (searchTerm) {
      const term = `%${searchTerm.toLowerCase()}%`;
      const searchCondition = or(
        like(sql`lower(${donors.firstName})`, term),
        like(sql`lower(${donors.lastName})`, term),
        like(sql`lower(${donors.email})`, term)
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }
    if (state) {
      conditions.push(eq(donors.state, state.toUpperCase()));
    }

    // Apply WHERE conditions
    query = query.where(and(...conditions)) as typeof query;

    // Apply ORDER BY if specified
    if (orderBy) {
      const columnMap: { [key in typeof orderBy]: AnyColumn } = {
        firstName: donors.firstName,
        lastName: donors.lastName,
        email: donors.email,
        createdAt: donors.createdAt,
      };
      const selectedColumn = columnMap[orderBy];
      if (selectedColumn) {
        const directionFunction = orderDirection === "asc" ? asc : desc;
        query = query.orderBy(directionFunction(selectedColumn)) as typeof query;
      }
    }

    // Apply LIMIT and OFFSET and execute
    return await query.limit(limit).offset(offset);
  } catch (error) {
    console.error("Failed to list donors:", error);
    throw new Error("Could not list donors.");
  }
}
