import { db } from "../db";
import { staff } from "../db/schema";
import { eq, sql, like, or, asc, desc, SQL, and, count } from "drizzle-orm";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

export type Staff = InferSelectModel<typeof staff>;
export type NewStaff = InferInsertModel<typeof staff>;

/**
 * Retrieves a staff member by their ID and organization ID.
 * @param id - The ID of the staff member to retrieve.
 * @param organizationId - The ID of the organization the staff member belongs to.
 * @returns The staff member object if found, otherwise undefined.
 */
export async function getStaffById(id: number, organizationId: string): Promise<Staff | undefined> {
  try {
    const result = await db
      .select()
      .from(staff)
      .where(and(eq(staff.id, id), eq(staff.organizationId, organizationId)))
      .limit(1);
    return result[0];
  } catch (error) {
    console.error("Failed to retrieve staff member by ID:", error);
    throw new Error("Could not retrieve staff member.");
  }
}

/**
 * Retrieves a staff member by their email and organization ID.
 * @param email - The email of the staff member to retrieve.
 * @param organizationId - The ID of the organization the staff member belongs to.
 * @returns The staff member object if found, otherwise undefined.
 */
export async function getStaffByEmail(email: string, organizationId: string): Promise<Staff | undefined> {
  try {
    const result = await db
      .select()
      .from(staff)
      .where(and(eq(staff.email, email), eq(staff.organizationId, organizationId)))
      .limit(1);
    return result[0];
  } catch (error) {
    console.error("Failed to retrieve staff member by email:", error);
    throw new Error("Could not retrieve staff member by email.");
  }
}

/**
 * Creates a new staff member.
 * @param staffData - Data for the new staff member. Excludes auto-generated fields.
 * @returns The newly created staff member object.
 */
export async function createStaff(staffData: Omit<NewStaff, "id" | "createdAt" | "updatedAt">): Promise<Staff> {
  try {
    const result = await db.insert(staff).values(staffData).returning();
    return result[0];
  } catch (error) {
    console.error("Failed to create staff member:", error);
    if (error instanceof Error && error.message.includes("duplicate key value violates unique constraint")) {
      throw new Error("Staff member with this email already exists in this organization.");
    }
    throw new Error("Could not create staff member.");
  }
}

/**
 * Updates an existing staff member.
 * @param id - The ID of the staff member to update.
 * @param staffData - Data to update for the staff member.
 * @param organizationId - The ID of the organization the staff member belongs to.
 * @returns The updated staff member object.
 */
export async function updateStaff(
  id: number,
  staffData: Partial<Omit<NewStaff, "id" | "createdAt" | "updatedAt">>,
  organizationId: string
): Promise<Staff | undefined> {
  try {
    const result = await db
      .update(staff)
      .set({ ...staffData, updatedAt: sql`now()` })
      .where(and(eq(staff.id, id), eq(staff.organizationId, organizationId)))
      .returning();
    return result[0];
  } catch (error) {
    console.error("Failed to update staff member:", error);
    if (error instanceof Error && error.message.includes("duplicate key value violates unique constraint")) {
      throw new Error("Cannot update to an email that already exists for another staff member in this organization.");
    }
    throw new Error("Could not update staff member.");
  }
}

/**
 * Deletes a staff member by their ID and organization ID.
 * @param id - The ID of the staff member to delete.
 * @param organizationId - The ID of the organization the staff member belongs to.
 */
export async function deleteStaff(id: number, organizationId: string): Promise<void> {
  try {
    await db.delete(staff).where(and(eq(staff.id, id), eq(staff.organizationId, organizationId)));
  } catch (error) {
    console.error("Failed to delete staff member:", error);
    // Consider implications if staff are linked to communication threads, etc.
    throw new Error("Could not delete staff member. They may be linked to other records.");
  }
}

/**
 * Lists staff members with optional filtering and sorting.
 * @param options - Options for filtering by real person status, searching, pagination, and sorting.
 * @param organizationId - The ID of the organization to filter staff by.
 * @returns An object containing an array of staff member objects and the total count.
 */
export async function listStaff(
  options: {
    searchTerm?: string; // Search by name or email
    isRealPerson?: boolean;
    limit?: number;
    offset?: number;
    orderBy?: keyof Pick<Staff, "firstName" | "lastName" | "email" | "createdAt">;
    orderDirection?: "asc" | "desc";
  } = {},
  organizationId: string
): Promise<{ staff: Staff[]; totalCount: number }> {
  try {
    const { searchTerm, isRealPerson, limit = 10, offset = 0, orderBy, orderDirection = "asc" } = options;

    const conditions: SQL[] = [eq(staff.organizationId, organizationId)];

    // Add search conditions
    if (searchTerm) {
      const term = `%${searchTerm.toLowerCase()}%`;
      const searchCondition = or(
        like(sql`lower(${staff.firstName})`, term),
        like(sql`lower(${staff.lastName})`, term),
        like(sql`lower(${staff.email})`, term)
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    // Add isRealPerson filter
    if (isRealPerson !== undefined) {
      conditions.push(eq(staff.isRealPerson, isRealPerson));
    }

    // Query for the total count
    const countQuery = db
      .select({ value: count() })
      .from(staff)
      .where(and(...conditions));

    // Query for the paginated data
    let dataQueryBuilder = db
      .select()
      .from(staff)
      .where(and(...conditions));

    // Build order by clause
    if (orderBy) {
      const column = staff[orderBy];
      if (column) {
        const direction = orderDirection === "asc" ? asc : desc;
        dataQueryBuilder = dataQueryBuilder.orderBy(direction(column)) as typeof dataQueryBuilder;
      }
    }

    const [totalResult, staffData] = await Promise.all([countQuery, dataQueryBuilder.limit(limit).offset(offset)]);

    const totalCount = totalResult[0]?.value || 0;

    return { staff: staffData, totalCount };
  } catch (error) {
    console.error("Failed to list staff:", error);
    throw new Error("Could not list staff.");
  }
}
