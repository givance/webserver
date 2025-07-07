import { db } from '../db';
import { personResearch } from '../db/schema';
import { and, eq, desc } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';

export type PersonResearch = InferSelectModel<typeof personResearch>;

/**
 * Get person research data for a donor
 */
export async function getPersonResearchByDonor(
  donorId: number,
  organizationId: string,
  limit: number = 5
): Promise<any[]> {
  try {
    const research = await db.query.personResearch.findMany({
      where: and(
        eq(personResearch.donorId, donorId),
        eq(personResearch.organizationId, organizationId),
        eq(personResearch.isLive, true)
      ),
      orderBy: [desc(personResearch.createdAt)],
      limit,
    });

    return research.filter((r) => r.researchData).map((r) => r.researchData as any);
  } catch (error) {
    console.error('Failed to get person research:', error);
    throw new Error('Could not retrieve person research.');
  }
}
