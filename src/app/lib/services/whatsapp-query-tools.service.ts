import { db } from "@/app/lib/db";
import { donors, donations, projects, staff } from "@/app/lib/db/schema";
import { logger } from "@/app/lib/logger";
import { and, desc, eq, ilike, or, sql, sum } from "drizzle-orm";
import { z } from "zod";

/**
 * Database query tools for WhatsApp AI assistant
 * Provides structured database access for donor and donation queries
 */
export class WhatsAppQueryToolsService {
  /**
   * Find donors by name with fuzzy matching
   */
  async findDonorsByName(params: { name: string; organizationId: string; limit?: number }): Promise<
    Array<{
      id: number;
      firstName: string;
      lastName: string;
      displayName: string | null;
      email: string;
      phone: string | null;
      isCouple: boolean;
      totalDonations: number;
      donationCount: number;
    }>
  > {
    const { name, organizationId, limit = 10 } = params;

    logger.info(`Finding donors by name: "${name}" in organization ${organizationId}`);

    try {
      // Search by first name, last name, display name, or email
      const results = await db
        .select({
          id: donors.id,
          firstName: donors.firstName,
          lastName: donors.lastName,
          displayName: donors.displayName,
          email: donors.email,
          phone: donors.phone,
          isCouple: donors.isCouple,
          totalDonations: sql<number>`COALESCE(SUM(${donations.amount}), 0)`,
          donationCount: sql<number>`COUNT(${donations.id})`,
        })
        .from(donors)
        .leftJoin(donations, eq(donors.id, donations.donorId))
        .where(
          and(
            eq(donors.organizationId, organizationId),
            or(
              ilike(donors.firstName, `%${name}%`),
              ilike(donors.lastName, `%${name}%`),
              ilike(donors.displayName, `%${name}%`),
              ilike(donors.email, `%${name}%`),
              ilike(sql`CONCAT(${donors.firstName}, ' ', ${donors.lastName})`, `%${name}%`)
            )
          )
        )
        .groupBy(
          donors.id,
          donors.firstName,
          donors.lastName,
          donors.displayName,
          donors.email,
          donors.phone,
          donors.isCouple
        )
        .orderBy(desc(sql`COUNT(${donations.id})`), donors.firstName)
        .limit(limit);

      logger.info(`Found ${results.length} donors matching "${name}"`);
      return results;
    } catch (error) {
      logger.error(`Error finding donors by name: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get detailed donor information
   */
  async getDonorDetails(params: { donorId: number; organizationId: string }): Promise<{
    id: number;
    firstName: string;
    lastName: string;
    displayName: string | null;
    email: string;
    phone: string | null;
    address: string | null;
    state: string | null;
    isCouple: boolean;
    hisFirstName: string | null;
    hisLastName: string | null;
    herFirstName: string | null;
    herLastName: string | null;
    notes: string | null;
    currentStageName: string | null;
    highPotentialDonor: boolean | null;
    assignedStaff: {
      id: number;
      firstName: string;
      lastName: string;
      email: string;
    } | null;
    totalDonations: number;
    donationCount: number;
    lastDonationDate: Date | null;
  } | null> {
    const { donorId, organizationId } = params;

    logger.info(`Getting details for donor ${donorId} in organization ${organizationId}`);

    try {
      const result = await db
        .select({
          id: donors.id,
          firstName: donors.firstName,
          lastName: donors.lastName,
          displayName: donors.displayName,
          email: donors.email,
          phone: donors.phone,
          address: donors.address,
          state: donors.state,
          isCouple: donors.isCouple,
          hisFirstName: donors.hisFirstName,
          hisLastName: donors.hisLastName,
          herFirstName: donors.herFirstName,
          herLastName: donors.herLastName,
          notes: donors.notes,
          currentStageName: donors.currentStageName,
          highPotentialDonor: donors.highPotentialDonor,
          staffId: staff.id,
          staffFirstName: staff.firstName,
          staffLastName: staff.lastName,
          staffEmail: staff.email,
          totalDonations: sql<number>`COALESCE(SUM(${donations.amount}), 0)`,
          donationCount: sql<number>`COUNT(${donations.id})`,
          lastDonationDate: sql<Date | null>`MAX(${donations.date})`,
        })
        .from(donors)
        .leftJoin(staff, eq(donors.assignedToStaffId, staff.id))
        .leftJoin(donations, eq(donors.id, donations.donorId))
        .where(and(eq(donors.id, donorId), eq(donors.organizationId, organizationId)))
        .groupBy(
          donors.id,
          donors.firstName,
          donors.lastName,
          donors.displayName,
          donors.email,
          donors.phone,
          donors.address,
          donors.state,
          donors.isCouple,
          donors.hisFirstName,
          donors.hisLastName,
          donors.herFirstName,
          donors.herLastName,
          donors.notes,
          donors.currentStageName,
          donors.highPotentialDonor,
          staff.id,
          staff.firstName,
          staff.lastName,
          staff.email
        );

      if (result.length === 0) {
        logger.warn(`Donor ${donorId} not found in organization ${organizationId}`);
        return null;
      }

      const donor = result[0];
      return {
        id: donor.id,
        firstName: donor.firstName,
        lastName: donor.lastName,
        displayName: donor.displayName,
        email: donor.email,
        phone: donor.phone,
        address: donor.address,
        state: donor.state,
        isCouple: donor.isCouple,
        hisFirstName: donor.hisFirstName,
        hisLastName: donor.hisLastName,
        herFirstName: donor.herFirstName,
        herLastName: donor.herLastName,
        notes: donor.notes,
        currentStageName: donor.currentStageName,
        highPotentialDonor: donor.highPotentialDonor,
        assignedStaff: donor.staffId
          ? {
              id: donor.staffId,
              firstName: donor.staffFirstName!,
              lastName: donor.staffLastName!,
              email: donor.staffEmail!,
            }
          : null,
        totalDonations: donor.totalDonations,
        donationCount: donor.donationCount,
        lastDonationDate: donor.lastDonationDate,
      };
    } catch (error) {
      logger.error(`Error getting donor details: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get donation history for a donor
   */
  async getDonationHistory(params: { donorId: number; organizationId: string; limit?: number }): Promise<
    Array<{
      id: number;
      date: Date;
      amount: number;
      currency: string;
      projectName: string;
      projectId: number;
    }>
  > {
    const { donorId, organizationId, limit = 50 } = params;

    logger.info(`Getting donation history for donor ${donorId} in organization ${organizationId}`);

    try {
      // First verify the donor belongs to the organization
      const donorExists = await db
        .select({ id: donors.id })
        .from(donors)
        .where(and(eq(donors.id, donorId), eq(donors.organizationId, organizationId)))
        .limit(1);

      if (donorExists.length === 0) {
        logger.warn(`Donor ${donorId} not found in organization ${organizationId}`);
        return [];
      }

      const results = await db
        .select({
          id: donations.id,
          date: donations.date,
          amount: donations.amount,
          currency: donations.currency,
          projectName: projects.name,
          projectId: projects.id,
        })
        .from(donations)
        .innerJoin(projects, eq(donations.projectId, projects.id))
        .where(eq(donations.donorId, donorId))
        .orderBy(desc(donations.date))
        .limit(limit);

      logger.info(`Found ${results.length} donations for donor ${donorId}`);
      return results;
    } catch (error) {
      logger.error(`Error getting donation history: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get donor statistics
   */
  async getDonorStatistics(params: { organizationId: string }): Promise<{
    totalDonors: number;
    totalDonations: number;
    totalDonationAmount: number;
    averageDonationAmount: number;
    highPotentialDonors: number;
    couplesCount: number;
    individualsCount: number;
  }> {
    const { organizationId } = params;

    logger.info(`Getting donor statistics for organization ${organizationId}`);

    try {
      const stats = await db
        .select({
          totalDonors: sql<number>`COUNT(DISTINCT ${donors.id})`,
          totalDonations: sql<number>`COUNT(${donations.id})`,
          totalDonationAmount: sql<number>`COALESCE(SUM(${donations.amount}), 0)`,
          averageDonationAmount: sql<number>`COALESCE(AVG(${donations.amount}), 0)`,
          highPotentialDonors: sql<number>`COUNT(DISTINCT CASE WHEN ${donors.highPotentialDonor} = true THEN ${donors.id} END)`,
          couplesCount: sql<number>`COUNT(DISTINCT CASE WHEN ${donors.isCouple} = true THEN ${donors.id} END)`,
          individualsCount: sql<number>`COUNT(DISTINCT CASE WHEN ${donors.isCouple} = false THEN ${donors.id} END)`,
        })
        .from(donors)
        .leftJoin(donations, eq(donors.id, donations.donorId))
        .where(eq(donors.organizationId, organizationId));

      const result = stats[0];
      logger.info(
        `Retrieved statistics for organization ${organizationId}: ${result.totalDonors} donors, ${result.totalDonations} donations`
      );

      return result;
    } catch (error) {
      logger.error(`Error getting donor statistics: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get top donors by donation amount
   */
  async getTopDonors(params: { organizationId: string; limit?: number }): Promise<
    Array<{
      id: number;
      firstName: string;
      lastName: string;
      displayName: string | null;
      email: string;
      totalDonations: number;
      donationCount: number;
      lastDonationDate: Date | null;
    }>
  > {
    const { organizationId, limit = 10 } = params;

    logger.info(`Getting top ${limit} donors for organization ${organizationId}`);

    try {
      const results = await db
        .select({
          id: donors.id,
          firstName: donors.firstName,
          lastName: donors.lastName,
          displayName: donors.displayName,
          email: donors.email,
          totalDonations: sql<number>`COALESCE(SUM(${donations.amount}), 0)`,
          donationCount: sql<number>`COUNT(${donations.id})`,
          lastDonationDate: sql<Date | null>`MAX(${donations.date})`,
        })
        .from(donors)
        .leftJoin(donations, eq(donors.id, donations.donorId))
        .where(eq(donors.organizationId, organizationId))
        .groupBy(donors.id, donors.firstName, donors.lastName, donors.displayName, donors.email)
        .having(sql`COUNT(${donations.id}) > 0`)
        .orderBy(desc(sql`SUM(${donations.amount})`))
        .limit(limit);

      logger.info(`Found ${results.length} top donors for organization ${organizationId}`);
      return results;
    } catch (error) {
      logger.error(`Error getting top donors: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}

// Export schema types for tool definitions
export const FindDonorsByNameSchema = z.object({
  name: z.string().describe("The name or partial name to search for"),
  limit: z.number().optional().default(10).describe("Maximum number of results to return"),
});

export const GetDonorDetailsSchema = z.object({
  donorId: z.number().describe("The ID of the donor to get details for"),
});

export const GetDonationHistorySchema = z.object({
  donorId: z.number().describe("The ID of the donor to get donation history for"),
  limit: z.number().optional().default(50).describe("Maximum number of donations to return"),
});

export const GetDonorStatisticsSchema = z.object({});

export const GetTopDonorsSchema = z.object({
  limit: z.number().optional().default(10).describe("Maximum number of top donors to return"),
});
