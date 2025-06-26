/**
 * Message deduplication utility for WhatsApp webhooks
 * Prevents duplicate processing of retried messages
 */

import crypto from "crypto";
import { logger } from "@/app/lib/logger";

interface ProcessedMessage {
  timestamp: number;
  messageHash: string;
}

// Track processed messages to avoid duplicate logging (5 minute window)
const processedMessages = new Map<string, ProcessedMessage>();
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Clean up old entries from the processed messages cache
 */
export function cleanupProcessedMessages(): void {
  const now = Date.now();
  const cutoff = now - DEDUP_WINDOW_MS;
  let cleanedCount = 0;

  for (const [key, value] of processedMessages.entries()) {
    if (value.timestamp < cutoff) {
      processedMessages.delete(key);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    logger.debug(`[Message Dedup] Cleaned up ${cleanedCount} expired message entries, ${processedMessages.size} remaining`);
  }
}

/**
 * Generate a unique key for message deduplication
 */
export function generateMessageKey(message: string, fromPhoneNumber: string, organizationId: string): string {
  const messageHash = crypto.createHash("md5").update(message.trim().toLowerCase()).digest("hex");
  return `${fromPhoneNumber}:${organizationId}:${messageHash}`;
}

/**
 * Generate a hash of the message content
 */
export function generateMessageHash(message: string): string {
  return crypto.createHash("md5").update(message.trim().toLowerCase()).digest("hex");
}

/**
 * Check if this message was recently processed (within deduplication window)
 */
export function isRecentlyProcessed(messageKey: string, messageHash: string): boolean {
  cleanupProcessedMessages();

  const existing = processedMessages.get(messageKey);
  if (!existing) {
    return false;
  }

  // Check if it's the same message hash and within the time window
  const now = Date.now();
  return existing.messageHash === messageHash && now - existing.timestamp < DEDUP_WINDOW_MS;
}

/**
 * Mark a message as processed
 */
export function markMessageProcessed(messageKey: string, messageHash: string): void {
  processedMessages.set(messageKey, {
    timestamp: Date.now(),
    messageHash,
  });
}

/**
 * Helper to check and mark message in one operation
 * Returns true if this is a retry (message was already processed)
 */
export function checkAndMarkMessage(message: string, fromPhoneNumber: string, organizationId: string): boolean {
  const messageKey = generateMessageKey(message, fromPhoneNumber, organizationId);
  const messageHash = generateMessageHash(message);
  
  const isRetry = isRecentlyProcessed(messageKey, messageHash);
  
  if (!isRetry) {
    markMessageProcessed(messageKey, messageHash);
    logger.debug(`[Message Dedup] New message marked as processed`, {
      fromPhoneNumber,
      organizationId,
      messageHash,
      cacheSize: processedMessages.size
    });
  } else {
    logger.debug(`[Message Dedup] Duplicate message detected`, {
      fromPhoneNumber,
      organizationId,
      messageHash
    });
  }
  
  return isRetry;
}