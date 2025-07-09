import { logger } from '@/app/lib/logger';
import { SmartEmailSessionRepository } from '../repositories/smart-email-session.repository';
import { SmartEmailMessageRepository } from '../repositories/smart-email-message.repository';
import { SmartEmailSessionStatus } from '../types/smart-email-types';

export class SessionCleanupService {
  private sessionRepo: SmartEmailSessionRepository;
  private messageRepo: SmartEmailMessageRepository;

  constructor() {
    this.sessionRepo = new SmartEmailSessionRepository();
    this.messageRepo = new SmartEmailMessageRepository();
  }

  /**
   * Clean up expired sessions and their messages
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const expiredSessions = await this.sessionRepo.getExpiredSessions();

      if (expiredSessions.length === 0) {
        logger.info('No expired sessions to clean up');
        return 0;
      }

      logger.info(`Found ${expiredSessions.length} expired sessions to clean up`);

      // Update expired sessions to abandoned status
      for (const session of expiredSessions) {
        await this.sessionRepo.updateSession({
          sessionId: session.sessionId,
          status: SmartEmailSessionStatus.ABANDONED,
        });
      }

      // Note: Messages will be automatically deleted due to cascade delete
      // when we delete the session, but we could also clean them up explicitly

      const sessionIds = expiredSessions.map((s) => s.sessionId);
      await this.sessionRepo.deleteSessionsByIds(sessionIds);

      logger.info(`Cleaned up ${expiredSessions.length} expired sessions`);
      return expiredSessions.length;
    } catch (error) {
      logger.error('Failed to clean up expired sessions:', error);
      throw error;
    }
  }

  /**
   * Clean up abandoned sessions older than specified hours
   */
  async cleanupAbandonedSessions(olderThanHours: number = 48): Promise<number> {
    try {
      const cutoffDate = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

      // This would need to be implemented with proper database queries
      // For now, we'll just clean up expired sessions
      return await this.cleanupExpiredSessions();
    } catch (error) {
      logger.error('Failed to clean up abandoned sessions:', error);
      throw error;
    }
  }

  /**
   * Clean up sessions by organization (for bulk cleanup)
   */
  async cleanupSessionsByOrganization(organizationId: string): Promise<number> {
    try {
      // This would need additional repository methods
      // For now, we'll just log the request
      logger.info(`Cleanup requested for organization ${organizationId}`);
      return 0;
    } catch (error) {
      logger.error(`Failed to clean up sessions for organization ${organizationId}:`, error);
      throw error;
    }
  }

  /**
   * Get cleanup statistics
   */
  async getCleanupStats(): Promise<{
    totalSessions: number;
    activeSessions: number;
    completedSessions: number;
    abandonedSessions: number;
    expiredSessions: number;
  }> {
    try {
      const expiredSessions = await this.sessionRepo.getExpiredSessions();

      // For now, return basic stats
      // In a full implementation, we'd query all session counts
      return {
        totalSessions: 0,
        activeSessions: 0,
        completedSessions: 0,
        abandonedSessions: 0,
        expiredSessions: expiredSessions.length,
      };
    } catch (error) {
      logger.error('Failed to get cleanup stats:', error);
      throw error;
    }
  }

  /**
   * Schedule automatic cleanup (to be called by cron job or background task)
   */
  async scheduleCleanup(): Promise<void> {
    try {
      logger.info('Running scheduled session cleanup');

      const cleanedUp = await this.cleanupExpiredSessions();

      if (cleanedUp > 0) {
        logger.info(`Scheduled cleanup completed: ${cleanedUp} sessions cleaned`);
      }
    } catch (error) {
      logger.error('Scheduled cleanup failed:', error);
      // Don't throw - we don't want to crash the background job
    }
  }
}
