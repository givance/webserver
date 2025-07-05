import { db } from "../db";
import { staff, gmailOAuthTokens, staffEmailExamples } from "../db/schema";
import { eq, sql, like, or, asc, desc, SQL, and, count, inArray } from "drizzle-orm";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

export type Staff = InferSelectModel<typeof staff>;
export type NewStaff = InferInsertModel<typeof staff>;
export type StaffEmailExample = InferSelectModel<typeof staffEmailExamples>;
export type NewStaffEmailExample = InferInsertModel<typeof staffEmailExamples>;

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
 * Retrieves a staff member with their Gmail token by ID and organization ID.
 * @param id - The ID of the staff member to retrieve.
 * @param organizationId - The ID of the organization the staff member belongs to.
 * @returns The staff member object with Gmail token if found, otherwise undefined.
 */
export async function getStaffWithGmailById(id: number, organizationId: string) {
  try {
    const result = await db.query.staff.findFirst({
      where: and(eq(staff.id, id), eq(staff.organizationId, organizationId)),
      with: {
        gmailToken: {
          columns: {
            id: true,
            email: true,
          },
        },
      },
    });
    return result;
  } catch (error) {
    console.error("Failed to retrieve staff member with Gmail by ID:", error);
    throw new Error("Could not retrieve staff member with Gmail.");
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
 * Retrieves multiple staff members by their IDs.
 * @param ids - Array of staff member IDs to retrieve.
 * @param organizationId - The ID of the organization the staff members belong to.
 * @returns Array of staff member objects.
 */
export async function getStaffByIds(ids: number[], organizationId: string): Promise<Staff[]> {
  try {
    if (ids.length === 0) {
      return [];
    }

    const result = await db
      .select()
      .from(staff)
      .where(and(inArray(staff.id, ids), eq(staff.organizationId, organizationId)));
    return result;
  } catch (error) {
    console.error("Failed to retrieve staff members by IDs:", error);
    throw new Error("Could not retrieve staff members by IDs.");
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
    const { searchTerm, isRealPerson, limit = 10, offset = 0, orderBy = "firstName", orderDirection = "asc" } = options;

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

    // Build order by for relational query
    let orderByClause;
    if (orderBy) {
      const direction = orderDirection === "asc" ? asc : desc;

      if (orderBy === "firstName") {
        // For firstName, also order by lastName and then email for consistent sorting
        orderByClause = [direction(staff.firstName), direction(staff.lastName), direction(staff.email)];
      } else {
        const column = staff[orderBy];
        if (column) {
          orderByClause = direction(column);
        }
      }
    }

    // Query for the paginated data with gmailToken relation
    const staffDataQuery = db.query.staff.findMany({
      where: and(...conditions),
      with: {
        gmailToken: {
          columns: {
            id: true,
            email: true,
          },
        },
      },
      limit,
      offset,
      orderBy: orderByClause,
    });

    const [totalResult, staffData] = await Promise.all([countQuery, staffDataQuery]);

    const totalCount = totalResult[0]?.value || 0;

    return { staff: staffData, totalCount };
  } catch (error) {
    console.error("Failed to list staff:", error);
    throw new Error("Could not list staff.");
  }
}

/**
 * Updates a staff member's signature.
 * @param id - The ID of the staff member to update.
 * @param signature - The new signature content.
 * @param organizationId - The ID of the organization the staff member belongs to.
 * @returns The updated staff member object.
 */
export async function updateStaffSignature(
  id: number,
  signature: string | null,
  organizationId: string
): Promise<Staff | undefined> {
  try {
    const result = await db
      .update(staff)
      .set({ signature, updatedAt: sql`now()` })
      .where(and(eq(staff.id, id), eq(staff.organizationId, organizationId)))
      .returning();
    return result[0];
  } catch (error) {
    console.error("Failed to update staff signature:", error);
    throw new Error("Could not update staff member signature.");
  }
}

/**
 * Sets a staff member as primary for their organization.
 * This will automatically unset any other staff member as primary in the same organization.
 * @param id - The ID of the staff member to set as primary.
 * @param organizationId - The ID of the organization.
 * @returns The updated staff member object.
 */
export async function setPrimaryStaff(id: number, organizationId: string): Promise<Staff | undefined> {
  try {
    // Use a transaction to ensure atomicity
    return await db.transaction(async (tx) => {
      // First, unset all other staff members as primary in this organization
      await tx
        .update(staff)
        .set({ isPrimary: false, updatedAt: sql`now()` })
        .where(and(eq(staff.organizationId, organizationId), eq(staff.isPrimary, true)));

      // Then set the specified staff member as primary
      const result = await tx
        .update(staff)
        .set({ isPrimary: true, updatedAt: sql`now()` })
        .where(and(eq(staff.id, id), eq(staff.organizationId, organizationId)))
        .returning();

      return result[0];
    });
  } catch (error) {
    console.error("Failed to set primary staff:", error);
    throw new Error("Could not set primary staff member.");
  }
}

/**
 * Unsets a staff member as primary for their organization.
 * @param id - The ID of the staff member to unset as primary.
 * @param organizationId - The ID of the organization.
 * @returns The updated staff member object.
 */
export async function unsetPrimaryStaff(id: number, organizationId: string): Promise<Staff | undefined> {
  try {
    const result = await db
      .update(staff)
      .set({ isPrimary: false, updatedAt: sql`now()` })
      .where(and(eq(staff.id, id), eq(staff.organizationId, organizationId)))
      .returning();
    return result[0];
  } catch (error) {
    console.error("Failed to unset primary staff:", error);
    throw new Error("Could not unset primary staff member.");
  }
}

/**
 * Gets the primary staff member for an organization.
 * @param organizationId - The ID of the organization.
 * @returns The primary staff member object if found, otherwise undefined.
 */
export async function getPrimaryStaff(organizationId: string): Promise<Staff | undefined> {
  try {
    const result = await db
      .select()
      .from(staff)
      .where(and(eq(staff.organizationId, organizationId), eq(staff.isPrimary, true)))
      .limit(1);
    return result[0];
  } catch (error) {
    console.error("Failed to get primary staff:", error);
    throw new Error("Could not get primary staff member.");
  }
}

// Note: Staff Gmail account management is now handled through the staffGmailRouter
// Individual staff members authenticate their own Gmail accounts via OAuth

/**
 * Creates a new email example for a staff member.
 * @param emailExampleData - Data for the new email example.
 * @returns The newly created email example object.
 */
export async function createEmailExample(
  emailExampleData: Omit<NewStaffEmailExample, "id" | "createdAt" | "updatedAt">
): Promise<StaffEmailExample> {
  try {
    const result = await db.insert(staffEmailExamples).values(emailExampleData).returning();
    return result[0];
  } catch (error) {
    console.error("Failed to create email example:", error);
    throw new Error("Could not create email example.");
  }
}

/**
 * Retrieves all email examples for a staff member.
 * @param staffId - The ID of the staff member.
 * @param organizationId - The ID of the organization.
 * @returns An array of email example objects.
 */
export async function getEmailExamplesByStaffId(
  staffId: number,
  organizationId: string
): Promise<StaffEmailExample[]> {
  try {
    const result = await db
      .select()
      .from(staffEmailExamples)
      .where(and(eq(staffEmailExamples.staffId, staffId), eq(staffEmailExamples.organizationId, organizationId)))
      .orderBy(desc(staffEmailExamples.createdAt));
    return result;
  } catch (error) {
    console.error("Failed to retrieve email examples:", error);
    throw new Error("Could not retrieve email examples.");
  }
}

/**
 * Retrieves a single email example by ID.
 * @param id - The ID of the email example.
 * @param organizationId - The ID of the organization.
 * @returns The email example object if found, otherwise undefined.
 */
export async function getEmailExampleById(
  id: number,
  organizationId: string
): Promise<StaffEmailExample | undefined> {
  try {
    const result = await db
      .select()
      .from(staffEmailExamples)
      .where(and(eq(staffEmailExamples.id, id), eq(staffEmailExamples.organizationId, organizationId)))
      .limit(1);
    return result[0];
  } catch (error) {
    console.error("Failed to retrieve email example by ID:", error);
    throw new Error("Could not retrieve email example.");
  }
}

/**
 * Updates an existing email example.
 * @param id - The ID of the email example to update.
 * @param emailExampleData - Data to update for the email example.
 * @param organizationId - The ID of the organization.
 * @returns The updated email example object.
 */
export async function updateEmailExample(
  id: number,
  emailExampleData: Partial<Omit<NewStaffEmailExample, "id" | "staffId" | "organizationId" | "createdAt" | "updatedAt">>,
  organizationId: string
): Promise<StaffEmailExample | undefined> {
  try {
    const result = await db
      .update(staffEmailExamples)
      .set({ ...emailExampleData, updatedAt: sql`now()` })
      .where(and(eq(staffEmailExamples.id, id), eq(staffEmailExamples.organizationId, organizationId)))
      .returning();
    return result[0];
  } catch (error) {
    console.error("Failed to update email example:", error);
    throw new Error("Could not update email example.");
  }
}

/**
 * Deletes an email example by ID.
 * @param id - The ID of the email example to delete.
 * @param organizationId - The ID of the organization.
 */
export async function deleteEmailExample(id: number, organizationId: string): Promise<void> {
  try {
    await db
      .delete(staffEmailExamples)
      .where(and(eq(staffEmailExamples.id, id), eq(staffEmailExamples.organizationId, organizationId)));
  } catch (error) {
    console.error("Failed to delete email example:", error);
    throw new Error("Could not delete email example.");
  }
}

/**
 * Counts the number of email examples for a staff member.
 * @param staffId - The ID of the staff member.
 * @param organizationId - The ID of the organization.
 * @returns The count of email examples.
 */
export async function countEmailExamplesByStaffId(
  staffId: number,
  organizationId: string
): Promise<number> {
  try {
    const result = await db
      .select({ value: count() })
      .from(staffEmailExamples)
      .where(and(eq(staffEmailExamples.staffId, staffId), eq(staffEmailExamples.organizationId, organizationId)));
    return result[0]?.value || 0;
  } catch (error) {
    console.error("Failed to count email examples:", error);
    throw new Error("Could not count email examples.");
  }
}
