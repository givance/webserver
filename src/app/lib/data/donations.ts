import { db } from "../db";
import { donations, donors, projects } from "../db/schema";
import { eq, sql, and, SQL, count, desc, asc, or } from "drizzle-orm";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type { Donor } from "./donors";
import type { Project } from "./projects";

export type Donation = InferSelectModel<typeof donations>;
export type NewDonation = InferInsertModel<typeof donations>;

// For results that include related donor and project information
export type DonationWithDetails = Donation & {
  donor?: Omit<Donor, "donations" | "communicationThreads" | "sentMessages" | "receivedMessages">; // Avoid circular types if Donor includes donations
  project?: Omit<Project, "donations">; // Avoid circular types if Project includes donations
};

/**
 * Retrieves a donation by its ID.
 * @param id - The ID of the donation to retrieve.
 * @param options - Options to include related data like donor and project.
 * @returns The donation object if found, otherwise undefined.
 */
export async function getDonationById(
  id: number,
  options?: { includeDonor?: boolean; includeProject?: boolean }
): Promise<DonationWithDetails | undefined> {
  try {
    const query = db.query.donations.findFirst({
      where: eq(donations.id, id),
      with: {
        donor: options?.includeDonor ? true : undefined,
        project: options?.includeProject ? true : undefined,
      },
    });
    return (await query) as DonationWithDetails | undefined;
  } catch (error) {
    console.error("Failed to retrieve donation by ID:", error);
    throw new Error("Could not retrieve donation.");
  }
}

/**
 * Creates a new donation.
 * Amount should be in cents.
 * @param donationData - The data for the new donation.
 * @returns The newly created donation object.
 */
export async function createDonation(
  donationData: Omit<NewDonation, "id" | "createdAt" | "updatedAt" | "date">
): Promise<Donation> {
  try {
    // date is set to defaultNow() in schema, createdAt and updatedAt also
    const result = await db.insert(donations).values(donationData).returning();
    return result[0];
  } catch (error) {
    console.error("Failed to create donation:", error);
    // Handle potential foreign key constraint violations for donorId or projectId
    throw new Error("Could not create donation. Ensure donor and project exist.");
  }
}

/**
 * Updates an existing donation.
 * @param id - The ID of the donation to update.
 * @param donationData - The data to update for the donation.
 * @returns The updated donation object.
 */
export async function updateDonation(
  id: number,
  donationData: Partial<Omit<NewDonation, "id" | "createdAt" | "updatedAt">>
): Promise<Donation | undefined> {
  try {
    const result = await db
      .update(donations)
      .set({ ...donationData, updatedAt: sql`now()` })
      .where(eq(donations.id, id))
      .returning();
    return result[0];
  } catch (error) {
    console.error("Failed to update donation:", error);
    throw new Error("Could not update donation.");
  }
}

/**
 * Deletes a donation by its ID.
 * @param id - The ID of the donation to delete.
 */
export async function deleteDonation(id: number): Promise<void> {
  try {
    await db.delete(donations).where(eq(donations.id, id));
  } catch (error) {
    console.error("Failed to delete donation:", error);
    throw new Error("Could not delete donation.");
  }
}

/**
 * Lists donations with optional filtering and sorting.
 * @param options - Options for filtering by donor, project, date range, and pagination/sorting.
 * @param organizationId - Optional: The ID of the organization to filter donations by.
 * @returns An object containing the paginated donations array and total count.
 */
export async function listDonations(
  options: {
    donorId?: number;
    projectId?: number;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
    orderBy?: keyof Pick<Donation, "date" | "amount" | "createdAt">;
    orderDirection?: "asc" | "desc";
    includeDonor?: boolean;
    includeProject?: boolean;
  } = {},
  organizationId?: string
): Promise<{ donations: DonationWithDetails[]; totalCount: number }> {
  try {
    const {
      donorId,
      projectId,
      startDate,
      endDate,
      limit = 10,
      offset = 0,
      orderBy,
      orderDirection = "asc",
      includeDonor,
      includeProject,
    } = options;

    const conditions: SQL[] = [];
    if (donorId !== undefined) {
      conditions.push(eq(donations.donorId, donorId));
    }
    if (projectId !== undefined) {
      conditions.push(eq(donations.projectId, projectId));
    }
    if (startDate) {
      conditions.push(sql`${donations.date} >= ${startDate}`);
    }
    if (endDate) {
      conditions.push(sql`${donations.date} <= ${endDate}`);
    }

    if (organizationId) {
      conditions.push(or(eq(donors.organizationId, organizationId), eq(projects.organizationId, organizationId))!);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    let countQuery;
    if (organizationId) {
      countQuery = db
        .select({ value: count() })
        .from(donations)
        .leftJoin(donors, eq(donations.donorId, donors.id))
        .leftJoin(projects, eq(donations.projectId, projects.id));
    } else {
      countQuery = db.select({ value: count() }).from(donations);
    }
    const countResult = await countQuery.where(whereClause);
    const totalCount = countResult[0]?.value || 0;

    const donationsData = await db.query.donations.findMany({
      where: whereClause,
      with: {
        donor: includeDonor ? true : undefined,
        project: includeProject ? true : undefined,
      },
      limit: limit,
      offset: offset,
      orderBy: orderBy
        ? (table, { asc, desc }) => {
            const columnMap = {
              date: table.date,
              amount: table.amount,
              createdAt: table.createdAt,
            };
            const selectedColumn = columnMap[orderBy as keyof typeof columnMap];
            if (selectedColumn) {
              return orderDirection === "asc" ? asc(selectedColumn) : desc(selectedColumn);
            }
            return [];
          }
        : undefined,
    });

    return {
      donations: donationsData as DonationWithDetails[],
      totalCount,
    };
  } catch (error) {
    console.error("Failed to list donations:", error);
    throw new Error("Could not list donations.");
  }
}

/**
 * Gets donation statistics for multiple donors
 * @param donorIds - Array of donor IDs
 * @param organizationId - The organization ID to filter by
 * @returns Object mapping donor IDs to their donation stats
 */
export async function getMultipleDonorDonationStats(
  donorIds: number[],
  organizationId: string
): Promise<{ [donorId: number]: { totalDonated: number; lastDonationDate: Date | null } }> {
  try {
    if (donorIds.length === 0) {
      return {};
    }

    // Get total amounts for all donors
    const totalResults = await db
      .select({
        donorId: donations.donorId,
        total: sql<number>`sum(${donations.amount})`,
      })
      .from(donations)
      .innerJoin(donors, eq(donations.donorId, donors.id))
      .where(
        and(
          sql`${donations.donorId} = ANY(ARRAY[${sql.raw(donorIds.join(","))}]::integer[])`,
          eq(donors.organizationId, organizationId)
        )
      )
      .groupBy(donations.donorId);

    // Get most recent donation dates for all donors
    const lastDonationResults = await db
      .select({
        donorId: donations.donorId,
        lastDate: sql<Date>`max(${donations.date})`,
      })
      .from(donations)
      .innerJoin(donors, eq(donations.donorId, donors.id))
      .where(
        and(
          sql`${donations.donorId} = ANY(ARRAY[${sql.raw(donorIds.join(","))}]::integer[])`,
          eq(donors.organizationId, organizationId)
        )
      )
      .groupBy(donations.donorId);

    // Combine the results
    const stats: { [donorId: number]: { totalDonated: number; lastDonationDate: Date | null } } = {};

    // Initialize stats for all requested donors
    donorIds.forEach((id) => {
      stats[id] = { totalDonated: 0, lastDonationDate: null };
    });

    // Add total amounts
    totalResults.forEach((result) => {
      if (stats[result.donorId]) {
        stats[result.donorId].totalDonated = result.total || 0;
      }
    });

    // Add last donation dates
    lastDonationResults.forEach((result) => {
      if (stats[result.donorId]) {
        stats[result.donorId].lastDonationDate = result.lastDate;
      }
    });

    return stats;
  } catch (error) {
    console.error("Failed to get multiple donor donation stats:", error);
    throw new Error("Could not retrieve donor donation statistics.");
  }
}

/**
 * Gets donation statistics for a donor
 * @param donorId - The ID of the donor
 * @param organizationId - The organization ID to filter by
 * @returns Object containing total amount donated and date of last donation
 */
export async function getDonorDonationStats(
  donorId: number,
  organizationId: string
): Promise<{ totalDonated: number; lastDonationDate: Date | null }> {
  try {
    // Get total amount donated
    const totalResult = await db
      .select({
        total: sql<number>`sum(${donations.amount})`,
      })
      .from(donations)
      .innerJoin(donors, eq(donations.donorId, donors.id))
      .where(and(eq(donations.donorId, donorId), eq(donors.organizationId, organizationId)));

    // Get most recent donation date
    const lastDonationResult = await db
      .select({
        lastDate: sql<Date>`max(${donations.date})`,
      })
      .from(donations)
      .innerJoin(donors, eq(donations.donorId, donors.id))
      .where(and(eq(donations.donorId, donorId), eq(donors.organizationId, organizationId)));

    return {
      totalDonated: totalResult[0]?.total || 0,
      lastDonationDate: lastDonationResult[0]?.lastDate || null,
    };
  } catch (error) {
    console.error("Failed to get donor donation stats:", error);
    throw new Error("Could not retrieve donor donation statistics.");
  }
}
