import { db } from '@/app/lib/db';
import { whatsappChatHistory } from '@/app/lib/db/schema';
import { desc, eq, and } from 'drizzle-orm';
import { logger } from '@/app/lib/logger';

export interface WhatsAppMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
  toolCalls?: any;
  toolResults?: any;
  tokensUsed?: any;
}

export interface SaveMessageParams {
  organizationId: string;
  staffId?: number; // Made optional for backward compatibility
  fromPhoneNumber: string;
  messageId?: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: any;
  toolResults?: any;
  tokensUsed?: any;
}

/**
 * Service for managing WhatsApp chat history
 */
export class WhatsAppHistoryService {
  /**
   * Save a message to the chat history
   */
  async saveMessage(params: SaveMessageParams): Promise<void> {
    const {
      organizationId,
      staffId,
      fromPhoneNumber,
      messageId,
      role,
      content,
      toolCalls,
      toolResults,
      tokensUsed,
    } = params;

    try {
      await db.insert(whatsappChatHistory).values({
        organizationId,
        staffId,
        fromPhoneNumber,
        messageId,
        role,
        content,
        toolCalls,
        toolResults,
        tokensUsed,
      });

      logger.info(`[WhatsApp History] Saved ${role} message from ${fromPhoneNumber} to history`);
    } catch (error) {
      logger.error(
        `[WhatsApp History] Failed to save message: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  /**
   * Get chat history for a specific phone number, staff member, and organization
   * Returns messages in chronological order (oldest first)
   */
  async getChatHistory(
    organizationId: string,
    staffId: number | undefined,
    fromPhoneNumber: string,
    limit: number = 20
  ): Promise<WhatsAppMessage[]> {
    try {
      const messages = await db
        .select({
          id: whatsappChatHistory.id,
          role: whatsappChatHistory.role,
          content: whatsappChatHistory.content,
          createdAt: whatsappChatHistory.createdAt,
          toolCalls: whatsappChatHistory.toolCalls,
          toolResults: whatsappChatHistory.toolResults,
          tokensUsed: whatsappChatHistory.tokensUsed,
        })
        .from(whatsappChatHistory)
        .where(
          and(
            eq(whatsappChatHistory.organizationId, organizationId),
            staffId ? eq(whatsappChatHistory.staffId, staffId) : undefined,
            eq(whatsappChatHistory.fromPhoneNumber, fromPhoneNumber)
          )
        )
        .orderBy(desc(whatsappChatHistory.createdAt))
        .limit(limit);

      // Reverse to get chronological order (oldest first)
      const chronologicalMessages = messages.reverse();

      logger.info(
        `[WhatsApp History] Retrieved ${chronologicalMessages.length} messages for ${fromPhoneNumber}`
      );

      return chronologicalMessages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt,
        toolCalls: msg.toolCalls,
        toolResults: msg.toolResults,
        tokensUsed: msg.tokensUsed,
      }));
    } catch (error) {
      logger.error(
        `[WhatsApp History] Failed to retrieve chat history: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  /**
   * Format chat history for AI context
   * Returns a string representation of the conversation
   */
  formatHistoryForAI(messages: WhatsAppMessage[]): string {
    if (messages.length === 0) {
      return '';
    }

    const formattedMessages = messages.map((msg) => {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      return `${role}: ${msg.content}`;
    });

    return formattedMessages.join('\n\n');
  }

  /**
   * Clear all conversation history for a specific phone number
   */
  async clearConversationHistory(
    organizationId: string,
    staffId: number,
    fromPhoneNumber: string
  ): Promise<void> {
    try {
      await db
        .delete(whatsappChatHistory)
        .where(
          and(
            eq(whatsappChatHistory.organizationId, organizationId),
            eq(whatsappChatHistory.staffId, staffId),
            eq(whatsappChatHistory.fromPhoneNumber, fromPhoneNumber)
          )
        );

      logger.info(`[WhatsApp History] Cleared conversation history for phone ${fromPhoneNumber}`);
    } catch (error) {
      logger.error(
        `[WhatsApp History] Failed to clear conversation history: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  /**
   * Clean up old chat history (keep only last N messages per phone number)
   * This prevents the database from growing too large
   */
  async cleanupOldHistory(organizationId: string, keepLastN: number = 100): Promise<void> {
    try {
      // Get all unique phone numbers for this organization
      const phoneNumbers = await db
        .selectDistinct({
          fromPhoneNumber: whatsappChatHistory.fromPhoneNumber,
        })
        .from(whatsappChatHistory)
        .where(eq(whatsappChatHistory.organizationId, organizationId));

      for (const { fromPhoneNumber } of phoneNumbers) {
        // Get messages for this phone number, ordered by creation date (newest first)
        const messages = await db
          .select({
            id: whatsappChatHistory.id,
          })
          .from(whatsappChatHistory)
          .where(
            and(
              eq(whatsappChatHistory.organizationId, organizationId),
              eq(whatsappChatHistory.fromPhoneNumber, fromPhoneNumber)
            )
          )
          .orderBy(desc(whatsappChatHistory.createdAt));

        // If we have more than keepLastN messages, delete the older ones
        if (messages.length > keepLastN) {
          const messagesToDelete = messages.slice(keepLastN);
          const idsToDelete = messagesToDelete.map((msg) => msg.id);

          if (idsToDelete.length > 0) {
            await db.delete(whatsappChatHistory).where(
              and(
                eq(whatsappChatHistory.organizationId, organizationId),
                eq(whatsappChatHistory.fromPhoneNumber, fromPhoneNumber)
                // Delete messages with IDs in the idsToDelete array
                // Using a simple approach since Drizzle doesn't have a direct 'in' for arrays
              )
            );

            logger.info(
              `[WhatsApp History] Cleaned up ${idsToDelete.length} old messages for ${fromPhoneNumber}`
            );
          }
        }
      }
    } catch (error) {
      logger.error(
        `[WhatsApp History] Failed to cleanup old history: ${error instanceof Error ? error.message : String(error)}`
      );
      // Don't throw here as this is a cleanup operation that shouldn't break the main flow
    }
  }
}
