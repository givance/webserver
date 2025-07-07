import { db } from '../db';
import {
  emailScheduleConfig,
  emailSendJobs,
  generatedEmails,
  emailGenerationSessions,
} from '../db/schema';
import { eq, and, gte, isNull, lt, or, sql, inArray } from 'drizzle-orm';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

export type EmailScheduleConfig = InferSelectModel<typeof emailScheduleConfig>;
export type NewEmailScheduleConfig = InferInsertModel<typeof emailScheduleConfig>;
export type EmailSendJob = InferSelectModel<typeof emailSendJobs>;
export type NewEmailSendJob = InferInsertModel<typeof emailSendJobs>;

/**
 * Gets email schedule configuration for an organization
 */
export async function getEmailScheduleConfig(
  organizationId: string
): Promise<EmailScheduleConfig | undefined> {
  try {
    const result = await db
      .select()
      .from(emailScheduleConfig)
      .where(eq(emailScheduleConfig.organizationId, organizationId))
      .limit(1);
    return result[0];
  } catch (error) {
    console.error('Failed to get email schedule config:', error);
    throw new Error('Could not retrieve email schedule configuration.');
  }
}

/**
 * Creates email schedule configuration for an organization
 */
export async function createEmailScheduleConfig(
  configData: Omit<NewEmailScheduleConfig, 'id' | 'createdAt' | 'updatedAt'>
): Promise<EmailScheduleConfig> {
  try {
    const result = await db.insert(emailScheduleConfig).values(configData).returning();
    return result[0];
  } catch (error) {
    console.error('Failed to create email schedule config:', error);
    throw new Error('Could not create email schedule configuration.');
  }
}

/**
 * Updates email schedule configuration for an organization
 */
export async function updateEmailScheduleConfig(
  organizationId: string,
  updates: Partial<
    Omit<NewEmailScheduleConfig, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>
  >
): Promise<EmailScheduleConfig | undefined> {
  try {
    const result = await db
      .update(emailScheduleConfig)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(emailScheduleConfig.organizationId, organizationId))
      .returning();
    return result[0];
  } catch (error) {
    console.error('Failed to update email schedule config:', error);
    throw new Error('Could not update email schedule configuration.');
  }
}

/**
 * Creates an email send job
 */
export async function createEmailSendJob(
  jobData: Omit<NewEmailSendJob, 'id' | 'createdAt' | 'updatedAt'>
): Promise<EmailSendJob> {
  try {
    const result = await db.insert(emailSendJobs).values(jobData).returning();
    return result[0];
  } catch (error) {
    console.error('Failed to create email send job:', error);
    throw new Error('Could not create email send job.');
  }
}

/**
 * Gets email send jobs by criteria
 */
export async function getEmailSendJobs(criteria: {
  sessionId?: number;
  organizationId?: string;
  status?: string;
  scheduledBefore?: Date;
  scheduledAfter?: Date;
}): Promise<EmailSendJob[]> {
  try {
    const whereClauses = [];

    if (criteria.sessionId !== undefined) {
      whereClauses.push(eq(emailSendJobs.sessionId, criteria.sessionId));
    }
    if (criteria.organizationId) {
      whereClauses.push(eq(emailSendJobs.organizationId, criteria.organizationId));
    }
    if (criteria.status) {
      whereClauses.push(eq(emailSendJobs.status, criteria.status));
    }
    if (criteria.scheduledBefore) {
      whereClauses.push(lt(emailSendJobs.scheduledTime, criteria.scheduledBefore));
    }
    if (criteria.scheduledAfter) {
      whereClauses.push(gte(emailSendJobs.scheduledTime, criteria.scheduledAfter));
    }

    const result = await db
      .select()
      .from(emailSendJobs)
      .where(whereClauses.length > 0 ? and(...whereClauses) : undefined);

    return result;
  } catch (error) {
    console.error('Failed to get email send jobs:', error);
    throw new Error('Could not retrieve email send jobs.');
  }
}

/**
 * Updates email send job status
 */
export async function updateEmailSendJobStatus(
  jobId: number,
  status: string,
  additionalData?: {
    sentAt?: Date;
    errorMessage?: string;
    triggerJobId?: string;
  }
): Promise<EmailSendJob | undefined> {
  try {
    const updateData = {
      status,
      updatedAt: new Date(),
      ...additionalData,
    };

    const result = await db
      .update(emailSendJobs)
      .set(updateData)
      .where(eq(emailSendJobs.id, jobId))
      .returning();
    return result[0];
  } catch (error) {
    console.error('Failed to update email send job status:', error);
    throw new Error('Could not update email send job status.');
  }
}

/**
 * Bulk creates email send jobs
 */
export async function bulkCreateEmailSendJobs(
  jobsData: Array<Omit<NewEmailSendJob, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<EmailSendJob[]> {
  try {
    if (jobsData.length === 0) return [];

    const result = await db.insert(emailSendJobs).values(jobsData).returning();
    return result;
  } catch (error) {
    console.error('Failed to bulk create email send jobs:', error);
    throw new Error('Could not create email send jobs.');
  }
}

/**
 * Deletes email send jobs by criteria
 */
export async function deleteEmailSendJobs(criteria: {
  sessionId?: number;
  organizationId?: string;
  status?: string;
  jobIds?: number[];
}): Promise<number> {
  try {
    const whereClauses = [];

    if (criteria.sessionId !== undefined) {
      whereClauses.push(eq(emailSendJobs.sessionId, criteria.sessionId));
    }
    if (criteria.organizationId) {
      whereClauses.push(eq(emailSendJobs.organizationId, criteria.organizationId));
    }
    if (criteria.status) {
      whereClauses.push(eq(emailSendJobs.status, criteria.status));
    }
    if (criteria.jobIds && criteria.jobIds.length > 0) {
      whereClauses.push(inArray(emailSendJobs.id, criteria.jobIds));
    }

    if (whereClauses.length === 0) {
      throw new Error('At least one criteria must be provided for deletion');
    }

    const result = await db
      .delete(emailSendJobs)
      .where(and(...whereClauses))
      .returning({ id: emailSendJobs.id });

    return result.length;
  } catch (error) {
    console.error('Failed to delete email send jobs:', error);
    throw new Error('Could not delete email send jobs.');
  }
}

/**
 * Gets emails available for scheduling from a session
 */
export async function getEmailsForScheduling(
  sessionId: number,
  organizationId: string,
  onlyUnsent: boolean = true
): Promise<Array<InferSelectModel<typeof generatedEmails>>> {
  try {
    const whereClauses = [
      eq(generatedEmails.sessionId, sessionId),
      eq(generatedEmails.status, 'APPROVED'),
    ];

    if (onlyUnsent) {
      whereClauses.push(eq(generatedEmails.isSent, false));
    }

    // Join with session to verify organization
    const result = await db
      .select()
      .from(generatedEmails)
      .innerJoin(emailGenerationSessions, eq(generatedEmails.sessionId, emailGenerationSessions.id))
      .where(and(...whereClauses, eq(emailGenerationSessions.organizationId, organizationId)));

    return result.map((r) => r.generated_emails);
  } catch (error) {
    console.error('Failed to get emails for scheduling:', error);
    throw new Error('Could not retrieve emails for scheduling.');
  }
}

/**
 * Updates generated email send status
 */
export async function updateGeneratedEmailSendStatus(
  emailId: number,
  updates: {
    isSent?: boolean;
    sentAt?: Date;
    sendStatus?: string;
  }
): Promise<InferSelectModel<typeof generatedEmails> | undefined> {
  try {
    const result = await db
      .update(generatedEmails)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(generatedEmails.id, emailId))
      .returning();
    return result[0];
  } catch (error) {
    console.error('Failed to update generated email send status:', error);
    throw new Error('Could not update email send status.');
  }
}

/**
 * Gets daily email count for an organization on a specific date
 */
export async function getDailyEmailCount(organizationId: string, date: Date): Promise<number> {
  try {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(emailSendJobs)
      .where(
        and(
          eq(emailSendJobs.organizationId, organizationId),
          gte(emailSendJobs.scheduledTime, startOfDay),
          lt(emailSendJobs.scheduledTime, endOfDay)
        )
      );

    return Number(result[0]?.count || 0);
  } catch (error) {
    console.error('Failed to get daily email count:', error);
    throw new Error('Could not retrieve daily email count.');
  }
}
