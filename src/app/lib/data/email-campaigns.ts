import { db } from '../db';
import {
  emailGenerationSessions,
  generatedEmails,
  emailSendJobs,
  EmailGenerationSessionStatus,
  type DonorNote,
} from '../db/schema';
import { eq, sql, and, desc, count, or, inArray } from 'drizzle-orm';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

export type EmailGenerationSession = InferSelectModel<typeof emailGenerationSessions>;
export type NewEmailGenerationSession = InferInsertModel<typeof emailGenerationSessions>;
export type GeneratedEmail = InferSelectModel<typeof generatedEmails>;
export type NewGeneratedEmail = InferInsertModel<typeof generatedEmails>;

/**
 * Creates a new email generation session
 */
export async function createEmailGenerationSession(
  sessionData: Omit<NewEmailGenerationSession, 'id' | 'createdAt' | 'updatedAt'>
): Promise<EmailGenerationSession> {
  try {
    const result = await db.insert(emailGenerationSessions).values(sessionData).returning();
    return result[0];
  } catch (error) {
    console.error('Failed to create email generation session:', error);
    throw new Error('Could not create email generation session.');
  }
}

/**
 * Gets an email generation session by ID and organization
 */
export async function getEmailGenerationSessionById(
  sessionId: number,
  organizationId: string
): Promise<EmailGenerationSession | undefined> {
  try {
    const result = await db
      .select()
      .from(emailGenerationSessions)
      .where(
        and(
          eq(emailGenerationSessions.id, sessionId),
          eq(emailGenerationSessions.organizationId, organizationId)
        )
      )
      .limit(1);
    return result[0];
  } catch (error) {
    console.error('Failed to get email generation session:', error);
    throw new Error('Could not retrieve email generation session.');
  }
}

/**
 * Updates an email generation session
 */
export async function updateEmailGenerationSession(
  sessionId: number,
  organizationId: string,
  updateData: Partial<Omit<NewEmailGenerationSession, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<EmailGenerationSession | undefined> {
  try {
    const result = await db
      .update(emailGenerationSessions)
      .set({ ...updateData, updatedAt: new Date() })
      .where(
        and(
          eq(emailGenerationSessions.id, sessionId),
          eq(emailGenerationSessions.organizationId, organizationId)
        )
      )
      .returning();
    return result[0];
  } catch (error) {
    console.error('Failed to update email generation session:', error);
    throw new Error('Could not update email generation session.');
  }
}

/**
 * Deletes an email generation session and its emails
 */
export async function deleteEmailGenerationSession(
  sessionId: number,
  organizationId: string
): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      // Delete associated emails first
      await tx.delete(generatedEmails).where(eq(generatedEmails.sessionId, sessionId));

      // Then delete the session
      await tx
        .delete(emailGenerationSessions)
        .where(
          and(
            eq(emailGenerationSessions.id, sessionId),
            eq(emailGenerationSessions.organizationId, organizationId)
          )
        );
    });
  } catch (error) {
    console.error('Failed to delete email generation session:', error);
    throw new Error('Could not delete email generation session.');
  }
}

/**
 * Lists email generation sessions with pagination and filtering
 */
export async function listEmailGenerationSessions(
  organizationId: string,
  options: {
    limit?: number;
    offset?: number;
    status?: keyof typeof EmailGenerationSessionStatus;
  } = {}
): Promise<{ sessions: EmailGenerationSession[]; totalCount: number }> {
  try {
    const { limit = 10, offset = 0, status } = options;

    const whereClauses = [eq(emailGenerationSessions.organizationId, organizationId)];
    if (status) {
      whereClauses.push(eq(emailGenerationSessions.status, status));
    }

    const [sessions, totalCountResult] = await Promise.all([
      db
        .select()
        .from(emailGenerationSessions)
        .where(and(...whereClauses))
        .orderBy(desc(emailGenerationSessions.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: count() })
        .from(emailGenerationSessions)
        .where(and(...whereClauses)),
    ]);

    return {
      sessions,
      totalCount: totalCountResult[0]?.count || 0,
    };
  } catch (error) {
    console.error('Failed to list email generation sessions:', error);
    throw new Error('Could not list email generation sessions.');
  }
}

/**
 * Gets generated emails for a session
 */
export async function getGeneratedEmailsBySessionId(sessionId: number): Promise<GeneratedEmail[]> {
  try {
    const result = await db
      .select()
      .from(generatedEmails)
      .where(eq(generatedEmails.sessionId, sessionId));
    return result;
  } catch (error) {
    console.error('Failed to get generated emails:', error);
    throw new Error('Could not retrieve generated emails.');
  }
}

/**
 * Creates or updates a generated email
 */
export async function saveGeneratedEmail(
  emailData: Omit<NewGeneratedEmail, 'id' | 'createdAt' | 'updatedAt'>,
  existingEmailId?: number
): Promise<GeneratedEmail> {
  try {
    if (existingEmailId) {
      // Update existing email
      const result = await db
        .update(generatedEmails)
        .set({ ...emailData, updatedAt: new Date() })
        .where(eq(generatedEmails.id, existingEmailId))
        .returning();
      return result[0];
    } else {
      // Create new email
      const result = await db.insert(generatedEmails).values(emailData).returning();
      return result[0];
    }
  } catch (error) {
    console.error('Failed to save generated email:', error);
    throw new Error('Could not save generated email.');
  }
}

/**
 * Updates email status
 */
export async function updateEmailStatus(
  emailId: number,
  status: 'PENDING_APPROVAL' | 'APPROVED'
): Promise<GeneratedEmail | undefined> {
  try {
    const result = await db
      .update(generatedEmails)
      .set({ status, updatedAt: new Date() })
      .where(eq(generatedEmails.id, emailId))
      .returning();
    return result[0];
  } catch (error) {
    console.error('Failed to update email status:', error);
    throw new Error('Could not update email status.');
  }
}

/**
 * Gets email statistics for sessions
 */
export async function getEmailStatsBySessionIds(sessionIds: number[]): Promise<
  Array<{
    sessionId: number;
    totalEmails: number;
    sentEmails: number;
    approvedEmails: number;
  }>
> {
  try {
    if (sessionIds.length === 0) return [];

    const result = await db
      .select({
        sessionId: generatedEmails.sessionId,
        totalEmails: count(),
        sentEmails: sql<number>`COUNT(CASE WHEN ${generatedEmails.isSent} = true THEN 1 END)`,
        approvedEmails: sql<number>`COUNT(CASE WHEN ${generatedEmails.status} = 'APPROVED' THEN 1 END)`,
      })
      .from(generatedEmails)
      .where(inArray(generatedEmails.sessionId, sessionIds))
      .groupBy(generatedEmails.sessionId);

    return result;
  } catch (error) {
    console.error('Failed to get email stats:', error);
    throw new Error('Could not retrieve email statistics.');
  }
}

/**
 * Deletes generated emails by criteria
 */
export async function deleteGeneratedEmails(
  sessionId: number,
  donorIds?: number[]
): Promise<number> {
  try {
    const whereClauses = [eq(generatedEmails.sessionId, sessionId)];
    if (donorIds && donorIds.length > 0) {
      whereClauses.push(inArray(generatedEmails.donorId, donorIds));
    }

    const result = await db
      .delete(generatedEmails)
      .where(and(...whereClauses))
      .returning({ id: generatedEmails.id });

    return result.length;
  } catch (error) {
    console.error('Failed to delete generated emails:', error);
    throw new Error('Could not delete generated emails.');
  }
}

/**
 * Gets sessions by multiple criteria for batch operations
 */
export async function getSessionsByCriteria(
  organizationId: string,
  criteria: {
    sessionIds?: number[];
    statuses?: (keyof typeof EmailGenerationSessionStatus)[];
  }
): Promise<EmailGenerationSession[]> {
  try {
    const whereClauses = [eq(emailGenerationSessions.organizationId, organizationId)];

    if (criteria.sessionIds && criteria.sessionIds.length > 0) {
      whereClauses.push(inArray(emailGenerationSessions.id, criteria.sessionIds));
    }

    if (criteria.statuses && criteria.statuses.length > 0) {
      whereClauses.push(
        or(...criteria.statuses.map((status) => eq(emailGenerationSessions.status, status)))
      );
    }

    const result = await db
      .select()
      .from(emailGenerationSessions)
      .where(and(...whereClauses));

    return result;
  } catch (error) {
    console.error('Failed to get sessions by criteria:', error);
    throw new Error('Could not retrieve sessions.');
  }
}

/**
 * Gets scheduled email jobs for a session
 */
export async function getScheduledEmailJobs(
  sessionId: number,
  organizationId: string
): Promise<Array<InferSelectModel<typeof emailSendJobs>>> {
  try {
    const result = await db
      .select()
      .from(emailSendJobs)
      .where(
        and(
          eq(emailSendJobs.sessionId, sessionId),
          eq(emailSendJobs.organizationId, organizationId),
          eq(emailSendJobs.status, 'scheduled')
        )
      );
    return result;
  } catch (error) {
    console.error('Failed to get scheduled email jobs:', error);
    throw new Error('Could not retrieve scheduled email jobs.');
  }
}
