import { db } from "../db";
import { staff } from "../db/schema";
import { eq, sql, like, or, asc, desc, SQL } from "drizzle-orm";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

export type Staff = InferSelectModel<typeof staff>;
export type NewStaff = InferInsertModel<typeof staff>;

/**
 * Retrieves a staff member by their ID.
 * @param id - The ID of the staff member to retrieve.
 * @returns The staff member object if found, otherwise undefined.
 */
export async function getStaffById(id: number): Promise<Staff | undefined> {
  try {
    const result = await db.select().from(staff).where(eq(staff.id, id)).limit(1);
    return result[0];
  } catch (error) {
    console.error("Failed to retrieve staff member by ID:", error);
    throw new Error("Could not retrieve staff member.");
  }
}

/**
 * Retrieves a staff member by their email.
 * @param email - The email of the staff member to retrieve.
 * @returns The staff member object if found, otherwise undefined.
 */
export async function getStaffByEmail(email: string): Promise<Staff | undefined> {
  try {
    const result = await db.select().from(staff).where(eq(staff.email, email)).limit(1);
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
      throw new Error("Staff member with this email already exists.");
    }
    throw new Error("Could not create staff member.");
  }
}

/**
 * Updates an existing staff member.
 * @param id - The ID of the staff member to update.
 * @param staffData - Data to update for the staff member.
 * @returns The updated staff member object.
 */
export async function updateStaff(
  id: number,
  staffData: Partial<Omit<NewStaff, "id" | "createdAt" | "updatedAt">>
): Promise<Staff | undefined> {
  try {
    const result = await db
      .update(staff)
      .set({ ...staffData, updatedAt: sql`now()` })
      .where(eq(staff.id, id))
      .returning();
    return result[0];
  } catch (error) {
    console.error("Failed to update staff member:", error);
    if (error instanceof Error && error.message.includes("duplicate key value violates unique constraint")) {
      throw new Error("Cannot update to an email that already exists for another staff member.");
    }
    throw new Error("Could not update staff member.");
  }
}

/**
 * Deletes a staff member by their ID.
 * @param id - The ID of the staff member to delete.
 */
export async function deleteStaff(id: number): Promise<void> {
  try {
    await db.delete(staff).where(eq(staff.id, id));
  } catch (error) {
    console.error("Failed to delete staff member:", error);
    // Consider implications if staff are linked to communication threads, etc.
    throw new Error("Could not delete staff member. They may be linked to other records.");
  }
}

/**
 * Lists staff members with optional filtering and sorting.
 * @param options - Options for filtering by real person status, searching, pagination, and sorting.
 * @returns An array of staff member objects.
 */
export async function listStaff(
  options: {
    searchTerm?: string; // Search by name or email
    isRealPerson?: boolean;
    limit?: number;
    offset?: number;
    orderBy?: keyof Pick<Staff, "firstName" | "lastName" | "email" | "createdAt">;
    orderDirection?: "asc" | "desc";
  } = {}
): Promise<Staff[]> {
  try {
    const { searchTerm, isRealPerson, limit = 10, offset = 0, orderBy, orderDirection = "asc" } = options;

    let whereConditions: SQL | undefined;

    // Build search conditions
    if (searchTerm) {
      const term = `%${searchTerm.toLowerCase()}%`;
      whereConditions = or(
        like(sql`lower(${staff.firstName})`, term),
        like(sql`lower(${staff.lastName})`, term),
        like(sql`lower(${staff.email})`, term)
      );
    }

    // Add isRealPerson filter
    if (isRealPerson !== undefined) {
      const isRealPersonCondition = eq(staff.isRealPerson, isRealPerson);
      whereConditions = whereConditions ? sql`${whereConditions} and ${isRealPersonCondition}` : isRealPersonCondition;
    }

    // Build order by clause
    let orderByClause;
    if (orderBy) {
      const column = staff[orderBy];
      orderByClause = orderDirection === "asc" ? asc(column) : desc(column);
    }

    // Execute query
    return await db.query.staff.findMany({
      where: whereConditions,
      limit,
      offset,
      orderBy: orderByClause,
    });
  } catch (error) {
    console.error("Failed to list staff:", error);
    throw new Error("Could not list staff.");
  }
}
