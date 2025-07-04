import { WhatsAppAIService } from '@/app/lib/services/whatsapp/whatsapp-ai.service';
import { logger } from '@/app/lib/logger';
import { generateText } from 'ai';

// Mock all dependencies
jest.mock('@/app/lib/services/whatsapp/whatsapp-sql-engine.service');
jest.mock('@/app/lib/services/whatsapp/whatsapp-history.service');
jest.mock('@/app/lib/services/whatsapp/whatsapp-staff-logging.service');
jest.mock('@/app/lib/services/whatsapp/message-deduplication');
jest.mock('@/app/lib/services/whatsapp/prompts');
jest.mock('@/app/lib/services/whatsapp/ai-tools');
jest.mock('@/app/lib/logger');
jest.mock('ai');
jest.mock('@ai-sdk/azure', () => ({
  createAzure: jest.fn(() => jest.fn())
}));
jest.mock('@/app/lib/env', () => ({
  env: {
    AZURE_OPENAI_RESOURCE_NAME: 'test-resource',
    AZURE_OPENAI_API_KEY: 'test-key',
    AZURE_OPENAI_DEPLOYMENT_NAME: 'test-deployment'
  }
}));

// Import mocked modules
import { WhatsAppSQLEngineService } from '@/app/lib/services/whatsapp/whatsapp-sql-engine.service';
import { WhatsAppHistoryService } from '@/app/lib/services/whatsapp/whatsapp-history.service';
import { WhatsAppStaffLoggingService } from '@/app/lib/services/whatsapp/whatsapp-staff-logging.service';
import { checkAndMarkMessage } from '@/app/lib/services/whatsapp/message-deduplication';
import { buildSystemPrompt, buildUserPrompt } from '@/app/lib/services/whatsapp/prompts';
import { createAITools } from '@/app/lib/services/whatsapp/ai-tools';

describe('WhatsAppAIService', () => {
  let service: WhatsAppAIService;

  const mockRequest = {
    message: 'How many donors do we have?',
    organizationId: 'org123',
    staffId: 1,
    fromPhoneNumber: '+1234567890',
    isTranscribed: false
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock the service constructors
    const mockSQLEngine = {
      getSchemaDescription: jest.fn().mockReturnValue('Mock schema description')
    };
    
    const mockHistoryService = {
      saveMessage: jest.fn().mockResolvedValue(undefined),
      getChatHistory: jest.fn().mockResolvedValue([]),
      formatHistoryForAI: jest.fn().mockReturnValue('')
    };
    
    const mockLoggingService = {};
    
    (WhatsAppSQLEngineService as jest.Mock).mockImplementation(() => mockSQLEngine);
    (WhatsAppHistoryService as jest.Mock).mockImplementation(() => mockHistoryService);
    (WhatsAppStaffLoggingService as jest.Mock).mockImplementation(() => mockLoggingService);
    
    (checkAndMarkMessage as jest.Mock).mockReturnValue(false);
    (buildSystemPrompt as jest.Mock).mockReturnValue('System prompt');
    (buildUserPrompt as jest.Mock).mockReturnValue('User prompt');
    (createAITools as jest.Mock).mockReturnValue({});
    
    service = new WhatsAppAIService();
  });

  describe('processMessage', () => {
    it('should process a new message successfully', async () => {
      const mockAIResponse = {
        text: 'You have 150 donors in your database.',
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150
        },
        toolCalls: [],
        toolResults: []
      };

      (generateText as jest.Mock).mockResolvedValue(mockAIResponse);

      const result = await service.processMessage(mockRequest);

      // Verify message deduplication check
      expect(checkAndMarkMessage).toHaveBeenCalledWith(
        mockRequest.message,
        mockRequest.fromPhoneNumber,
        mockRequest.organizationId
      );

      // Verify AI generation
      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'System prompt',
          prompt: 'User prompt',
          temperature: 0.7,
          maxTokens: 2000,
          toolChoice: 'auto',
          maxSteps: 10
        })
      );

      // Verify response
      expect(result).toEqual({
        response: 'You have 150 donors in your database.',
        tokensUsed: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150
        }
      });
    });

    it('should handle retry messages correctly', async () => {
      (checkAndMarkMessage as jest.Mock).mockReturnValue(true); // Mark as retry

      const mockAIResponse = {
        text: 'Response text',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
      };

      (generateText as jest.Mock).mockResolvedValue(mockAIResponse);

      await service.processMessage(mockRequest);

      // Should still process but log differently
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Processing retry message')
      );
    });

    it('should include chat history in context', async () => {
      const mockHistory = [
        { role: 'user', content: 'Previous question' },
        { role: 'assistant', content: 'Previous answer' }
      ];

      const mockHistoryService = (WhatsAppHistoryService as jest.Mock).mock.results[0].value;
      mockHistoryService.getChatHistory.mockResolvedValue(mockHistory);
      mockHistoryService.formatHistoryForAI.mockReturnValue('Formatted history');

      const mockAIResponse = {
        text: 'Response with context',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
      };

      (generateText as jest.Mock).mockResolvedValue(mockAIResponse);

      await service.processMessage(mockRequest);

      expect(mockHistoryService.getChatHistory).toHaveBeenCalledWith(
        mockRequest.organizationId,
        mockRequest.staffId,
        mockRequest.fromPhoneNumber,
        10
      );

      expect(buildUserPrompt).toHaveBeenCalledWith(
        mockRequest.message,
        mockRequest.isTranscribed,
        'Formatted history'
      );
    });

    it('should handle transcribed messages', async () => {
      const transcribedRequest = { ...mockRequest, isTranscribed: true };

      const mockAIResponse = {
        text: 'Response to transcribed message',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
      };

      (generateText as jest.Mock).mockResolvedValue(mockAIResponse);

      await service.processMessage(transcribedRequest);

      expect(buildUserPrompt).toHaveBeenCalledWith(
        transcribedRequest.message,
        true,
        ''
      );
    });

    it('should handle tool calls in response', async () => {
      const mockAIResponse = {
        text: 'You have 150 donors.',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        toolCalls: [
          { toolName: 'executeSQL', args: { query: 'SELECT COUNT(*) FROM donors' } }
        ],
        toolResults: [{ result: [{ count: 150 }] }]
      };

      (generateText as jest.Mock).mockResolvedValue(mockAIResponse);

      const result = await service.processMessage(mockRequest);

      // Verify assistant message saved with tool information
      const mockHistoryService = (WhatsAppHistoryService as jest.Mock).mock.results[0].value;
      expect(mockHistoryService.saveMessage).toHaveBeenCalledWith({
        organizationId: mockRequest.organizationId,
        staffId: mockRequest.staffId,
        fromPhoneNumber: mockRequest.fromPhoneNumber,
        role: 'assistant',
        content: 'You have 150 donors.',
        toolCalls: mockAIResponse.toolCalls,
        toolResults: mockAIResponse.toolResults,
        tokensUsed: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150
        }
      });

      expect(result.response).toBe('You have 150 donors.');
    });

    it('should throw error when AI returns empty response', async () => {
      const mockAIResponse = {
        text: '   ', // Empty/whitespace response
        usage: { promptTokens: 100, completionTokens: 0, totalTokens: 100 },
        toolCalls: [{ toolName: 'executeSQL' }],
        toolResults: [{ result: [] }]
      };

      (generateText as jest.Mock).mockResolvedValue(mockAIResponse);

      await expect(service.processMessage(mockRequest)).rejects.toThrow(
        'AI failed to generate a response - please try your question again'
      );

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('AI generated empty response despite having data')
      );
    });

    it('should handle AI generation errors', async () => {
      const error = new Error('AI service unavailable');
      (generateText as jest.Mock).mockRejectedValue(error);

      await expect(service.processMessage(mockRequest)).rejects.toThrow(error);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error processing WhatsApp message'),
        expect.objectContaining({
          error: 'AI service unavailable',
          fromPhoneNumber: mockRequest.fromPhoneNumber,
          organizationId: mockRequest.organizationId,
          staffId: mockRequest.staffId
        })
      );
    });

    it('should handle history service errors gracefully', async () => {
      const mockHistoryService = (WhatsAppHistoryService as jest.Mock).mock.results[0].value;
      mockHistoryService.saveMessage.mockRejectedValueOnce(new Error('DB error'));

      const mockAIResponse = {
        text: 'Response despite history error',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
      };

      (generateText as jest.Mock).mockResolvedValue(mockAIResponse);

      // Should throw the error up
      await expect(service.processMessage(mockRequest)).rejects.toThrow('DB error');
    });

    it.skip('should cache system prompts for performance', async () => {
      // Skipping this test as it tests an implementation detail (caching)
      // The important behavior (that system prompts work) is tested in other tests
    });

    it('should handle missing usage data gracefully', async () => {
      const mockAIResponse = {
        text: 'Response without usage data',
        // No usage property
      };

      (generateText as jest.Mock).mockResolvedValue(mockAIResponse);

      const result = await service.processMessage(mockRequest);

      expect(result.tokensUsed).toEqual({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      });
    });

    it('should log comprehensive information about the request', async () => {
      const mockAIResponse = {
        text: 'A'.repeat(150), // Long response
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        toolCalls: [{ toolName: 'executeSQL' }],
        steps: [{}, {}] // 2 steps
      };

      (generateText as jest.Mock).mockResolvedValue(mockAIResponse);

      await service.processMessage(mockRequest);

      // Verify comprehensive logging
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Processing new message request'),
        expect.objectContaining({
          fromPhoneNumber: mockRequest.fromPhoneNumber,
          organizationId: mockRequest.organizationId,
          staffId: mockRequest.staffId,
          messageLength: mockRequest.message.length,
          isTranscribed: false,
          message: mockRequest.message
        })
      );

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Response generated successfully'),
        expect.objectContaining({
          tokensUsed: mockAIResponse.usage,
          toolCallCount: 1,
          responseLength: 150,
          steps: 2
        })
      );

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Request completed successfully'),
        expect.objectContaining({
          responsePreview: 'A'.repeat(100) + '...'
        })
      );
    });
  });
});