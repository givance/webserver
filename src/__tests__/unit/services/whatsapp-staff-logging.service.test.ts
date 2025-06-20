import { WhatsAppStaffLoggingService, type LogActivityParams, type WhatsAppActivityType } from '@/app/lib/services/whatsapp-staff-logging.service';
import { db } from '@/app/lib/db';
import { logger } from '@/app/lib/logger';

// Mock dependencies
jest.mock('@/app/lib/db');
jest.mock('@/app/lib/logger');
jest.mock('drizzle-orm', () => ({
  eq: jest.fn((a, b) => ({ type: 'eq', a, b })),
  and: jest.fn((...conditions) => ({ type: 'and', conditions })),
  desc: jest.fn((column) => ({ type: 'desc', column })),
  sql: jest.fn((strings, ...values) => ({ type: 'sql', strings, values })),
  relations: jest.fn(() => ({})),
}));

describe('WhatsAppStaffLoggingService', () => {
  let service: WhatsAppStaffLoggingService;

  const mockInsert = jest.fn();
  const mockValues = jest.fn();
  const mockSelect = jest.fn();
  const mockFrom = jest.fn();
  const mockWhere = jest.fn();
  const mockOrderBy = jest.fn();
  const mockLimit = jest.fn();
  const mockOffset = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WhatsAppStaffLoggingService();

    // Setup mock chains
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockResolvedValue(undefined);

    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockOrderBy.mockReturnValue({ limit: mockLimit });
    mockLimit.mockReturnValue({ offset: mockOffset });
    mockOffset.mockResolvedValue([]);

    (db.insert as jest.Mock).mockImplementation(mockInsert);
    (db.select as jest.Mock).mockImplementation(mockSelect);
  });

  describe('logActivity', () => {
    const mockParams: LogActivityParams = {
      staffId: 10,
      organizationId: 'org123',
      activityType: 'message_received',
      phoneNumber: '+1234567890',
      summary: 'Test activity',
      data: { test: 'data' },
      metadata: { test: 'metadata' },
    };

    it('should log activity successfully', async () => {
      const result = await service.logActivity(mockParams);

      expect(result).toBe(true);
      expect(mockInsert).toHaveBeenCalledWith(expect.any(Object));
      expect(mockValues).toHaveBeenCalledWith({
        staffId: 10,
        organizationId: 'org123',
        activityType: 'message_received',
        phoneNumber: '+1234567890',
        summary: 'Test activity',
        data: { test: 'data' },
        metadata: { test: 'metadata' },
      });
      expect(logger.info).toHaveBeenCalledWith(
        '[WhatsApp Staff Logging] Logged activity "message_received" for staff ID: 10 - Test activity'
      );
    });

    it('should handle null data and metadata', async () => {
      const paramsWithoutData: LogActivityParams = {
        ...mockParams,
        data: undefined,
        metadata: undefined,
      };

      await service.logActivity(paramsWithoutData);

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          data: null,
          metadata: null,
        })
      );
    });

    it('should handle database errors gracefully', async () => {
      mockValues.mockRejectedValue(new Error('Database error'));

      const result = await service.logActivity(mockParams);

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        '[WhatsApp Staff Logging] Error logging activity: Database error'
      );
    });
  });

  describe('logMessageReceived', () => {
    it('should log text message received', async () => {
      const result = await service.logMessageReceived(
        10,
        'org123',
        '+1234567890',
        'Hello, I need help with my donation',
        'text',
        'msg123'
      );

      expect(result).toBe(true);
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          activityType: 'message_received',
          summary: 'Received text message: "Hello, I need help with my donation"',
          data: expect.objectContaining({
            messageContent: 'Hello, I need help with my donation',
            messageType: 'text',
            messageId: 'msg123',
          }),
          metadata: expect.objectContaining({
            contentLength: 35,
            messageSource: 'whatsapp_webhook',
          }),
        })
      );
    });

    it('should truncate long messages in summary', async () => {
      const longMessage = 'a'.repeat(150);
      
      await service.logMessageReceived(10, 'org123', '+1234567890', longMessage);

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: `Received text message: "${'a'.repeat(100)}..."`,
          data: expect.objectContaining({
            messageContent: longMessage,
          }),
        })
      );
    });

    it('should handle audio messages', async () => {
      await service.logMessageReceived(
        10,
        'org123',
        '+1234567890',
        'Audio message transcript',
        'audio'
      );

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: 'Received audio message: "Audio message transcript"',
          data: expect.objectContaining({
            messageType: 'audio',
          }),
        })
      );
    });
  });

  describe('logMessageSent', () => {
    it('should log sent message with token usage', async () => {
      const tokensUsed = {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      };

      const result = await service.logMessageSent(
        10,
        'org123',
        '+1234567890',
        'Here is the information you requested',
        tokensUsed
      );

      expect(result).toBe(true);
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          activityType: 'message_sent',
          summary: 'Sent AI response: "Here is the information you requested"',
          metadata: expect.objectContaining({
            tokensUsed,
            responseSource: 'ai_generated',
          }),
        })
      );
    });

    it('should handle missing token usage', async () => {
      await service.logMessageSent(
        10,
        'org123',
        '+1234567890',
        'Response without tokens'
      );

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            tokensUsed: undefined,
          }),
        })
      );
    });
  });

  describe('logAIResponseGenerated', () => {
    it('should log AI response generation with tool calls', async () => {
      const tokensUsed = { promptTokens: 200, completionTokens: 100, totalTokens: 300 };
      const toolCalls = [{ name: 'search', args: {} }];

      const result = await service.logAIResponseGenerated(
        10,
        'org123',
        '+1234567890',
        'What is the total donations for John Doe?',
        'John Doe has donated $5,000 total',
        tokensUsed,
        toolCalls,
        500
      );

      expect(result).toBe(true);
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          activityType: 'ai_response_generated',
          summary: 'Generated AI response using 300 tokens',
          data: expect.objectContaining({
            prompt: 'What is the total donations for John Doe?',
            response: 'John Doe has donated $5,000 total',
            tokensUsed,
            toolCalls,
          }),
          metadata: expect.objectContaining({
            toolCallCount: 1,
            processingTimeMs: 500,
            efficiency: expect.any(Number),
          }),
        })
      );
    });

    it('should truncate long prompts', async () => {
      const longPrompt = 'a'.repeat(600);
      const tokensUsed = { promptTokens: 100, completionTokens: 50, totalTokens: 150 };

      await service.logAIResponseGenerated(
        10,
        'org123',
        '+1234567890',
        longPrompt,
        'Response',
        tokensUsed
      );

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            prompt: 'a'.repeat(500),
          }),
          metadata: expect.objectContaining({
            promptLength: 600,
          }),
        })
      );
    });
  });

  describe('logPermissionDenied', () => {
    it('should log permission denied with special values', async () => {
      const result = await service.logPermissionDenied(
        '+9876543210',
        'Phone number not authorized',
        'Can I see donor list?'
      );

      expect(result).toBe(true);
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          staffId: -1,
          organizationId: 'unknown',
          activityType: 'permission_denied',
          phoneNumber: '+9876543210',
          summary: 'Permission denied: Phone number not authorized',
          data: expect.objectContaining({
            reason: 'Phone number not authorized',
            attemptedMessage: 'Can I see donor list?',
          }),
          metadata: expect.objectContaining({
            securityEvent: true,
          }),
        })
      );
    });
  });

  describe('logDatabaseQuery', () => {
    it('should log database query execution', async () => {
      const queryResult = [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }];

      const result = await service.logDatabaseQuery(
        10,
        'org123',
        '+1234567890',
        'SELECT * FROM donors WHERE organization_id = ?',
        queryResult,
        250
      );

      expect(result).toBe(true);
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          activityType: 'db_query_executed',
          summary: 'Executed DB query: SELECT * FROM donors WHERE organization_id = ?',
          metadata: expect.objectContaining({
            resultCount: 2,
            processingTimeMs: 250,
          }),
        })
      );
    });

    it('should handle non-array query results', async () => {
      await service.logDatabaseQuery(
        10,
        'org123',
        '+1234567890',
        'SELECT COUNT(*) FROM donors',
        { count: 100 }
      );

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            resultCount: 1,
          }),
        })
      );
    });
  });

  describe('logVoiceTranscribed', () => {
    it('should log voice transcription', async () => {
      const result = await service.logVoiceTranscribed(
        10,
        'org123',
        '+1234567890',
        'audio123',
        'Please check my donation status',
        1500
      );

      expect(result).toBe(true);
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          activityType: 'voice_transcribed',
          summary: 'Transcribed voice message: "Please check my donation status"',
          data: expect.objectContaining({
            audioId: 'audio123',
            transcription: 'Please check my donation status',
          }),
          metadata: expect.objectContaining({
            transcriptionLength: 31,
            processingTimeMs: 1500,
            audioSource: 'whatsapp_voice',
          }),
        })
      );
    });
  });

  describe('logError', () => {
    it('should log error with context', async () => {
      const result = await service.logError(
        10,
        'org123',
        '+1234567890',
        'Failed to process message',
        { stack: 'Error stack trace' },
        'message_processing'
      );

      expect(result).toBe(true);
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          activityType: 'error_occurred',
          summary: 'Error occurred: Failed to process message',
          data: expect.objectContaining({
            errorMessage: 'Failed to process message',
            errorDetails: { stack: 'Error stack trace' },
            context: 'message_processing',
          }),
          metadata: expect.objectContaining({
            errorType: 'processing_error',
            severity: 'error',
          }),
        })
      );
    });
  });

  describe('getStaffActivityLog', () => {
    const mockActivities = [
      {
        id: 1,
        staffId: 10,
        organizationId: 'org123',
        activityType: 'message_received' as WhatsAppActivityType,
        phoneNumber: '+1234567890',
        summary: 'Test activity',
        data: {},
        metadata: {},
        createdAt: new Date(),
      },
    ];

    beforeEach(() => {
      mockOffset.mockResolvedValue(mockActivities);
    });

    it('should get staff activity log with pagination', async () => {
      const result = await service.getStaffActivityLog(10, 20, 10);

      expect(result).toEqual(mockActivities);
      expect(mockWhere).toHaveBeenCalledWith({ type: 'eq', a: expect.any(Object), b: 10 });
      expect(mockOrderBy).toHaveBeenCalledWith({ type: 'desc', column: expect.any(Object) });
      expect(mockLimit).toHaveBeenCalledWith(20);
      expect(mockOffset).toHaveBeenCalledWith(10);
    });

    it('should use default values', async () => {
      await service.getStaffActivityLog(10);

      expect(mockLimit).toHaveBeenCalledWith(50);
      expect(mockOffset).toHaveBeenCalledWith(0);
    });

    it('should handle database errors', async () => {
      mockFrom.mockRejectedValue(new Error('Database error'));

      const result = await service.getStaffActivityLog(10);

      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error getting staff activity log')
      );
    });
  });

  describe('getPhoneActivityLog', () => {
    const mockActivities = [
      {
        id: 1,
        staffId: 10,
        organizationId: 'org123',
        activityType: 'message_sent' as WhatsAppActivityType,
        phoneNumber: '+1234567890',
        summary: 'Phone activity',
        data: {},
        metadata: {},
        createdAt: new Date(),
      },
    ];

    beforeEach(() => {
      mockLimit.mockResolvedValue(mockActivities);
    });

    it('should get phone activity log', async () => {
      const result = await service.getPhoneActivityLog(10, '+1234567890', 30);

      expect(result).toEqual(mockActivities);
      expect(mockWhere).toHaveBeenCalledWith({
        type: 'and',
        conditions: [
          { type: 'eq', a: expect.any(Object), b: 10 },
          { type: 'eq', a: expect.any(Object), b: '+1234567890' },
        ],
      });
      expect(mockLimit).toHaveBeenCalledWith(30);
    });

    it('should handle errors gracefully', async () => {
      mockFrom.mockRejectedValue(new Error('Database error'));

      const result = await service.getPhoneActivityLog(10, '+1234567890');

      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getStaffActivityStats', () => {
    const mockActivities = [
      {
        staffId: 10,
        activityType: 'message_sent',
        phoneNumber: '+1111111111',
      },
      {
        staffId: 10,
        activityType: 'message_received',
        phoneNumber: '+1111111111',
      },
      {
        staffId: 10,
        activityType: 'message_received',
        phoneNumber: '+2222222222',
      },
      {
        staffId: 10,
        activityType: 'db_query_executed',
        phoneNumber: '+1111111111',
      },
      {
        staffId: 10,
        activityType: 'error_occurred',
        phoneNumber: '+3333333333',
      },
      {
        staffId: 10,
        activityType: 'voice_transcribed',
        phoneNumber: '+1111111111',
      },
    ];

    beforeEach(() => {
      mockWhere.mockResolvedValue(mockActivities);
    });

    it('should calculate activity statistics correctly', async () => {
      const result = await service.getStaffActivityStats(10, 30);

      expect(result).toEqual({
        totalActivities: 6,
        messagesSent: 1,
        messagesReceived: 2,
        dbQueriesExecuted: 1,
        errorsOccurred: 1,
        voiceTranscribed: 1,
        uniquePhoneNumbers: new Set(['+1111111111', '+2222222222', '+3333333333']),
      });
    });

    it('should handle empty activity list', async () => {
      mockWhere.mockResolvedValue([]);

      const result = await service.getStaffActivityStats(10);

      expect(result).toEqual({
        totalActivities: 0,
        messagesSent: 0,
        messagesReceived: 0,
        dbQueriesExecuted: 0,
        errorsOccurred: 0,
        voiceTranscribed: 0,
        uniquePhoneNumbers: new Set(),
      });
    });

    it('should handle database errors', async () => {
      mockFrom.mockRejectedValue(new Error('Database error'));

      const result = await service.getStaffActivityStats(10);

      expect(result).toEqual({
        totalActivities: 0,
        messagesSent: 0,
        messagesReceived: 0,
        dbQueriesExecuted: 0,
        errorsOccurred: 0,
        voiceTranscribed: 0,
        uniquePhoneNumbers: new Set(),
      });
      expect(logger.error).toHaveBeenCalled();
    });
  });
});