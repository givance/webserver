import { db } from '@/app/lib/db';
import { smartEmailSessions } from '@/app/lib/db/schema';
import { eq, and, lt, desc } from 'drizzle-orm';
import { logger } from '@/app/lib/logger';
import { ErrorHandler } from '@/app/lib/utils/error-handler';
import {
  type SmartEmailSession,
  type NewSmartEmailSession,
  type CreateSmartEmailSessionInput,
  type UpdateSmartEmailSessionInput,
  SmartEmailSessionStatus,
  SmartEmailSessionStep,
} from '../types/smart-email-types';

export class SmartEmailSessionRepository {
  /**
   * Create a new smart email session
   */
  async createSession(input: CreateSmartEmailSessionInput): Promise<SmartEmailSession> {
    try {
      const sessionId = `smart_email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const sessionData: NewSmartEmailSession = {
        sessionId,
        organizationId: input.organizationId,
        userId: input.userId,
        donorIds: input.donorIds,
        initialInstruction: input.initialInstruction,
        status: SmartEmailSessionStatus.ACTIVE,
        currentStep: SmartEmailSessionStep.ANALYZING,
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
      };

      const [session] = await db.insert(smartEmailSessions).values(sessionData).returning();

      logger.info(`Created smart email session: ${sessionId}`);
      return session;
    } catch (error) {
      logger.error('Failed to create smart email session:', error);
      throw ErrorHandler.createError(
        'INTERNAL_SERVER_ERROR',
        'Failed to create smart email session'
      );
    }
  }

  /**
   * Get session by session ID
   */
  async getSessionBySessionId(sessionId: string): Promise<SmartEmailSession | null> {
    try {
      const [session] = await db
        .select()
        .from(smartEmailSessions)
        .where(eq(smartEmailSessions.sessionId, sessionId))
        .limit(1);

      return session || null;
    } catch (error) {
      logger.error(`Failed to get session ${sessionId}:`, error);
      throw ErrorHandler.createError('INTERNAL_SERVER_ERROR', 'Failed to retrieve session');
    }
  }

  /**
   * Get session by database ID
   */
  async getSessionById(id: number): Promise<SmartEmailSession | null> {
    try {
      const [session] = await db
        .select()
        .from(smartEmailSessions)
        .where(eq(smartEmailSessions.id, id))
        .limit(1);

      return session || null;
    } catch (error) {
      logger.error(`Failed to get session by ID ${id}:`, error);
      throw ErrorHandler.createError('INTERNAL_SERVER_ERROR', 'Failed to retrieve session');
    }
  }

  /**
   * Update session data
   */
  async updateSession(input: UpdateSmartEmailSessionInput): Promise<SmartEmailSession> {
    try {
      const updateData: Partial<SmartEmailSession> = {
        updatedAt: new Date(),
      };

      if (input.status) updateData.status = input.status;
      if (input.currentStep) updateData.currentStep = input.currentStep;
      if (input.finalInstruction) updateData.finalInstruction = input.finalInstruction;
      if (input.donorAnalysis) updateData.donorAnalysis = input.donorAnalysis;
      if (input.orgAnalysis) updateData.orgAnalysis = input.orgAnalysis;

      const [session] = await db
        .update(smartEmailSessions)
        .set(updateData)
        .where(eq(smartEmailSessions.sessionId, input.sessionId))
        .returning();

      if (!session) {
        throw ErrorHandler.createError('NOT_FOUND', `Session ${input.sessionId} not found`);
      }

      logger.info(`Updated smart email session: ${input.sessionId}`);
      return session;
    } catch (error) {
      logger.error(`Failed to update session ${input.sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Get active sessions for a user
   */
  async getActiveSessionsForUser(
    userId: string,
    organizationId: string
  ): Promise<SmartEmailSession[]> {
    try {
      const sessions = await db
        .select()
        .from(smartEmailSessions)
        .where(
          and(
            eq(smartEmailSessions.userId, userId),
            eq(smartEmailSessions.organizationId, organizationId),
            eq(smartEmailSessions.status, SmartEmailSessionStatus.ACTIVE)
          )
        )
        .orderBy(desc(smartEmailSessions.createdAt));

      return sessions;
    } catch (error) {
      logger.error(`Failed to get active sessions for user ${userId}:`, error);
      throw ErrorHandler.createError('INTERNAL_SERVER_ERROR', 'Failed to retrieve active sessions');
    }
  }

  /**
   * Get expired sessions for cleanup
   */
  async getExpiredSessions(): Promise<SmartEmailSession[]> {
    try {
      const sessions = await db
        .select()
        .from(smartEmailSessions)
        .where(lt(smartEmailSessions.expiresAt, new Date()))
        .orderBy(desc(smartEmailSessions.expiresAt));

      return sessions;
    } catch (error) {
      logger.error('Failed to get expired sessions:', error);
      throw ErrorHandler.createError(
        'INTERNAL_SERVER_ERROR',
        'Failed to retrieve expired sessions'
      );
    }
  }

  /**
   * Delete session by session ID
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      await db.delete(smartEmailSessions).where(eq(smartEmailSessions.sessionId, sessionId));

      logger.info(`Deleted smart email session: ${sessionId}`);
    } catch (error) {
      logger.error(`Failed to delete session ${sessionId}:`, error);
      throw ErrorHandler.createError('INTERNAL_SERVER_ERROR', 'Failed to delete session');
    }
  }

  /**
   * Delete multiple sessions by IDs
   */
  async deleteSessionsByIds(sessionIds: string[]): Promise<void> {
    try {
      if (sessionIds.length === 0) return;

      await db
        .delete(smartEmailSessions)
        .where(
          sessionIds.length === 1
            ? eq(smartEmailSessions.sessionId, sessionIds[0])
            : sessionIds.reduce(
                (acc, id) => acc || eq(smartEmailSessions.sessionId, id),
                eq(smartEmailSessions.sessionId, sessionIds[0])
              )
        );

      logger.info(`Deleted ${sessionIds.length} smart email sessions`);
    } catch (error) {
      logger.error(`Failed to delete sessions:`, error);
      throw ErrorHandler.createError('INTERNAL_SERVER_ERROR', 'Failed to delete sessions');
    }
  }

  /**
   * Extend session expiration
   */
  async extendSessionExpiry(sessionId: string, hours: number = 24): Promise<void> {
    try {
      const newExpiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

      await db
        .update(smartEmailSessions)
        .set({
          expiresAt: newExpiresAt,
          updatedAt: new Date(),
        })
        .where(eq(smartEmailSessions.sessionId, sessionId));

      logger.info(`Extended session expiry for ${sessionId} to ${newExpiresAt}`);
    } catch (error) {
      logger.error(`Failed to extend session expiry for ${sessionId}:`, error);
      throw ErrorHandler.createError('INTERNAL_SERVER_ERROR', 'Failed to extend session expiry');
    }
  }
}
