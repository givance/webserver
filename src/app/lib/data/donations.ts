import { db } from "../db";
import { donations } from "../db/schema";
import { eq, sql, and, SQL } from "drizzle-orm";
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
 * @returns An array of donation objects, optionally with donor and project details.
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
  } = {}
): Promise<DonationWithDetails[]> {
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

    const query = db.query.donations.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      with: {
        donor: includeDonor ? true : undefined,
        project: includeProject ? true : undefined,
      },
      limit: limit,
      offset: offset,
      orderBy: orderBy
        ? (dbDonations, { asc, desc }) => {
            const columnMap = {
              date: dbDonations.date,
              amount: dbDonations.amount,
              createdAt: dbDonations.createdAt,
            };
            const selectedColumn = columnMap[orderBy as keyof typeof columnMap];
            if (selectedColumn) {
              return orderDirection === "asc" ? asc(selectedColumn) : desc(selectedColumn);
            }
            return []; // Default or no specific order
          }
        : undefined,
    });

    return (await query) as DonationWithDetails[];
  } catch (error) {
    console.error("Failed to list donations:", error);
    throw new Error("Could not list donations.");
  }
}
