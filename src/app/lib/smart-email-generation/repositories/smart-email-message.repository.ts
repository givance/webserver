import { db } from '@/app/lib/db';
import { smartEmailMessages } from '@/app/lib/db/schema';
import { eq, and, asc, desc } from 'drizzle-orm';
import { logger } from '@/app/lib/logger';
import { ErrorHandler } from '@/app/lib/utils/error-handler';
import {
  type SmartEmailMessage,
  type NewSmartEmailMessage,
  type CreateSmartEmailMessageInput,
  MessageRole,
} from '../types/smart-email-types';

export class SmartEmailMessageRepository {
  /**
   * Create a new message in a session
   */
  async createMessage(input: CreateSmartEmailMessageInput): Promise<SmartEmailMessage> {
    try {
      const messageData: NewSmartEmailMessage = {
        sessionId: input.sessionId,
        messageIndex: input.messageIndex,
        role: input.role,
        content: input.content,
        toolCalls: input.toolCalls || null,
        toolResults: input.toolResults || null,
        createdAt: new Date(),
      };

      const [message] = await db.insert(smartEmailMessages).values(messageData).returning();

      logger.info(`Created message ${message.id} in session ${input.sessionId}`);
      return message;
    } catch (error) {
      logger.error('Failed to create smart email message:', error);
      throw ErrorHandler.createError('INTERNAL_SERVER_ERROR', 'Failed to create message');
    }
  }

  /**
   * Get all messages for a session ordered by message index
   */
  async getMessagesBySessionId(sessionId: number): Promise<SmartEmailMessage[]> {
    try {
      const messages = await db
        .select()
        .from(smartEmailMessages)
        .where(eq(smartEmailMessages.sessionId, sessionId))
        .orderBy(asc(smartEmailMessages.messageIndex));

      return messages;
    } catch (error) {
      logger.error(`Failed to get messages for session ${sessionId}:`, error);
      throw ErrorHandler.createError('INTERNAL_SERVER_ERROR', 'Failed to retrieve messages');
    }
  }

  /**
   * Get the latest message in a session
   */
  async getLatestMessageInSession(sessionId: number): Promise<SmartEmailMessage | null> {
    try {
      const [message] = await db
        .select()
        .from(smartEmailMessages)
        .where(eq(smartEmailMessages.sessionId, sessionId))
        .orderBy(desc(smartEmailMessages.messageIndex))
        .limit(1);

      return message || null;
    } catch (error) {
      logger.error(`Failed to get latest message for session ${sessionId}:`, error);
      throw ErrorHandler.createError('INTERNAL_SERVER_ERROR', 'Failed to retrieve latest message');
    }
  }

  /**
   * Get messages by role for a session
   */
  async getMessagesByRole(sessionId: number, role: string): Promise<SmartEmailMessage[]> {
    try {
      const messages = await db
        .select()
        .from(smartEmailMessages)
        .where(and(eq(smartEmailMessages.sessionId, sessionId), eq(smartEmailMessages.role, role)))
        .orderBy(asc(smartEmailMessages.messageIndex));

      return messages;
    } catch (error) {
      logger.error(`Failed to get ${role} messages for session ${sessionId}:`, error);
      throw ErrorHandler.createError(
        'INTERNAL_SERVER_ERROR',
        `Failed to retrieve ${role} messages`
      );
    }
  }

  /**
   * Get the next message index for a session
   */
  async getNextMessageIndex(sessionId: number): Promise<number> {
    try {
      const [latestMessage] = await db
        .select({ messageIndex: smartEmailMessages.messageIndex })
        .from(smartEmailMessages)
        .where(eq(smartEmailMessages.sessionId, sessionId))
        .orderBy(desc(smartEmailMessages.messageIndex))
        .limit(1);

      return latestMessage ? latestMessage.messageIndex + 1 : 0;
    } catch (error) {
      logger.error(`Failed to get next message index for session ${sessionId}:`, error);
      throw ErrorHandler.createError('INTERNAL_SERVER_ERROR', 'Failed to get next message index');
    }
  }

  /**
   * Delete all messages for a session
   */
  async deleteMessagesBySessionId(sessionId: number): Promise<void> {
    try {
      await db.delete(smartEmailMessages).where(eq(smartEmailMessages.sessionId, sessionId));

      logger.info(`Deleted all messages for session ${sessionId}`);
    } catch (error) {
      logger.error(`Failed to delete messages for session ${sessionId}:`, error);
      throw ErrorHandler.createError('INTERNAL_SERVER_ERROR', 'Failed to delete messages');
    }
  }

  /**
   * Delete a specific message by ID
   */
  async deleteMessage(messageId: number): Promise<void> {
    try {
      await db.delete(smartEmailMessages).where(eq(smartEmailMessages.id, messageId));

      logger.info(`Deleted message ${messageId}`);
    } catch (error) {
      logger.error(`Failed to delete message ${messageId}:`, error);
      throw ErrorHandler.createError('INTERNAL_SERVER_ERROR', 'Failed to delete message');
    }
  }

  /**
   * Get conversation history formatted for AI consumption
   */
  async getConversationHistory(sessionId: number): Promise<
    Array<{
      role: 'user' | 'assistant' | 'system';
      content: string;
    }>
  > {
    try {
      const messages = await this.getMessagesBySessionId(sessionId);

      return messages.map((message) => ({
        role: message.role as 'user' | 'assistant' | 'system',
        content: message.content,
      }));
    } catch (error) {
      logger.error(`Failed to get conversation history for session ${sessionId}:`, error);
      throw ErrorHandler.createError(
        'INTERNAL_SERVER_ERROR',
        'Failed to retrieve conversation history'
      );
    }
  }

  /**
   * Count messages in a session
   */
  async countMessagesInSession(sessionId: number): Promise<number> {
    try {
      const result = await db
        .select({ count: smartEmailMessages.id })
        .from(smartEmailMessages)
        .where(eq(smartEmailMessages.sessionId, sessionId));

      return result.length;
    } catch (error) {
      logger.error(`Failed to count messages for session ${sessionId}:`, error);
      throw ErrorHandler.createError('INTERNAL_SERVER_ERROR', 'Failed to count messages');
    }
  }

  /**
   * Get messages with tool calls
   */
  async getMessagesWithToolCalls(sessionId: number): Promise<SmartEmailMessage[]> {
    try {
      const messages = await db
        .select()
        .from(smartEmailMessages)
        .where(
          and(
            eq(smartEmailMessages.sessionId, sessionId)
            // Check if toolCalls is not null
            // Note: This is a simplified check - in real implementation you might want to use a proper SQL function
          )
        )
        .orderBy(asc(smartEmailMessages.messageIndex));

      // Filter in JavaScript since complex JSONB queries can be tricky
      return messages.filter((message) => message.toolCalls !== null);
    } catch (error) {
      logger.error(`Failed to get messages with tool calls for session ${sessionId}:`, error);
      throw ErrorHandler.createError(
        'INTERNAL_SERVER_ERROR',
        'Failed to retrieve messages with tool calls'
      );
    }
  }

  /**
   * Add a user message to the conversation
   */
  async addUserMessage(sessionId: number, content: string): Promise<SmartEmailMessage> {
    try {
      const messageIndex = await this.getNextMessageIndex(sessionId);

      return await this.createMessage({
        sessionId,
        messageIndex,
        role: MessageRole.USER,
        content,
      });
    } catch (error) {
      logger.error(`Failed to add user message to session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Add an assistant message to the conversation
   */
  async addAssistantMessage(
    sessionId: number,
    content: string,
    toolCalls?: any[],
    toolResults?: any[]
  ): Promise<SmartEmailMessage> {
    try {
      const messageIndex = await this.getNextMessageIndex(sessionId);

      return await this.createMessage({
        sessionId,
        messageIndex,
        role: MessageRole.ASSISTANT,
        content,
        toolCalls,
        toolResults,
      });
    } catch (error) {
      logger.error(`Failed to add assistant message to session ${sessionId}:`, error);
      throw error;
    }
  }
}
