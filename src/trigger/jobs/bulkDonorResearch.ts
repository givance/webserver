import { task, logger as triggerLogger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { db } from "@/app/lib/db";
import { donors, personResearch, organizations } from "@/app/lib/db/schema";
import { eq, and, isNull, notExists, inArray } from "drizzle-orm";
import { PersonResearchService } from "@/app/lib/services/person-research.service";
import { getDonorById } from "@/app/lib/data/donors";
import { getOrganizationById } from "@/app/lib/data/organizations";

// Maximum number of concurrent operations
const MAX_CONCURRENCY = 15;

/**
 * Process items in batches with limited concurrency
 */
async function processConcurrently<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  maxConcurrency: number = MAX_CONCURRENCY
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += maxConcurrency) {
    const batch = items.slice(i, i + maxConcurrency);
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        try {
          return await processor(item);
        } catch (error) {
          triggerLogger.error(`Failed to process item: ${error instanceof Error ? error.message : String(error)}`);
          throw error; // Re-throw to handle it in the batch
        }
      })
    );
    results.push(...batchResults);

    // Log progress for large batches
    if (items.length > maxConcurrency) {
      triggerLogger.info(`Processed ${Math.min(i + maxConcurrency, items.length)}/${items.length} donors`);
    }
  }

  return results;
}

/**
 * Helper function to generate research topic for a donor
 */
async function generateDonorResearchTopic(donorId: number, organizationId: string): Promise<string> {
  // Get donor information
  const donor = await getDonorById(donorId, organizationId);
  if (!donor) {
    throw new Error(`Donor ${donorId} not found in organization ${organizationId}`);
  }

  // Get organization information
  const organization = await getOrganizationById(organizationId);
  if (!organization) {
    throw new Error(`Organization ${organizationId} not found`);
  }

  // Build donor name
  const donorName = `${donor.firstName} ${donor.lastName}`.trim();

  // Build address info if available
  const addressParts = [];
  if (donor.address) addressParts.push(donor.address);
  if (donor.state) addressParts.push(donor.state);
  const addressInfo = addressParts.length > 0 ? ` living in ${addressParts.join(", ")}` : "";

  // Build email info if available
  const emailInfo = donor.email ? ` with email ${donor.email}` : "";

  // Include donor notes if available
  const notesInfo = donor.notes ? ` Additional information: ${donor.notes}` : "";

  // Get organization description (prefer short description, fall back to description)
  const orgDescription = organization.shortDescription || organization.description || organization.name;

  // Generate research topic that includes identifying information and contextualizes it for the donation angle
  const researchTopic = `What motivates ${donorName}${addressInfo}${emailInfo} to donate to nonprofits? Analyze their background, interests, values, and philanthropic history. What specific aspects of a ${orgDescription} would appeal to them based on their profile?${notesInfo}`;

  triggerLogger.info(`Generated research topic for donor ${donorId}: "${researchTopic}"`);

  return researchTopic;
}

// Define the payload schema using Zod
const bulkDonorResearchPayloadSchema = z.object({
  organizationId: z.string(),
  userId: z.string(),
  donorIds: z.array(z.number()).optional(), // Optional: if provided, research only these donors, otherwise research all unresearched
  limit: z.number().optional(), // Optional: maximum number of donors to research
});

type BulkDonorResearchPayload = z.infer<typeof bulkDonorResearchPayloadSchema>;

/**
 * Trigger job for conducting bulk donor research for all unresearched donors
 */
export const bulkDonorResearchTask = task({
  id: "bulk-donor-research",
  run: async (payload: BulkDonorResearchPayload, { ctx }) => {
    const { organizationId, userId, donorIds, limit } = payload;

    triggerLogger.info(
      `Starting bulk donor research for organization ${organizationId}, user ${userId}, limit: ${limit || "none"}`
    );

    try {
      const personResearchService = new PersonResearchService();

      // Get donors that need research
      let donorsToResearch;

      if (donorIds && donorIds.length > 0) {
        // Research specific donors
        const baseQuery = db
          .select({
            id: donors.id,
            firstName: donors.firstName,
            lastName: donors.lastName,
            email: donors.email,
          })
          .from(donors)
          .where(and(eq(donors.organizationId, organizationId), inArray(donors.id, donorIds)));

        donorsToResearch = limit ? await baseQuery.limit(limit) : await baseQuery;
      } else {
        // Get all donors that don't have any research conducted yet
        const baseQuery = db
          .select({
            id: donors.id,
            firstName: donors.firstName,
            lastName: donors.lastName,
            email: donors.email,
          })
          .from(donors)
          .where(
            and(
              eq(donors.organizationId, organizationId),
              // Use NOT EXISTS to find donors without any research
              notExists(db.select().from(personResearch).where(eq(personResearch.donorId, donors.id)))
            )
          );

        donorsToResearch = limit ? await baseQuery.limit(limit) : await baseQuery;
      }

      if (donorsToResearch.length === 0) {
        triggerLogger.info(`No donors found that need research for organization ${organizationId}`);
        return {
          status: "success",
          message: "No donors found that need research",
          donorsProcessed: 0,
          donorsSuccessful: 0,
          donorsFailed: 0,
        };
      }

      triggerLogger.info(
        `Found ${donorsToResearch.length} donors that need research in organization ${organizationId}`
      );

      // Track results
      let successfulResearches = 0;
      let failedResearches = 0;
      const failedDonors: Array<{ donorId: number; error: string }> = [];

      // Process donors in batches with concurrency limiting
      await processConcurrently(
        donorsToResearch,
        async (donor) => {
          try {
            triggerLogger.info(`Starting research for donor ${donor.id}: ${donor.firstName} ${donor.lastName}`);

            // Generate research topic for the donor
            const researchTopic = await generateDonorResearchTopic(donor.id, organizationId);

            // Conduct and save the research
            await personResearchService.conductAndSavePersonResearch(
              {
                researchTopic,
                organizationId,
                userId,
              },
              donor.id
            );

            successfulResearches++;
            triggerLogger.info(`Successfully completed research for donor ${donor.id}`);

            return { donorId: donor.id, status: "success" };
          } catch (error) {
            failedResearches++;
            const errorMessage = error instanceof Error ? error.message : String(error);
            triggerLogger.error(`Failed to research donor ${donor.id}: ${errorMessage}`);

            failedDonors.push({
              donorId: donor.id,
              error: errorMessage,
            });

            // Don't throw here - we want to continue with other donors
            return { donorId: donor.id, status: "failed", error: errorMessage };
          }
        },
        MAX_CONCURRENCY
      );

      const result = {
        status: "completed" as const,
        donorsProcessed: donorsToResearch.length,
        donorsSuccessful: successfulResearches,
        donorsFailed: failedResearches,
        failedDonors,
        organizationId,
        userId,
      };

      triggerLogger.info(
        `Bulk donor research completed for organization ${organizationId}. ` +
          `Processed: ${result.donorsProcessed}, Successful: ${result.donorsSuccessful}, Failed: ${result.donorsFailed}`
      );

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      triggerLogger.error(`Error in bulk donor research for organization ${organizationId}: ${errorMessage}`);

      throw error;
    }
  },
});
