import { db } from "@/app/lib/db";
import { personResearch } from "@/app/lib/db/schema";
import { logger } from "@/app/lib/logger";
import { and, desc, eq } from "drizzle-orm";
import { GetPersonResearchInput, PersonResearchDBRecord, SavePersonResearchInput } from "./types";

/**
 * PersonResearchDatabaseService - Service for saving and retrieving person research data
 */
export class PersonResearchDatabaseService {
  /**
   * Saves person research result to the database
   * @param input - Save input parameters
   * @returns The saved database record
   */
  async savePersonResearch(input: SavePersonResearchInput): Promise<PersonResearchDBRecord> {
    const { donorId, organizationId, userId, researchResult, setAsLive = true } = input;

    logger.info(
      `Saving person research for donor ${donorId} in organization ${organizationId} (setAsLive: ${setAsLive})`
    );

    try {
      // Start a transaction to handle the version management
      const result = await db.transaction(async (tx) => {
        // If setting as live, first unmark any existing live research for this donor
        if (setAsLive) {
          await tx
            .update(personResearch)
            .set({ isLive: false, updatedAt: new Date() })
            .where(and(eq(personResearch.donorId, donorId), eq(personResearch.isLive, true)));
        }

        // Get the next version number for this donor
        const existingResearch = await tx
          .select({ version: personResearch.version })
          .from(personResearch)
          .where(eq(personResearch.donorId, donorId))
          .orderBy(desc(personResearch.version))
          .limit(1);

        const nextVersion = existingResearch.length > 0 ? existingResearch[0].version + 1 : 1;

        // Insert the new research record
        const insertedRecords = await tx
          .insert(personResearch)
          .values({
            donorId,
            organizationId,
            userId,
            researchTopic: researchResult.researchTopic,
            researchData: researchResult,
            isLive: setAsLive,
            version: nextVersion,
          })
          .returning();

        return insertedRecords[0];
      });

      logger.info(
        `Successfully saved person research for donor ${donorId}, version ${result.version}, live: ${result.isLive}`
      );

      return result as PersonResearchDBRecord;
    } catch (error) {
      logger.error(
        `Failed to save person research for donor ${donorId}: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new Error(`Failed to save person research: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Retrieves person research from the database
   * @param input - Get input parameters
   * @returns The research record or null if not found
   */
  async getPersonResearch(input: GetPersonResearchInput): Promise<PersonResearchDBRecord | null> {
    const { donorId, organizationId, version } = input;

    logger.info(
      `Retrieving person research for donor ${donorId} in organization ${organizationId}${
        version ? ` (version ${version})` : " (live version)"
      }`
    );

    try {
      let whereClause;

      if (version) {
        // Get specific version
        whereClause = and(
          eq(personResearch.donorId, donorId),
          eq(personResearch.organizationId, organizationId),
          eq(personResearch.version, version)
        );
      } else {
        // Get live version
        whereClause = and(
          eq(personResearch.donorId, donorId),
          eq(personResearch.organizationId, organizationId),
          eq(personResearch.isLive, true)
        );
      }

      const records = await db.select().from(personResearch).where(whereClause).limit(1);

      if (records.length === 0) {
        logger.info(
          `No person research found for donor ${donorId}${version ? ` version ${version}` : " (live version)"}`
        );
        return null;
      }

      const record = records[0] as PersonResearchDBRecord;
      logger.info(`Successfully retrieved person research for donor ${donorId}, version ${record.version}`);

      return record;
    } catch (error) {
      logger.error(
        `Failed to retrieve person research for donor ${donorId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw new Error(
        `Failed to retrieve person research: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Gets all research versions for a donor
   * @param donorId - The donor ID
   * @param organizationId - The organization ID
   * @returns Array of research records, ordered by version desc
   */
  async getAllPersonResearchVersions(donorId: number, organizationId: string): Promise<PersonResearchDBRecord[]> {
    logger.info(`Retrieving all person research versions for donor ${donorId} in organization ${organizationId}`);

    try {
      const records = await db
        .select()
        .from(personResearch)
        .where(and(eq(personResearch.donorId, donorId), eq(personResearch.organizationId, organizationId)))
        .orderBy(desc(personResearch.version));

      logger.info(`Found ${records.length} research versions for donor ${donorId}`);

      return records as PersonResearchDBRecord[];
    } catch (error) {
      logger.error(
        `Failed to retrieve research versions for donor ${donorId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw new Error(
        `Failed to retrieve research versions: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Marks a specific research version as live
   * @param researchId - The research record ID
   * @param donorId - The donor ID (for validation)
   * @returns Updated record
   */
  async setResearchAsLive(researchId: number, donorId: number): Promise<PersonResearchDBRecord> {
    logger.info(`Setting research ${researchId} as live for donor ${donorId}`);

    try {
      const result = await db.transaction(async (tx) => {
        // First, get the research record to verify it exists and get the donor ID
        const targetRecord = await tx
          .select()
          .from(personResearch)
          .where(and(eq(personResearch.id, researchId), eq(personResearch.donorId, donorId)))
          .limit(1);

        if (targetRecord.length === 0) {
          throw new Error(`Research record ${researchId} not found for donor ${donorId}`);
        }

        // Unmark any existing live research for this donor
        await tx
          .update(personResearch)
          .set({ isLive: false, updatedAt: new Date() })
          .where(and(eq(personResearch.donorId, donorId), eq(personResearch.isLive, true)));

        // Mark the target record as live
        const updatedRecords = await tx
          .update(personResearch)
          .set({ isLive: true, updatedAt: new Date() })
          .where(eq(personResearch.id, researchId))
          .returning();

        return updatedRecords[0];
      });

      logger.info(`Successfully set research ${researchId} as live for donor ${donorId}`);

      return result as PersonResearchDBRecord;
    } catch (error) {
      logger.error(
        `Failed to set research ${researchId} as live for donor ${donorId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw new Error(`Failed to set research as live: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
}
