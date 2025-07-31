import { db } from '../db';
import { donations, donors, projects } from '../db/schema';
import { eq, sql, and, SQL, count, desc, asc, or, getTableColumns } from 'drizzle-orm';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type { Donor } from './donors';
import type { Project } from './projects';
import type { PgSelect } from 'drizzle-orm/pg-core';
import { validateNotNullish, ERROR_MESSAGES } from '../../api/trpc/trpc';
import { crmSyncService } from '../services/crm-sync.service';

export type Donation = InferSelectModel<typeof donations>;
export type NewDonation = InferInsertModel<typeof donations>;

// For results that include related donor and project information
export type DonationWithDetails = Donation & {
  donor?: Omit<Donor, 'donations' | 'communicationThreads' | 'sentMessages' | 'receivedMessages'>; // Avoid circular types if Donor includes donations
  project?: Omit<Project, 'donations'>; // Avoid circular types if Project includes donations
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
    console.error('Failed to retrieve donation by ID:', error);
    throw new Error('Could not retrieve donation.');
  }
}

/**
 * Creates a new donation.
 * Amount should be in cents.
 * @param donationData - The data for the new donation.
 * @returns The newly created donation object.
 */
export async function createDonation(
  donationData: Omit<NewDonation, 'id' | 'createdAt' | 'updatedAt' | 'date'>
): Promise<Donation> {
  try {
    console.log(
      `[createDonation] Starting donation creation: donorId=${donationData.donorId}, amount=${donationData.amount}`
    );

    // If donation doesn't have external ID, sync to CRM first
    const finalDonationData = { ...donationData } as NewDonation;

    if (!finalDonationData.externalId) {
      // Get donor and project details to extract organization and external IDs
      const donor = await db.query.donors.findFirst({
        where: eq(donors.id, finalDonationData.donorId),
      });

      const project = finalDonationData.projectId
        ? await db.query.projects.findFirst({
            where: eq(projects.id, finalDonationData.projectId),
          })
        : null;

      if (donor && donor.externalId && donor.organizationId) {
        console.log(
          `[createDonation] Syncing new donation to CRM: donorExternalId=${donor.externalId}`
        );

        const externalId = await crmSyncService.syncDonation(donor.organizationId, {
          donorExternalId: donor.externalId,
          projectExternalId: project?.externalId || null,
          amount: Number(finalDonationData.amount),
          currency: finalDonationData.currency || 'USD',
          date: finalDonationData.date || new Date(),
        });

        if (externalId) {
          console.log(`[createDonation] CRM sync successful, externalId=${externalId}`);
          finalDonationData.externalId = externalId;
        } else {
          console.log(`[createDonation] CRM sync returned no external ID`);
        }
      } else {
        console.log(`[createDonation] Skipping CRM sync: donor not synced to CRM`);
      }
    }

    console.log(
      `[createDonation] Inserting donation into database: donorId=${finalDonationData.donorId}`
    );
    // date is set to defaultNow() in schema, createdAt and updatedAt also
    const result = await db.insert(donations).values(finalDonationData).returning();

    console.log(
      `[createDonation] Database insert successful: id=${result[0].id}, externalId=${result[0].externalId || 'none'}`
    );
    return result[0];
  } catch (error) {
    console.error('Failed to create donation:', error);
    // Handle potential foreign key constraint violations for donorId or projectId
    throw new Error('Could not create donation. Ensure donor and project exist.');
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
  donationData: Partial<Omit<NewDonation, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<Donation | undefined> {
  try {
    // Always sync to CRM for updates
    const existingDonation = await getDonationById(id, {
      includeDonor: true,
      includeProject: true,
    });

    if (!existingDonation) {
      console.log(`[updateDonation] Donation not found: id=${id}`);
      return undefined;
    }

    console.log(
      `[updateDonation] Starting update for donation: id=${id}, hasExternalId=${!!existingDonation.externalId}`
    );

    // Sync to CRM if donor has external ID (donations require donor to be synced first)
    if (existingDonation.donor?.externalId && existingDonation.donor?.organizationId) {
      console.log(
        `[updateDonation] Syncing donation to CRM: id=${id}, externalId=${existingDonation.externalId || 'none'}`
      );

      const externalId = await crmSyncService.syncDonation(existingDonation.donor.organizationId, {
        id,
        externalId: existingDonation.externalId || undefined,
        donorExternalId: existingDonation.donor.externalId,
        projectExternalId: existingDonation.project?.externalId || null,
        amount:
          donationData.amount !== undefined
            ? Number(donationData.amount)
            : Number(existingDonation.amount),
        currency: donationData.currency || existingDonation.currency,
        date: donationData.date || existingDonation.date,
      });

      if (externalId) {
        console.log(`[updateDonation] CRM sync successful, externalId=${externalId}`);
        donationData.externalId = externalId;
      } else {
        console.log(`[updateDonation] CRM sync returned no external ID`);
      }
    } else {
      console.log(`[updateDonation] Skipping CRM sync: donor not synced to CRM`);
    }

    console.log(`[updateDonation] Updating donation in database: id=${id}`);
    const result = await db
      .update(donations)
      .set({ ...donationData, updatedAt: sql`now()` })
      .where(eq(donations.id, id))
      .returning();

    console.log(
      `[updateDonation] Database update successful: id=${id}, externalId=${result[0]?.externalId || 'none'}`
    );
    return result[0];
  } catch (error) {
    console.error('Failed to update donation:', error);
    throw new Error('Could not update donation.');
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
    console.error('Failed to delete donation:', error);
    throw new Error('Could not delete donation.');
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
    donorId?: number | null;
    projectId?: number | null;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
    orderBy?: keyof Pick<Donation, 'date' | 'amount' | 'createdAt'>;
    orderDirection?: 'asc' | 'desc';
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
      orderDirection = 'asc',
      includeDonor,
      includeProject,
    } = options;

    const conditions: SQL[] = [];
    if (donorId !== undefined && donorId !== null) {
      conditions.push(eq(donations.donorId, donorId));
    }
    if (projectId !== undefined && projectId !== null) {
      conditions.push(eq(donations.projectId, projectId));
    }
    if (startDate) {
      conditions.push(sql`${donations.date} >= ${startDate}`);
    }
    if (endDate) {
      conditions.push(sql`${donations.date} <= ${endDate}`);
    }

    if (organizationId) {
      conditions.push(
        or(eq(donors.organizationId, organizationId), eq(projects.organizationId, organizationId))!
      );
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

    // Explicitly type queryBuilder to maintain its methods
    let queryBuilder: PgSelect<any, any, any> = db
      .select({
        ...getTableColumns(donations),
        ...(includeDonor && { donor: donors }),
        ...(includeProject && { project: projects }),
      })
      .from(donations)
      .leftJoin(donors, eq(donations.donorId, donors.id))
      .leftJoin(projects, eq(donations.projectId, projects.id)) as unknown as PgSelect<
      any,
      any,
      any
    >;

    if (whereClause) {
      queryBuilder = queryBuilder.where(whereClause);
    }

    if (limit !== undefined) {
      queryBuilder = queryBuilder.limit(limit);
    }

    if (offset !== undefined) {
      queryBuilder = queryBuilder.offset(offset);
    }

    if (orderBy) {
      const orderExpressions = (() => {
        const columnMap: Record<string, any> = {
          date: donations.date,
          amount: donations.amount,
          createdAt: donations.createdAt,
        };
        const selectedColumn = columnMap[orderBy as keyof typeof columnMap];
        if (selectedColumn) {
          return orderDirection === 'asc' ? [asc(selectedColumn)] : [desc(selectedColumn)];
        }
        return []; // Return an empty array if no valid column is found
      })();

      if (orderExpressions.length > 0) {
        queryBuilder = queryBuilder.orderBy(...orderExpressions);
      }
    }

    const donationsData = await queryBuilder;

    return {
      donations: donationsData as DonationWithDetails[],
      totalCount,
    };
  } catch (error) {
    console.error('Failed to list donations:', error);
    throw new Error('Could not list donations.');
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
          sql`${donations.donorId} = ANY(ARRAY[${sql.raw(donorIds.join(','))}]::integer[])`,
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
          sql`${donations.donorId} = ANY(ARRAY[${sql.raw(donorIds.join(','))}]::integer[])`,
          eq(donors.organizationId, organizationId)
        )
      )
      .groupBy(donations.donorId);

    // Combine the results
    const stats: { [donorId: number]: { totalDonated: number; lastDonationDate: Date | null } } =
      {};

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
    console.error('Failed to get multiple donor donation stats:', error);
    throw new Error('Could not retrieve donor donation statistics.');
  }
}

/**
 * Gets donation statistics for a donor
 * @param donorId - The ID of the donor
 * @param organizationId - The organization ID to filter by
 * @returns Object containing total amount donated, date of last donation, and donor notes
 */
export async function getDonorDonationStats(
  donorId: number,
  organizationId: string
): Promise<{ totalDonated: number; lastDonationDate: Date | null; notes: any[] }> {
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

    // Get donor notes
    const donorResult = await db
      .select({
        notes: donors.notes,
      })
      .from(donors)
      .where(and(eq(donors.id, donorId), eq(donors.organizationId, organizationId)));

    return {
      totalDonated: totalResult[0]?.total || 0,
      lastDonationDate: lastDonationResult[0]?.lastDate || null,
      notes: donorResult[0]?.notes || [],
    };
  } catch (error) {
    console.error('Failed to get donor donation stats:', error);
    throw new Error('Could not retrieve donor donation statistics.');
  }
}

/**
 * Gets comprehensive donation statistics for a single donor
 * @param donorId - The ID of the donor
 * @param organizationId - The organization ID to filter by
 * @returns Object containing comprehensive donation statistics
 */
export async function getComprehensiveDonorStats(
  donorId: number,
  organizationId: string
): Promise<{
  totalDonations: number;
  totalAmount: number;
  firstDonation: { date: Date; amount: number } | null;
  lastDonation: { date: Date; amount: number } | null;
  donationsByProject: {
    projectId: number | null;
    projectName: string | null;
    totalAmount: number;
  }[];
}> {
  try {
    // Get total count and amount
    const [totalStats] = await db
      .select({
        count: sql<number>`count(*)`,
        total: sql<number>`coalesce(sum(${donations.amount}), 0)`,
      })
      .from(donations)
      .innerJoin(donors, eq(donations.donorId, donors.id))
      .where(and(eq(donations.donorId, donorId), eq(donors.organizationId, organizationId)));

    // Get first donation (earliest date)
    const [firstDonation] = await db
      .select({
        date: donations.date,
        amount: donations.amount,
      })
      .from(donations)
      .innerJoin(donors, eq(donations.donorId, donors.id))
      .where(and(eq(donations.donorId, donorId), eq(donors.organizationId, organizationId)))
      .orderBy(asc(donations.date))
      .limit(1);

    // Get last donation (latest date)
    const [lastDonation] = await db
      .select({
        date: donations.date,
        amount: donations.amount,
      })
      .from(donations)
      .innerJoin(donors, eq(donations.donorId, donors.id))
      .where(and(eq(donations.donorId, donorId), eq(donors.organizationId, organizationId)))
      .orderBy(desc(donations.date))
      .limit(1);

    // Get donations by project
    const donationsByProject = await db
      .select({
        projectId: donations.projectId,
        projectName: sql<string | null>`${projects.name}`,
        totalAmount: sql<number>`sum(${donations.amount})`,
      })
      .from(donations)
      .innerJoin(donors, eq(donations.donorId, donors.id))
      .leftJoin(projects, eq(donations.projectId, projects.id))
      .where(and(eq(donations.donorId, donorId), eq(donors.organizationId, organizationId)))
      .groupBy(donations.projectId, projects.name);

    return {
      totalDonations: totalStats?.count || 0,
      totalAmount: totalStats?.total || 0,
      firstDonation: firstDonation
        ? { date: firstDonation.date, amount: firstDonation.amount }
        : null,
      lastDonation: lastDonation ? { date: lastDonation.date, amount: lastDonation.amount } : null,
      donationsByProject: donationsByProject.map((item) => ({
        projectId: item.projectId,
        projectName: item.projectName,
        totalAmount: item.totalAmount,
      })),
    };
  } catch (error) {
    console.error('Failed to get comprehensive donor stats:', error);
    throw new Error('Could not retrieve comprehensive donor statistics.');
  }
}

/**
 * Gets comprehensive donation statistics for multiple donors
 * @param donorIds - Array of donor IDs
 * @param organizationId - The organization ID to filter by
 * @returns Object mapping donor IDs to their comprehensive donation stats
 */
export async function getMultipleComprehensiveDonorStats(
  donorIds: number[],
  organizationId: string
): Promise<{
  [donorId: number]: {
    totalDonations: number;
    totalAmount: number;
    firstDonation: { date: Date; amount: number } | null;
    lastDonation: { date: Date; amount: number } | null;
    donationsByProject: {
      projectId: number | null;
      projectName: string | null;
      totalAmount: number;
    }[];
  };
}> {
  try {
    if (donorIds.length === 0) {
      return {};
    }

    // Get total counts and amounts for all donors
    const totalStats = await db
      .select({
        donorId: donations.donorId,
        count: sql<number>`count(*)`,
        total: sql<number>`coalesce(sum(${donations.amount}), 0)`,
      })
      .from(donations)
      .innerJoin(donors, eq(donations.donorId, donors.id))
      .where(
        and(
          sql`${donations.donorId} = ANY(ARRAY[${sql.raw(donorIds.join(','))}]::integer[])`,
          eq(donors.organizationId, organizationId)
        )
      )
      .groupBy(donations.donorId);

    // Get first donations (earliest date for each donor)
    const firstDonations = await db
      .select({
        donorId: donations.donorId,
        date: donations.date,
        amount: donations.amount,
        rank: sql<number>`row_number() over (partition by ${donations.donorId} order by ${donations.date} asc)`,
      })
      .from(donations)
      .innerJoin(donors, eq(donations.donorId, donors.id))
      .where(
        and(
          sql`${donations.donorId} = ANY(ARRAY[${sql.raw(donorIds.join(','))}]::integer[])`,
          eq(donors.organizationId, organizationId)
        )
      );

    const firstDonationMap: { [donorId: number]: { date: Date; amount: number } } = {};
    firstDonations.forEach((donation) => {
      if (donation.rank === 1) {
        firstDonationMap[donation.donorId] = { date: donation.date, amount: donation.amount };
      }
    });

    // Get last donations (latest date for each donor)
    const lastDonations = await db
      .select({
        donorId: donations.donorId,
        date: donations.date,
        amount: donations.amount,
        rank: sql<number>`row_number() over (partition by ${donations.donorId} order by ${donations.date} desc)`,
      })
      .from(donations)
      .innerJoin(donors, eq(donations.donorId, donors.id))
      .where(
        and(
          sql`${donations.donorId} = ANY(ARRAY[${sql.raw(donorIds.join(','))}]::integer[])`,
          eq(donors.organizationId, organizationId)
        )
      );

    const lastDonationMap: { [donorId: number]: { date: Date; amount: number } } = {};
    lastDonations.forEach((donation) => {
      if (donation.rank === 1) {
        lastDonationMap[donation.donorId] = { date: donation.date, amount: donation.amount };
      }
    });

    // Get donations by project for all donors
    const donationsByProject = await db
      .select({
        donorId: donations.donorId,
        projectId: donations.projectId,
        projectName: sql<string | null>`${projects.name}`,
        totalAmount: sql<number>`sum(${donations.amount})`,
      })
      .from(donations)
      .innerJoin(donors, eq(donations.donorId, donors.id))
      .leftJoin(projects, eq(donations.projectId, projects.id))
      .where(
        and(
          sql`${donations.donorId} = ANY(ARRAY[${sql.raw(donorIds.join(','))}]::integer[])`,
          eq(donors.organizationId, organizationId)
        )
      )
      .groupBy(donations.donorId, donations.projectId, projects.name);

    // Group donations by project for each donor
    const donationsByProjectMap: {
      [donorId: number]: {
        projectId: number | null;
        projectName: string | null;
        totalAmount: number;
      }[];
    } = {};

    donationsByProject.forEach((item) => {
      if (!donationsByProjectMap[item.donorId]) {
        donationsByProjectMap[item.donorId] = [];
      }
      donationsByProjectMap[item.donorId].push({
        projectId: item.projectId,
        projectName: item.projectName,
        totalAmount: item.totalAmount,
      });
    });

    // Combine all results
    const result: {
      [donorId: number]: {
        totalDonations: number;
        totalAmount: number;
        firstDonation: { date: Date; amount: number } | null;
        lastDonation: { date: Date; amount: number } | null;
        donationsByProject: {
          projectId: number | null;
          projectName: string | null;
          totalAmount: number;
        }[];
      };
    } = {};

    // Initialize all donors with default values
    donorIds.forEach((donorId) => {
      result[donorId] = {
        totalDonations: 0,
        totalAmount: 0,
        firstDonation: null,
        lastDonation: null,
        donationsByProject: [],
      };
    });

    // Add total stats
    totalStats.forEach((stat) => {
      if (result[stat.donorId]) {
        result[stat.donorId].totalDonations = stat.count;
        result[stat.donorId].totalAmount = stat.total;
      }
    });

    // Add first and last donations
    donorIds.forEach((donorId) => {
      if (firstDonationMap[donorId]) {
        result[donorId].firstDonation = firstDonationMap[donorId];
      }
      if (lastDonationMap[donorId]) {
        result[donorId].lastDonation = lastDonationMap[donorId];
      }
      if (donationsByProjectMap[donorId]) {
        result[donorId].donationsByProject = donationsByProjectMap[donorId];
      }
    });

    return result;
  } catch (error) {
    console.error('Failed to get multiple comprehensive donor stats:', error);
    throw new Error('Could not retrieve comprehensive donor statistics.');
  }
}

/**
 * Gets comprehensive donation statistics for multiple donors, excluding external project donations
 * This is used for LLM email generation to avoid including external donations
 * @param donorIds - Array of donor IDs
 * @param organizationId - The organization ID to filter by
 * @returns Object mapping donor IDs to their comprehensive donation stats (excluding external)
 */
export async function getMultipleComprehensiveDonorStatsExcludingExternal(
  donorIds: number[],
  organizationId: string
): Promise<{
  [donorId: number]: {
    totalDonations: number;
    totalAmount: number;
    firstDonation: { date: Date; amount: number } | null;
    lastDonation: { date: Date; amount: number } | null;
    donationsByProject: {
      projectId: number | null;
      projectName: string | null;
      totalAmount: number;
    }[];
  };
}> {
  try {
    if (donorIds.length === 0) {
      return {};
    }

    // Get total counts and amounts for all donors (excluding external projects)
    const totalStats = await db
      .select({
        donorId: donations.donorId,
        count: sql<number>`count(*)`,
        total: sql<number>`coalesce(sum(${donations.amount}), 0)`,
      })
      .from(donations)
      .innerJoin(donors, eq(donations.donorId, donors.id))
      .leftJoin(projects, eq(donations.projectId, projects.id))
      .where(
        and(
          sql`${donations.donorId} = ANY(ARRAY[${sql.raw(donorIds.join(','))}]::integer[])`,
          eq(donors.organizationId, organizationId),
          // Exclude donations to external projects
          or(sql`${donations.projectId} IS NULL`, sql`${projects.external} = false`)
        )
      )
      .groupBy(donations.donorId);

    // Get first donations (earliest date for each donor, excluding external)
    const firstDonations = await db
      .select({
        donorId: donations.donorId,
        date: donations.date,
        amount: donations.amount,
        rank: sql<number>`row_number() over (partition by ${donations.donorId} order by ${donations.date} asc)`,
      })
      .from(donations)
      .innerJoin(donors, eq(donations.donorId, donors.id))
      .leftJoin(projects, eq(donations.projectId, projects.id))
      .where(
        and(
          sql`${donations.donorId} = ANY(ARRAY[${sql.raw(donorIds.join(','))}]::integer[])`,
          eq(donors.organizationId, organizationId),
          // Exclude donations to external projects
          or(sql`${donations.projectId} IS NULL`, sql`${projects.external} = false`)
        )
      );

    // Get last donations (latest date for each donor, excluding external)
    const lastDonations = await db
      .select({
        donorId: donations.donorId,
        date: donations.date,
        amount: donations.amount,
        rank: sql<number>`row_number() over (partition by ${donations.donorId} order by ${donations.date} desc)`,
      })
      .from(donations)
      .innerJoin(donors, eq(donations.donorId, donors.id))
      .leftJoin(projects, eq(donations.projectId, projects.id))
      .where(
        and(
          sql`${donations.donorId} = ANY(ARRAY[${sql.raw(donorIds.join(','))}]::integer[])`,
          eq(donors.organizationId, organizationId),
          // Exclude donations to external projects
          or(sql`${donations.projectId} IS NULL`, sql`${projects.external} = false`)
        )
      );

    // Get donations by project for all donors (excluding external projects)
    const donationsByProject = await db
      .select({
        donorId: donations.donorId,
        projectId: donations.projectId,
        projectName: sql<string | null>`${projects.name}`,
        totalAmount: sql<number>`sum(${donations.amount})`,
      })
      .from(donations)
      .innerJoin(donors, eq(donations.donorId, donors.id))
      .leftJoin(projects, eq(donations.projectId, projects.id))
      .where(
        and(
          sql`${donations.donorId} = ANY(ARRAY[${sql.raw(donorIds.join(','))}]::integer[])`,
          eq(donors.organizationId, organizationId),
          // Exclude donations to external projects
          or(sql`${donations.projectId} IS NULL`, sql`${projects.external} = false`)
        )
      )
      .groupBy(donations.donorId, donations.projectId, projects.name);

    // Group donations by project for each donor
    const donationsByProjectMap: {
      [donorId: number]: {
        projectId: number | null;
        projectName: string | null;
        totalAmount: number;
      }[];
    } = {};

    donationsByProject.forEach((item) => {
      if (!donationsByProjectMap[item.donorId]) {
        donationsByProjectMap[item.donorId] = [];
      }
      donationsByProjectMap[item.donorId].push({
        projectId: item.projectId,
        projectName: item.projectName,
        totalAmount: item.totalAmount,
      });
    });

    // Combine all results
    const result: {
      [donorId: number]: {
        totalDonations: number;
        totalAmount: number;
        firstDonation: { date: Date; amount: number } | null;
        lastDonation: { date: Date; amount: number } | null;
        donationsByProject: {
          projectId: number | null;
          projectName: string | null;
          totalAmount: number;
        }[];
      };
    } = {};

    // Initialize all donors with default values
    donorIds.forEach((donorId) => {
      result[donorId] = {
        totalDonations: 0,
        totalAmount: 0,
        firstDonation: null,
        lastDonation: null,
        donationsByProject: [],
      };
    });

    // Populate total stats
    totalStats.forEach((stat) => {
      result[stat.donorId].totalDonations = stat.count;
      result[stat.donorId].totalAmount = stat.total;
    });

    // Populate first donations
    const filteredFirstDonations = firstDonations.filter((d) => d.rank === 1);
    filteredFirstDonations.forEach((donation) => {
      result[donation.donorId].firstDonation = {
        date: donation.date,
        amount: donation.amount,
      };
    });

    // Populate last donations
    const filteredLastDonations = lastDonations.filter((d) => d.rank === 1);
    filteredLastDonations.forEach((donation) => {
      result[donation.donorId].lastDonation = {
        date: donation.date,
        amount: donation.amount,
      };
    });

    // Populate donations by project
    Object.entries(donationsByProjectMap).forEach(([donorId, projectDonations]) => {
      result[Number(donorId)].donationsByProject = projectDonations;
    });

    return result;
  } catch (error) {
    console.error('Failed to get multiple comprehensive donor stats excluding external:', error);
    throw new Error('Could not retrieve comprehensive donor statistics.');
  }
}

/**
 * Get donations for a donor with project information
 */
export async function getDonorDonationsWithProjects(donorId: number): Promise<any[]> {
  try {
    return await db.query.donations.findMany({
      where: eq(donations.donorId, donorId),
      with: {
        project: true,
      },
      orderBy: [desc(donations.date)],
    });
  } catch (error) {
    console.error('Failed to get donor donations with projects:', error);
    throw new Error('Could not retrieve donor donations.');
  }
}
