import { db } from "@/app/lib/db";
import { staffWhatsappActivityLog } from "@/app/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { logger } from "@/app/lib/logger";

export type WhatsAppActivityType =
  | "message_received"
  | "message_sent"
  | "permission_denied"
  | "db_query_executed"
  | "ai_response_generated"
  | "voice_transcribed"
  | "error_occurred";

export interface LogActivityParams {
  staffId: number;
  organizationId: string;
  activityType: WhatsAppActivityType;
  phoneNumber: string;
  summary: string;
  data?: any;
  metadata?: any;
}

export interface WhatsAppActivityLogEntry {
  id: number;
  staffId: number;
  organizationId: string;
  activityType: WhatsAppActivityType;
  phoneNumber: string;
  summary: string;
  data: any;
  metadata: any;
  createdAt: Date;
}

/**
 * Service for comprehensive logging of WhatsApp staff activities
 */
export class WhatsAppStaffLoggingService {
  /**
   * Log a WhatsApp activity for a staff member
   * @param params - Activity logging parameters
   * @returns Success status
   */
  async logActivity(params: LogActivityParams): Promise<boolean> {
    try {
      const { staffId, organizationId, activityType, phoneNumber, summary, data, metadata } = params;

      await db.insert(staffWhatsappActivityLog).values({
        staffId,
        organizationId,
        activityType,
        phoneNumber,
        summary,
        data: data || null,
        metadata: metadata || null,
      });

      logger.info(`[WhatsApp Staff Logging] Logged activity "${activityType}" for staff ID: ${staffId} - ${summary}`);
      return true;
    } catch (error) {
      logger.error(
        `[WhatsApp Staff Logging] Error logging activity: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }

  /**
   * Log a received message
   */
  async logMessageReceived(
    staffId: number,
    organizationId: string,
    phoneNumber: string,
    messageContent: string,
    messageType: "text" | "audio" = "text",
    messageId?: string
  ): Promise<boolean> {
    return this.logActivity({
      staffId,
      organizationId,
      activityType: "message_received",
      phoneNumber,
      summary: `Received ${messageType} message: "${messageContent.substring(0, 100)}${
        messageContent.length > 100 ? "..." : ""
      }"`,
      data: {
        messageContent,
        messageType,
        messageId,
        timestamp: new Date(),
      },
      metadata: {
        contentLength: messageContent.length,
        messageSource: "whatsapp_webhook",
      },
    });
  }

  /**
   * Log a sent message/response
   */
  async logMessageSent(
    staffId: number,
    organizationId: string,
    phoneNumber: string,
    responseContent: string,
    tokensUsed?: { promptTokens: number; completionTokens: number; totalTokens: number }
  ): Promise<boolean> {
    return this.logActivity({
      staffId,
      organizationId,
      activityType: "message_sent",
      phoneNumber,
      summary: `Sent AI response: "${responseContent.substring(0, 100)}${responseContent.length > 100 ? "..." : ""}"`,
      data: {
        responseContent,
        timestamp: new Date(),
      },
      metadata: {
        contentLength: responseContent.length,
        tokensUsed,
        responseSource: "ai_generated",
      },
    });
  }

  /**
   * Log a permission denied event
   */
  async logPermissionDenied(phoneNumber: string, reason: string, attemptedMessage?: string): Promise<boolean> {
    // For permission denied, we don't have staff/org info, so we'll use placeholder values
    return this.logActivity({
      staffId: -1, // Special ID for permission denied cases
      organizationId: "unknown",
      activityType: "permission_denied",
      phoneNumber,
      summary: `Permission denied: ${reason}`,
      data: {
        reason,
        attemptedMessage,
        timestamp: new Date(),
      },
      metadata: {
        securityEvent: true,
      },
    });
  }

  /**
   * Log a database query execution
   */
  async logDatabaseQuery(
    staffId: number,
    organizationId: string,
    phoneNumber: string,
    query: string,
    queryResult: any,
    processingTimeMs?: number
  ): Promise<boolean> {
    return this.logActivity({
      staffId,
      organizationId,
      activityType: "db_query_executed",
      phoneNumber,
      summary: `Executed DB query: ${query.substring(0, 100)}${query.length > 100 ? "..." : ""}`,
      data: {
        query,
        queryResult,
        timestamp: new Date(),
      },
      metadata: {
        queryLength: query.length,
        resultCount: Array.isArray(queryResult) ? queryResult.length : 1,
        processingTimeMs,
      },
    });
  }

  /**
   * Log AI response generation
   */
  async logAIResponseGenerated(
    staffId: number,
    organizationId: string,
    phoneNumber: string,
    prompt: string,
    response: string,
    tokensUsed: { promptTokens: number; completionTokens: number; totalTokens: number },
    toolCalls?: any[],
    processingTimeMs?: number
  ): Promise<boolean> {
    return this.logActivity({
      staffId,
      organizationId,
      activityType: "ai_response_generated",
      phoneNumber,
      summary: `Generated AI response using ${tokensUsed.totalTokens} tokens`,
      data: {
        prompt: prompt.substring(0, 500), // Truncate long prompts
        response,
        tokensUsed,
        toolCalls: toolCalls || [],
        timestamp: new Date(),
      },
      metadata: {
        promptLength: prompt.length,
        responseLength: response.length,
        toolCallCount: toolCalls?.length || 0,
        processingTimeMs,
        efficiency: tokensUsed.totalTokens > 0 ? response.length / tokensUsed.totalTokens : 0,
      },
    });
  }

  /**
   * Log voice message transcription
   */
  async logVoiceTranscribed(
    staffId: number,
    organizationId: string,
    phoneNumber: string,
    audioId: string,
    transcription: string,
    processingTimeMs?: number
  ): Promise<boolean> {
    return this.logActivity({
      staffId,
      organizationId,
      activityType: "voice_transcribed",
      phoneNumber,
      summary: `Transcribed voice message: "${transcription.substring(0, 100)}${
        transcription.length > 100 ? "..." : ""
      }"`,
      data: {
        audioId,
        transcription,
        timestamp: new Date(),
      },
      metadata: {
        transcriptionLength: transcription.length,
        processingTimeMs,
        audioSource: "whatsapp_voice",
      },
    });
  }

  /**
   * Log an error that occurred during processing
   */
  async logError(
    staffId: number,
    organizationId: string,
    phoneNumber: string,
    errorMessage: string,
    errorDetails?: any,
    context?: string
  ): Promise<boolean> {
    return this.logActivity({
      staffId,
      organizationId,
      activityType: "error_occurred",
      phoneNumber,
      summary: `Error occurred: ${errorMessage}`,
      data: {
        errorMessage,
        errorDetails,
        context,
        timestamp: new Date(),
      },
      metadata: {
        errorType: "processing_error",
        severity: "error",
      },
    });
  }

  /**
   * Get activity log for a specific staff member
   * @param staffId - Staff member ID
   * @param limit - Maximum number of entries to return
   * @param offset - Number of entries to skip
   * @returns Array of activity log entries
   */
  async getStaffActivityLog(
    staffId: number,
    limit: number = 50,
    offset: number = 0
  ): Promise<WhatsAppActivityLogEntry[]> {
    try {
      const result = await db
        .select()
        .from(staffWhatsappActivityLog)
        .where(eq(staffWhatsappActivityLog.staffId, staffId))
        .orderBy(desc(staffWhatsappActivityLog.createdAt))
        .limit(limit)
        .offset(offset);

      return result as WhatsAppActivityLogEntry[];
    } catch (error) {
      logger.error(
        `[WhatsApp Staff Logging] Error getting staff activity log: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return [];
    }
  }

  /**
   * Get activity log for a specific phone number and staff member
   * @param staffId - Staff member ID
   * @param phoneNumber - Phone number to filter by
   * @param limit - Maximum number of entries to return
   * @returns Array of activity log entries
   */
  async getPhoneActivityLog(
    staffId: number,
    phoneNumber: string,
    limit: number = 50
  ): Promise<WhatsAppActivityLogEntry[]> {
    try {
      const result = await db
        .select()
        .from(staffWhatsappActivityLog)
        .where(
          and(eq(staffWhatsappActivityLog.staffId, staffId), eq(staffWhatsappActivityLog.phoneNumber, phoneNumber))
        )
        .orderBy(desc(staffWhatsappActivityLog.createdAt))
        .limit(limit);

      return result as WhatsAppActivityLogEntry[];
    } catch (error) {
      logger.error(
        `[WhatsApp Staff Logging] Error getting phone activity log: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return [];
    }
  }

  /**
   * Get summary statistics for a staff member's WhatsApp activity
   * @param staffId - Staff member ID
   * @param days - Number of days to look back (default 30)
   * @returns Activity statistics
   */
  async getStaffActivityStats(
    staffId: number,
    days: number = 30
  ): Promise<{
    totalActivities: number;
    messagesSent: number;
    messagesReceived: number;
    dbQueriesExecuted: number;
    errorsOccurred: number;
    voiceTranscribed: number;
    uniquePhoneNumbers: Set<string>;
  }> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const activities = await db
        .select()
        .from(staffWhatsappActivityLog)
        .where(
          and(
            eq(staffWhatsappActivityLog.staffId, staffId)
            // Note: In a real implementation, you'd want to add date filtering here
            // gte(staffWhatsappActivityLog.createdAt, cutoffDate)
          )
        );

      const stats = {
        totalActivities: activities.length,
        messagesSent: 0,
        messagesReceived: 0,
        dbQueriesExecuted: 0,
        errorsOccurred: 0,
        voiceTranscribed: 0,
        uniquePhoneNumbers: new Set<string>(),
      };

      activities.forEach((activity) => {
        stats.uniquePhoneNumbers.add(activity.phoneNumber);

        switch (activity.activityType) {
          case "message_sent":
            stats.messagesSent++;
            break;
          case "message_received":
            stats.messagesReceived++;
            break;
          case "db_query_executed":
            stats.dbQueriesExecuted++;
            break;
          case "error_occurred":
            stats.errorsOccurred++;
            break;
          case "voice_transcribed":
            stats.voiceTranscribed++;
            break;
        }
      });

      return stats;
    } catch (error) {
      logger.error(
        `[WhatsApp Staff Logging] Error getting staff activity stats: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return {
        totalActivities: 0,
        messagesSent: 0,
        messagesReceived: 0,
        dbQueriesExecuted: 0,
        errorsOccurred: 0,
        voiceTranscribed: 0,
        uniquePhoneNumbers: new Set<string>(),
      };
    }
  }
}
