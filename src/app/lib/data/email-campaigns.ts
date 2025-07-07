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
      const statusCondition = or(
        ...criteria.statuses.map((status) => eq(emailGenerationSessions.status, status))
      );
      if (statusCondition) {
        whereClauses.push(statusCondition);
      }
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

/**
 * Gets session status with minimal data
 */
export async function getSessionStatus(
  sessionId: number,
  organizationId: string
): Promise<{ id: number; status: string; totalDonors: number; completedDonors: number } | null> {
  try {
    const session = await db.query.emailGenerationSessions.findFirst({
      where: and(
        eq(emailGenerationSessions.id, sessionId),
        eq(emailGenerationSessions.organizationId, organizationId)
      ),
      columns: {
        status: true,
        totalDonors: true,
        completedDonors: true,
        id: true,
      },
    });
    return session || null;
  } catch (error) {
    console.error('Failed to get session status:', error);
    throw new Error('Could not retrieve session status.');
  }
}

/**
 * Checks if session exists with minimal columns
 */
export async function checkSessionExists(
  sessionId: number,
  organizationId: string
): Promise<boolean> {
  try {
    const session = await db.query.emailGenerationSessions.findFirst({
      where: and(
        eq(emailGenerationSessions.id, sessionId),
        eq(emailGenerationSessions.organizationId, organizationId)
      ),
      columns: { id: true },
    });
    return !!session;
  } catch (error) {
    console.error('Failed to check session exists:', error);
    throw new Error('Could not check session existence.');
  }
}

/**
 * Gets email by session and donor
 */
export async function getEmailBySessionAndDonor(
  sessionId: number,
  donorId: number
): Promise<{ id: number } | null> {
  try {
    const email = await db.query.generatedEmails.findFirst({
      where: and(eq(generatedEmails.sessionId, sessionId), eq(generatedEmails.donorId, donorId)),
      columns: { id: true },
    });
    return email || null;
  } catch (error) {
    console.error('Failed to get email by session and donor:', error);
    throw new Error('Could not retrieve email.');
  }
}

/**
 * Updates generated email by ID
 */
export async function updateGeneratedEmail(
  emailId: number,
  updateData: Partial<Omit<NewGeneratedEmail, 'id' | 'createdAt'>>
): Promise<GeneratedEmail> {
  try {
    const result = await db
      .update(generatedEmails)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(generatedEmails.id, emailId))
      .returning();
    return result[0];
  } catch (error) {
    console.error('Failed to update generated email:', error);
    throw new Error('Could not update generated email.');
  }
}

/**
 * Creates a new generated email
 */
export async function createGeneratedEmail(
  emailData: Omit<NewGeneratedEmail, 'id' | 'createdAt' | 'updatedAt'>
): Promise<GeneratedEmail> {
  try {
    const result = await db.insert(generatedEmails).values(emailData).returning();
    return result[0];
  } catch (error) {
    console.error('Failed to create generated email:', error);
    throw new Error('Could not create generated email.');
  }
}

/**
 * Counts emails by session and status
 */
export async function countEmailsBySessionAndStatus(
  sessionId: number,
  status: 'PENDING_APPROVAL' | 'APPROVED'
): Promise<number> {
  try {
    const result = await db
      .select({ count: count() })
      .from(generatedEmails)
      .where(and(eq(generatedEmails.sessionId, sessionId), eq(generatedEmails.status, status)));
    return result[0]?.count || 0;
  } catch (error) {
    console.error('Failed to count emails by session and status:', error);
    throw new Error('Could not count emails.');
  }
}

/**
 * Gets donor IDs with emails for a session
 */
export async function getDonorIdsWithEmails(
  sessionId: number,
  status?: 'PENDING_APPROVAL' | 'APPROVED'
): Promise<number[]> {
  try {
    const whereClauses = [eq(generatedEmails.sessionId, sessionId)];
    if (status) {
      whereClauses.push(eq(generatedEmails.status, status));
    }

    const result = await db
      .select({ donorId: generatedEmails.donorId })
      .from(generatedEmails)
      .where(and(...whereClauses));

    return result.map((e) => e.donorId);
  } catch (error) {
    console.error('Failed to get donor IDs with emails:', error);
    throw new Error('Could not retrieve donor IDs.');
  }
}

/**
 * Checks if draft session exists by name
 */
export async function getDraftSessionByName(
  organizationId: string,
  campaignName: string
): Promise<EmailGenerationSession | null> {
  try {
    const draft = await db
      .select()
      .from(emailGenerationSessions)
      .where(
        and(
          eq(emailGenerationSessions.organizationId, organizationId),
          eq(emailGenerationSessions.jobName, campaignName),
          eq(emailGenerationSessions.status, EmailGenerationSessionStatus.DRAFT)
        )
      )
      .limit(1);
    return draft[0] || null;
  } catch (error) {
    console.error('Failed to get draft session by name:', error);
    throw new Error('Could not retrieve draft session.');
  }
}

/**
 * Gets donor IDs with existing emails (both PENDING_APPROVAL and APPROVED)
 */
export async function getDonorIdsWithExistingEmails(sessionId: number): Promise<number[]> {
  try {
    const result = await db
      .select({ donorId: generatedEmails.donorId })
      .from(generatedEmails)
      .where(
        and(
          eq(generatedEmails.sessionId, sessionId),
          or(eq(generatedEmails.status, 'PENDING_APPROVAL'), eq(generatedEmails.status, 'APPROVED'))
        )
      );

    return result.map((e) => e.donorId);
  } catch (error) {
    console.error('Failed to get donor IDs with existing emails:', error);
    throw new Error('Could not retrieve donor IDs.');
  }
}

/**
 * Updates email status for multiple emails
 */
export async function updateEmailStatusBulk(
  sessionId: number,
  fromStatus: 'PENDING_APPROVAL' | 'APPROVED',
  toStatus: 'PENDING_APPROVAL' | 'APPROVED',
  additionalUpdates?: Partial<Omit<NewGeneratedEmail, 'id' | 'createdAt'>>
): Promise<void> {
  try {
    await db
      .update(generatedEmails)
      .set({
        status: toStatus,
        ...additionalUpdates,
        updatedAt: new Date(),
      })
      .where(and(eq(generatedEmails.sessionId, sessionId), eq(generatedEmails.status, fromStatus)));
  } catch (error) {
    console.error('Failed to update email status in bulk:', error);
    throw new Error('Could not update email status.');
  }
}

/**
 * Gets email with organization check
 */
export async function getEmailWithOrganizationCheck(
  emailId: number,
  organizationId: string
): Promise<{ id: number; isSent: boolean; sentAt: Date | null } | null> {
  try {
    const [email] = await db
      .select({
        id: generatedEmails.id,
        isSent: generatedEmails.isSent,
        sentAt: generatedEmails.sentAt,
      })
      .from(generatedEmails)
      .innerJoin(emailGenerationSessions, eq(generatedEmails.sessionId, emailGenerationSessions.id))
      .where(
        and(
          eq(generatedEmails.id, emailId),
          eq(emailGenerationSessions.organizationId, organizationId)
        )
      )
      .limit(1);

    return email || null;
  } catch (error) {
    console.error('Failed to get email with organization check:', error);
    throw new Error('Could not retrieve email.');
  }
}

/**
 * Gets full email generation session with relations
 */
export async function getFullSessionById(
  sessionId: number,
  organizationId: string
): Promise<any | null> {
  try {
    const session = await db.query.emailGenerationSessions.findFirst({
      where: and(
        eq(emailGenerationSessions.id, sessionId),
        eq(emailGenerationSessions.organizationId, organizationId)
      ),
    });
    return session || null;
  } catch (error) {
    console.error('Failed to get full session:', error);
    throw new Error('Could not retrieve session.');
  }
}

/**
 * Gets email by ID with minimal columns for existence check
 */
export async function checkEmailExists(sessionId: number, donorId: number): Promise<boolean> {
  try {
    const email = await db.query.generatedEmails.findFirst({
      where: and(eq(generatedEmails.sessionId, sessionId), eq(generatedEmails.donorId, donorId)),
      columns: { id: true },
    });
    return !!email;
  } catch (error) {
    console.error('Failed to check email exists:', error);
    throw new Error('Could not check email existence.');
  }
}

/**
 * Counts total sessions by organization and status
 */
export async function countSessionsByOrganization(
  organizationId: string,
  status?: keyof typeof EmailGenerationSessionStatus
): Promise<number> {
  try {
    const whereClauses = [eq(emailGenerationSessions.organizationId, organizationId)];
    if (status) {
      whereClauses.push(eq(emailGenerationSessions.status, status));
    }

    const result = await db
      .select({ count: count() })
      .from(emailGenerationSessions)
      .where(and(...whereClauses));

    return result[0]?.count || 0;
  } catch (error) {
    console.error('Failed to count sessions by organization:', error);
    throw new Error('Could not count sessions.');
  }
}

/**
 * Gets email with session for authorization check
 */
export async function getEmailWithSessionAuth(
  emailId: number,
  organizationId: string
): Promise<{
  id: number;
  sessionId: number;
  isSent: boolean;
  currentStatus: 'PENDING_APPROVAL' | 'APPROVED';
} | null> {
  try {
    const [existingEmail] = await db
      .select({
        id: generatedEmails.id,
        sessionId: generatedEmails.sessionId,
        isSent: generatedEmails.isSent,
        currentStatus: generatedEmails.status,
      })
      .from(generatedEmails)
      .innerJoin(emailGenerationSessions, eq(generatedEmails.sessionId, emailGenerationSessions.id))
      .where(
        and(
          eq(generatedEmails.id, emailId),
          eq(emailGenerationSessions.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!existingEmail) {
      return null;
    }

    return {
      ...existingEmail,
      currentStatus: existingEmail.currentStatus as 'PENDING_APPROVAL' | 'APPROVED',
    };
  } catch (error) {
    console.error('Failed to get email with session auth:', error);
    throw new Error('Could not retrieve email.');
  }
}

/**
 * Updates generated email content
 */
export async function updateGeneratedEmailContent(
  emailId: number,
  updateData: {
    subject: string;
    structuredContent?: any;
    referenceContexts?: any;
    emailContent?: string;
    status?: 'PENDING_APPROVAL' | 'APPROVED';
  }
): Promise<GeneratedEmail | undefined> {
  try {
    const result = await db
      .update(generatedEmails)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(generatedEmails.id, emailId))
      .returning();
    return result[0];
  } catch (error) {
    console.error('Failed to update generated email content:', error);
    throw new Error('Could not update email content.');
  }
}

/**
 * Gets emails by session with donor info
 */
export async function getEmailsBySessionWithDonor(
  sessionId: number,
  donorIds?: number[]
): Promise<Array<GeneratedEmail & { donor?: any }>> {
  try {
    const whereClauses = [eq(generatedEmails.sessionId, sessionId)];
    if (donorIds && donorIds.length > 0) {
      whereClauses.push(inArray(generatedEmails.donorId, donorIds));
    }

    const emails = await db.query.generatedEmails.findMany({
      where: and(...whereClauses),
      with: {
        donor: true,
      },
    });

    return emails;
  } catch (error) {
    console.error('Failed to get emails by session with donor:', error);
    throw new Error('Could not retrieve emails.');
  }
}

/**
 * Marks emails as sent
 */
export async function markEmailsAsSent(
  emailIds: number[],
  sentAt: Date = new Date()
): Promise<void> {
  try {
    if (emailIds.length === 0) return;

    await db
      .update(generatedEmails)
      .set({
        isSent: true,
        sentAt,
        sendStatus: 'sent',
        updatedAt: new Date(),
      })
      .where(inArray(generatedEmails.id, emailIds));
  } catch (error) {
    console.error('Failed to mark emails as sent:', error);
    throw new Error('Could not mark emails as sent.');
  }
}

/**
 * Updates send status for an email
 */
export async function updateEmailSendStatus(
  emailId: number,
  sendStatus: string,
  errorMessage?: string
): Promise<void> {
  try {
    const updateData: any = {
      sendStatus,
      updatedAt: new Date(),
    };

    if (errorMessage) {
      updateData.sendErrorMessage = errorMessage;
    }

    await db.update(generatedEmails).set(updateData).where(eq(generatedEmails.id, emailId));
  } catch (error) {
    console.error('Failed to update email send status:', error);
    throw new Error('Could not update email send status.');
  }
}

/**
 * Updates multiple sessions in batch
 */
export async function updateSessionsBatch(
  updates: Array<{
    sessionId: number;
    status: 'DRAFT' | 'GENERATING' | 'READY_TO_SEND' | 'COMPLETED';
    completedDonors: number;
    completedAt?: Date;
  }>
): Promise<void> {
  try {
    if (updates.length === 0) return;

    // Use a transaction to update all sessions
    await db.transaction(async (tx) => {
      for (const update of updates) {
        await tx
          .update(emailGenerationSessions)
          .set({
            status: update.status,
            completedDonors: update.completedDonors,
            completedAt: update.completedAt,
            updatedAt: new Date(),
          })
          .where(eq(emailGenerationSessions.id, update.sessionId));
      }
    });
  } catch (error) {
    console.error('Failed to update sessions in batch:', error);
    throw new Error('Could not update sessions.');
  }
}
