import { 
  cleanupProcessedMessages,
  generateMessageKey,
  generateMessageHash,
  isRecentlyProcessed,
  markMessageProcessed,
  checkAndMarkMessage
} from '@/app/lib/services/whatsapp/message-deduplication';
import { logger } from '@/app/lib/logger';

// Mock dependencies
jest.mock('@/app/lib/logger');

describe('message-deduplication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear the internal cache by calling cleanup with a very old timestamp
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-01'));
    cleanupProcessedMessages();
    jest.useRealTimers();
  });

  describe('generateMessageKey', () => {
    it('should generate consistent keys for same inputs', () => {
      const message = 'Hello World';
      const phoneNumber = '+1234567890';
      const organizationId = 'org123';

      const key1 = generateMessageKey(message, phoneNumber, organizationId);
      const key2 = generateMessageKey(message, phoneNumber, organizationId);

      expect(key1).toBe(key2);
      expect(key1).toContain(phoneNumber);
      expect(key1).toContain(organizationId);
    });

    it('should generate different keys for different messages', () => {
      const phoneNumber = '+1234567890';
      const organizationId = 'org123';

      const key1 = generateMessageKey('Message 1', phoneNumber, organizationId);
      const key2 = generateMessageKey('Message 2', phoneNumber, organizationId);

      expect(key1).not.toBe(key2);
    });

    it('should normalize message case and whitespace', () => {
      const phoneNumber = '+1234567890';
      const organizationId = 'org123';

      const key1 = generateMessageKey('Hello World', phoneNumber, organizationId);
      const key2 = generateMessageKey('HELLO WORLD', phoneNumber, organizationId);
      const key3 = generateMessageKey('  Hello World  ', phoneNumber, organizationId);

      expect(key1).toBe(key2);
      expect(key1).toBe(key3);
    });

    it('should generate different keys for different phone numbers', () => {
      const message = 'Hello World';
      const organizationId = 'org123';

      const key1 = generateMessageKey(message, '+1234567890', organizationId);
      const key2 = generateMessageKey(message, '+0987654321', organizationId);

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different organizations', () => {
      const message = 'Hello World';
      const phoneNumber = '+1234567890';

      const key1 = generateMessageKey(message, phoneNumber, 'org123');
      const key2 = generateMessageKey(message, phoneNumber, 'org456');

      expect(key1).not.toBe(key2);
    });
  });

  describe('generateMessageHash', () => {
    it('should generate consistent hashes for same message', () => {
      const message = 'Test message';

      const hash1 = generateMessageHash(message);
      const hash2 = generateMessageHash(message);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{32}$/); // MD5 hash format
    });

    it('should normalize message before hashing', () => {
      const hash1 = generateMessageHash('Test Message');
      const hash2 = generateMessageHash('TEST MESSAGE');
      const hash3 = generateMessageHash('  Test Message  ');

      expect(hash1).toBe(hash2);
      expect(hash1).toBe(hash3);
    });

    it('should generate different hashes for different messages', () => {
      const hash1 = generateMessageHash('Message 1');
      const hash2 = generateMessageHash('Message 2');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('isRecentlyProcessed', () => {
    it('should return false for unprocessed message', () => {
      const messageKey = 'test-key';
      const messageHash = 'test-hash';

      const result = isRecentlyProcessed(messageKey, messageHash);

      expect(result).toBe(false);
    });

    it('should return true for recently processed message', () => {
      const messageKey = 'test-key';
      const messageHash = 'test-hash';

      markMessageProcessed(messageKey, messageHash);
      const result = isRecentlyProcessed(messageKey, messageHash);

      expect(result).toBe(true);
    });

    it('should return false for different message hash', () => {
      const messageKey = 'test-key';

      markMessageProcessed(messageKey, 'hash1');
      const result = isRecentlyProcessed(messageKey, 'hash2');

      expect(result).toBe(false);
    });

    it('should return false for expired messages', () => {
      jest.useFakeTimers();
      const now = new Date('2025-01-01 12:00:00');
      jest.setSystemTime(now);

      const messageKey = 'test-key';
      const messageHash = 'test-hash';

      markMessageProcessed(messageKey, messageHash);

      // Move time forward by 6 minutes (past the 5-minute window)
      jest.setSystemTime(new Date('2025-01-01 12:06:00'));

      const result = isRecentlyProcessed(messageKey, messageHash);

      expect(result).toBe(false);
      jest.useRealTimers();
    });

    it('should return true within deduplication window', () => {
      jest.useFakeTimers();
      const now = new Date('2025-01-01 12:00:00');
      jest.setSystemTime(now);

      const messageKey = 'test-key';
      const messageHash = 'test-hash';

      markMessageProcessed(messageKey, messageHash);

      // Move time forward by 4 minutes (within the 5-minute window)
      jest.setSystemTime(new Date('2025-01-01 12:04:00'));

      const result = isRecentlyProcessed(messageKey, messageHash);

      expect(result).toBe(true);
      jest.useRealTimers();
    });
  });

  describe('markMessageProcessed', () => {
    it('should mark message as processed', () => {
      const messageKey = 'test-key';
      const messageHash = 'test-hash';

      markMessageProcessed(messageKey, messageHash);

      expect(isRecentlyProcessed(messageKey, messageHash)).toBe(true);
    });

    it('should update existing message timestamp', () => {
      jest.useFakeTimers();
      const messageKey = 'test-key';
      const messageHash = 'test-hash';

      // Mark at time 1
      jest.setSystemTime(new Date('2025-01-01 12:00:00'));
      markMessageProcessed(messageKey, messageHash);

      // Update at time 2
      jest.setSystemTime(new Date('2025-01-01 12:02:00'));
      markMessageProcessed(messageKey, messageHash);

      // Check at time 3 (should still be valid from second marking)
      jest.setSystemTime(new Date('2025-01-01 12:06:30'));
      expect(isRecentlyProcessed(messageKey, messageHash)).toBe(true);

      jest.useRealTimers();
    });
  });

  describe('cleanupProcessedMessages', () => {
    it('should remove expired messages', () => {
      jest.useFakeTimers();
      
      // Add messages at different times
      jest.setSystemTime(new Date('2025-01-01 12:00:00'));
      markMessageProcessed('key1', 'hash1');

      jest.setSystemTime(new Date('2025-01-01 12:02:00'));
      markMessageProcessed('key2', 'hash2');

      jest.setSystemTime(new Date('2025-01-01 12:04:00'));
      markMessageProcessed('key3', 'hash3');

      // Move to time where only key3 should remain
      jest.setSystemTime(new Date('2025-01-01 12:07:00'));

      cleanupProcessedMessages();

      expect(isRecentlyProcessed('key1', 'hash1')).toBe(false);
      expect(isRecentlyProcessed('key2', 'hash2')).toBe(false);
      expect(isRecentlyProcessed('key3', 'hash3')).toBe(true);

      jest.useRealTimers();
    });

    it('should log cleanup activity when messages are removed', () => {
      jest.useFakeTimers();

      jest.setSystemTime(new Date('2025-01-01 12:00:00'));
      markMessageProcessed('old-key', 'old-hash');

      jest.setSystemTime(new Date('2025-01-01 12:06:00'));
      markMessageProcessed('new-key', 'new-hash');

      cleanupProcessedMessages();

      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Cleaned up 1 expired message entries')
      );

      jest.useRealTimers();
    });

    it('should not log when no messages are cleaned', () => {
      // Start with a fresh state - no messages to clean
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-01-01 12:00:00'));
      
      cleanupProcessedMessages();

      expect(logger.debug).not.toHaveBeenCalled();
      
      jest.useRealTimers();
    });
  });

  describe('checkAndMarkMessage', () => {
    it('should mark new message and return false', () => {
      const message = 'New message';
      const phoneNumber = '+1234567890';
      const organizationId = 'org123';

      const isRetry = checkAndMarkMessage(message, phoneNumber, organizationId);

      expect(isRetry).toBe(false);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('New message marked as processed'),
        expect.objectContaining({
          fromPhoneNumber: phoneNumber,
          organizationId,
          messageHash: expect.any(String),
          cacheSize: 1
        })
      );
    });

    it('should detect duplicate message and return true', () => {
      const message = 'Duplicate message';
      const phoneNumber = '+1234567890';
      const organizationId = 'org123';

      // First call
      checkAndMarkMessage(message, phoneNumber, organizationId);
      jest.clearAllMocks();

      // Second call (duplicate)
      const isRetry = checkAndMarkMessage(message, phoneNumber, organizationId);

      expect(isRetry).toBe(true);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Duplicate message detected'),
        expect.objectContaining({
          fromPhoneNumber: phoneNumber,
          organizationId,
          messageHash: expect.any(String)
        })
      );
    });

    it('should handle messages from different phone numbers separately', () => {
      const message = 'Same message';
      const organizationId = 'org123';

      const isRetry1 = checkAndMarkMessage(message, '+1111111111', organizationId);
      const isRetry2 = checkAndMarkMessage(message, '+2222222222', organizationId);

      expect(isRetry1).toBe(false);
      expect(isRetry2).toBe(false);
    });

    it('should handle messages from different organizations separately', () => {
      const message = 'Same message';
      const phoneNumber = '+1234567890';

      const isRetry1 = checkAndMarkMessage(message, phoneNumber, 'org123');
      const isRetry2 = checkAndMarkMessage(message, phoneNumber, 'org456');

      expect(isRetry1).toBe(false);
      expect(isRetry2).toBe(false);
    });

    it('should perform cleanup during check', () => {
      jest.useFakeTimers();

      // Add old message
      jest.setSystemTime(new Date('2025-01-01 12:00:00'));
      checkAndMarkMessage('old', '+1111111111', 'org123');

      // Check new message after expiry time
      jest.setSystemTime(new Date('2025-01-01 12:06:00'));
      checkAndMarkMessage('new', '+2222222222', 'org123');

      // Old message should be cleaned up
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Cleaned up 1 expired message entries')
      );

      jest.useRealTimers();
    });

    it('should handle normalized messages correctly', () => {
      const phoneNumber = '+1234567890';
      const organizationId = 'org123';

      checkAndMarkMessage('Hello World', phoneNumber, organizationId);
      const isRetry = checkAndMarkMessage('HELLO WORLD', phoneNumber, organizationId);

      expect(isRetry).toBe(true); // Should detect as duplicate due to normalization
    });

    it('should handle concurrent checks properly', () => {
      const message = 'Concurrent message';
      const phoneNumber = '+1234567890';
      const organizationId = 'org123';

      // Simulate concurrent calls
      const results = [];
      for (let i = 0; i < 5; i++) {
        results.push(checkAndMarkMessage(message, phoneNumber, organizationId));
      }

      // Only the first should be marked as new
      expect(results[0]).toBe(false);
      expect(results.slice(1).every(r => r === true)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty messages', () => {
      const phoneNumber = '+1234567890';
      const organizationId = 'org123';

      const key = generateMessageKey('', phoneNumber, organizationId);
      const hash = generateMessageHash('');

      expect(key).toBeDefined();
      expect(hash).toBeDefined();
      expect(checkAndMarkMessage('', phoneNumber, organizationId)).toBe(false);
    });

    it('should handle very long messages', () => {
      const longMessage = 'A'.repeat(10000);
      const phoneNumber = '+1234567890';
      const organizationId = 'org123';

      const key = generateMessageKey(longMessage, phoneNumber, organizationId);
      const hash = generateMessageHash(longMessage);

      expect(key).toBeDefined();
      expect(hash).toBeDefined();
      expect(hash).toMatch(/^[a-f0-9]{32}$/);
    });

    it('should handle special characters in messages', () => {
      const specialMessage = '🎉 Hello! @#$%^&*() <script>alert("test")</script>';
      const phoneNumber = '+1234567890';
      const organizationId = 'org123';

      const isRetry = checkAndMarkMessage(specialMessage, phoneNumber, organizationId);
      expect(isRetry).toBe(false);

      const isRetry2 = checkAndMarkMessage(specialMessage, phoneNumber, organizationId);
      expect(isRetry2).toBe(true);
    });
  });
});