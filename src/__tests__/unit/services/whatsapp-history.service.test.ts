import { WhatsAppHistoryService, type SaveMessageParams, type WhatsAppMessage } from '@/app/lib/services/whatsapp/whatsapp-history.service';
import { db } from '@/app/lib/db';
import { logger } from '@/app/lib/logger';

// Mock dependencies
jest.mock('@/app/lib/db');
jest.mock('@/app/lib/logger');
jest.mock('drizzle-orm', () => ({
  desc: jest.fn((column) => ({ type: 'desc', column })),
  eq: jest.fn((a, b) => ({ type: 'eq', a, b })),
  and: jest.fn((...conditions) => ({ type: 'and', conditions: conditions.filter(Boolean) })),
  sql: jest.fn((strings, ...values) => ({ type: 'sql', strings, values })),
  relations: jest.fn(() => ({})),
}));

describe('WhatsAppHistoryService', () => {
  let service: WhatsAppHistoryService;

  const mockInsert = jest.fn();
  const mockValues = jest.fn();
  const mockSelect = jest.fn();
  const mockSelectDistinct = jest.fn();
  const mockFrom = jest.fn();
  const mockWhere = jest.fn();
  const mockOrderBy = jest.fn();
  const mockLimit = jest.fn();
  const mockDelete = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WhatsAppHistoryService();

    // Setup mock chains
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockResolvedValue(undefined);

    const mockChainObject = {
      orderBy: mockOrderBy,
      limit: mockLimit,
    };

    mockSelect.mockReturnValue({ from: mockFrom });
    mockSelectDistinct.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue(mockChainObject);
    mockOrderBy.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue([]);

    mockDelete.mockReturnValue({ where: mockWhere });

    (db.insert as jest.Mock).mockImplementation(mockInsert);
    (db.select as jest.Mock).mockImplementation(mockSelect);
    (db.selectDistinct as jest.Mock).mockImplementation(mockSelectDistinct);
    (db.delete as jest.Mock).mockImplementation(mockDelete);
  });

  describe('saveMessage', () => {
    const mockParams: SaveMessageParams = {
      organizationId: 'org123',
      staffId: 10,
      fromPhoneNumber: '+1234567890',
      messageId: 'msg123',
      role: 'user',
      content: 'Hello, I need help',
      toolCalls: { tool: 'search' },
      toolResults: { result: 'found' },
      tokensUsed: { total: 100 },
    };

    it('should save a message successfully', async () => {
      await service.saveMessage(mockParams);

      expect(mockInsert).toHaveBeenCalledWith(expect.any(Object));
      expect(mockValues).toHaveBeenCalledWith({
        organizationId: 'org123',
        staffId: 10,
        fromPhoneNumber: '+1234567890',
        messageId: 'msg123',
        role: 'user',
        content: 'Hello, I need help',
        toolCalls: { tool: 'search' },
        toolResults: { result: 'found' },
        tokensUsed: { total: 100 },
      });
      expect(logger.info).toHaveBeenCalledWith(
        '[WhatsApp History] Saved user message from +1234567890 to history'
      );
    });

    it('should save a message without optional fields', async () => {
      const minimalParams: SaveMessageParams = {
        organizationId: 'org123',
        fromPhoneNumber: '+1234567890',
        role: 'assistant',
        content: 'How can I help you?',
      };

      await service.saveMessage(minimalParams);

      expect(mockValues).toHaveBeenCalledWith({
        organizationId: 'org123',
        staffId: undefined,
        fromPhoneNumber: '+1234567890',
        messageId: undefined,
        role: 'assistant',
        content: 'How can I help you?',
        toolCalls: undefined,
        toolResults: undefined,
        tokensUsed: undefined,
      });
    });

    it('should handle database errors', async () => {
      const error = new Error('Database error');
      mockValues.mockRejectedValue(error);

      await expect(service.saveMessage(mockParams)).rejects.toThrow('Database error');
      expect(logger.error).toHaveBeenCalledWith(
        '[WhatsApp History] Failed to save message: Database error'
      );
    });
  });

  describe('getChatHistory', () => {
    const mockMessages = [
      {
        id: 1,
        role: 'user' as const,
        content: 'Hello',
        createdAt: new Date('2024-01-01T10:00:00Z'),
        toolCalls: null,
        toolResults: null,
        tokensUsed: null,
      },
      {
        id: 2,
        role: 'assistant' as const,
        content: 'Hi there!',
        createdAt: new Date('2024-01-01T10:01:00Z'),
        toolCalls: { tool: 'greeting' },
        toolResults: { result: 'success' },
        tokensUsed: { total: 50 },
      },
    ];

    beforeEach(() => {
      // Return messages in reverse order (newest first, as from DB)
      mockLimit.mockResolvedValue([...mockMessages].reverse());
    });

    it('should retrieve chat history with all parameters', async () => {
      const result = await service.getChatHistory('org123', 10, '+1234567890', 20);

      expect(result).toEqual(mockMessages); // Should be in chronological order
      expect(mockSelect).toHaveBeenCalledWith({
        id: expect.any(Object),
        role: expect.any(Object),
        content: expect.any(Object),
        createdAt: expect.any(Object),
        toolCalls: expect.any(Object),
        toolResults: expect.any(Object),
        tokensUsed: expect.any(Object),
      });
      expect(mockWhere).toHaveBeenCalledWith({
        type: 'and',
        conditions: [
          { type: 'eq', a: expect.any(Object), b: 'org123' },
          { type: 'eq', a: expect.any(Object), b: 10 },
          { type: 'eq', a: expect.any(Object), b: '+1234567890' },
        ],
      });
      expect(mockOrderBy).toHaveBeenCalledWith({ type: 'desc', column: expect.any(Object) });
      expect(mockLimit).toHaveBeenCalledWith(20);
      expect(logger.info).toHaveBeenCalledWith(
        '[WhatsApp History] Retrieved 2 messages for +1234567890'
      );
    });

    it('should handle undefined staffId', async () => {
      await service.getChatHistory('org123', undefined, '+1234567890', 10);

      expect(mockWhere).toHaveBeenCalledWith({
        type: 'and',
        conditions: [
          { type: 'eq', a: expect.any(Object), b: 'org123' },
          { type: 'eq', a: expect.any(Object), b: '+1234567890' },
        ],
      });
    });

    it('should use default limit when not specified', async () => {
      await service.getChatHistory('org123', 10, '+1234567890');

      expect(mockLimit).toHaveBeenCalledWith(20);
    });

    it('should return empty array when no messages found', async () => {
      mockLimit.mockResolvedValue([]);

      const result = await service.getChatHistory('org123', 10, '+1234567890');

      expect(result).toEqual([]);
      expect(logger.info).toHaveBeenCalledWith(
        '[WhatsApp History] Retrieved 0 messages for +1234567890'
      );
    });

    it('should handle database errors', async () => {
      const error = new Error('Database error');
      mockLimit.mockRejectedValue(error);

      await expect(
        service.getChatHistory('org123', 10, '+1234567890')
      ).rejects.toThrow('Database error');
      expect(logger.error).toHaveBeenCalledWith(
        '[WhatsApp History] Failed to retrieve chat history: Database error'
      );
    });

    it('should preserve message properties including nulls', async () => {
      const messagesWithNulls = [
        {
          id: 3,
          role: 'user' as const,
          content: 'Test',
          createdAt: new Date(),
          toolCalls: null,
          toolResults: null,
          tokensUsed: null,
        },
      ];
      mockLimit.mockResolvedValue(messagesWithNulls);

      const result = await service.getChatHistory('org123', 10, '+1234567890');

      expect(result[0]).toMatchObject({
        id: 3,
        role: 'user',
        content: 'Test',
        toolCalls: null,
        toolResults: null,
        tokensUsed: null,
      });
    });
  });

  describe('formatHistoryForAI', () => {
    it('should format messages for AI context', () => {
      const messages: WhatsAppMessage[] = [
        {
          id: 1,
          role: 'user',
          content: 'What is the weather?',
          createdAt: new Date(),
        },
        {
          id: 2,
          role: 'assistant',
          content: 'I can help you check the weather.',
          createdAt: new Date(),
        },
        {
          id: 3,
          role: 'user',
          content: 'In New York',
          createdAt: new Date(),
        },
      ];

      const result = service.formatHistoryForAI(messages);

      expect(result).toBe(
        'User: What is the weather?\n\n' +
        'Assistant: I can help you check the weather.\n\n' +
        'User: In New York'
      );
    });

    it('should return empty string for empty history', () => {
      const result = service.formatHistoryForAI([]);

      expect(result).toBe('');
    });

    it('should handle single message', () => {
      const messages: WhatsAppMessage[] = [
        {
          id: 1,
          role: 'user',
          content: 'Hello',
          createdAt: new Date(),
        },
      ];

      const result = service.formatHistoryForAI(messages);

      expect(result).toBe('User: Hello');
    });
  });

  describe('cleanupOldHistory', () => {
    beforeEach(() => {
      // Reset mocks for cleanup tests
      mockSelectDistinct.mockReset();
      mockSelect.mockReset();
      mockFrom.mockReset();
      mockWhere.mockReset();
      mockOrderBy.mockReset();
      mockDelete.mockReset();

      // Setup base mock chain for selectDistinct
      mockSelectDistinct.mockReturnValue({ from: mockFrom });
      mockFrom.mockReturnValue({
        where: jest.fn().mockResolvedValue([
          { fromPhoneNumber: '+1111111111' },
          { fromPhoneNumber: '+2222222222' },
        ]),
      });

      // Setup base mock chain for select
      mockSelect.mockReturnValue({ from: mockFrom });
      mockFrom.mockReturnValue({ where: mockWhere });
      mockWhere.mockReturnValue({ orderBy: mockOrderBy });

      // Setup delete mock
      mockDelete.mockReturnValue({ where: mockWhere });
      mockWhere.mockResolvedValue(undefined);
    });

    it('should cleanup old messages when exceeding limit', async () => {
      // Setup separate mocks for this test
      const mockSelectDistinctFrom = jest.fn();
      const mockSelectFrom = jest.fn();
      
      mockSelectDistinct.mockReturnValue({ from: mockSelectDistinctFrom });
      mockSelectDistinctFrom.mockReturnValue({
        where: jest.fn().mockResolvedValue([
          { fromPhoneNumber: '+1111111111' },
          { fromPhoneNumber: '+2222222222' },
        ]),
      });

      mockSelect.mockReturnValue({ from: mockSelectFrom });
      mockSelectFrom.mockReturnValue({ where: mockWhere });
      mockWhere.mockReturnValue({ orderBy: mockOrderBy });

      // Mock messages for first phone number (more than limit)
      const phone1Messages = Array.from({ length: 150 }, (_, i) => ({ id: i + 1 }));
      
      // Mock messages for second phone number (less than limit)
      const phone2Messages = Array.from({ length: 50 }, (_, i) => ({ id: i + 200 }));

      // Setup mock responses for each phone number query
      mockOrderBy
        .mockResolvedValueOnce(phone1Messages) // First phone number
        .mockResolvedValueOnce(phone2Messages); // Second phone number

      await service.cleanupOldHistory('org123', 100);

      // Should query for distinct phone numbers
      expect(mockSelectDistinct).toHaveBeenCalledWith({
        fromPhoneNumber: expect.any(Object),
      });

      // Should query messages for each phone number
      expect(mockSelect).toHaveBeenCalledTimes(2);

      // Should only delete for the first phone number (which has >100 messages)
      expect(mockDelete).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(
        '[WhatsApp History] Cleaned up 50 old messages for +1111111111'
      );
    });

    it('should not delete when messages are within limit', async () => {
      // Mock messages within limit
      const messages = Array.from({ length: 80 }, (_, i) => ({ id: i + 1 }));
      mockOrderBy.mockResolvedValue(messages);

      await service.cleanupOldHistory('org123', 100);

      expect(mockDelete).not.toHaveBeenCalled();
    });

    it('should use default keepLastN value', async () => {
      // Setup separate mocks for this test
      const mockSelectDistinctFrom = jest.fn();
      const mockSelectFrom = jest.fn();
      
      mockSelectDistinct.mockReturnValue({ from: mockSelectDistinctFrom });
      mockSelectDistinctFrom.mockReturnValue({
        where: jest.fn().mockResolvedValue([
          { fromPhoneNumber: '+1111111111' },
        ]),
      });

      mockSelect.mockReturnValue({ from: mockSelectFrom });
      mockSelectFrom.mockReturnValue({ where: mockWhere });
      mockWhere.mockReturnValue({ orderBy: mockOrderBy });

      const messages = Array.from({ length: 120 }, (_, i) => ({ id: i + 1 }));
      mockOrderBy.mockResolvedValue(messages);

      await service.cleanupOldHistory('org123');

      expect(mockDelete).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(
        '[WhatsApp History] Cleaned up 20 old messages for +1111111111'
      );
    });

    it('should handle errors gracefully without throwing', async () => {
      const error = new Error('Database error');
      mockFrom.mockImplementationOnce(() => {
        throw error;
      });

      // Should not throw
      await expect(service.cleanupOldHistory('org123')).resolves.not.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        '[WhatsApp History] Failed to cleanup old history: Database error'
      );
    });

    it('should handle empty phone numbers list', async () => {
      const mockSelectDistinctFrom = jest.fn();
      
      mockSelectDistinct.mockReturnValue({ from: mockSelectDistinctFrom });
      mockSelectDistinctFrom.mockReturnValue({
        where: jest.fn().mockResolvedValue([]),
      });

      await service.cleanupOldHistory('org123');

      expect(mockSelect).not.toHaveBeenCalled();
      expect(mockDelete).not.toHaveBeenCalled();
    });
  });
});