import { createDonorActionInsightsTool } from '@/app/lib/services/whatsapp/donor-action-insights-tool';
import { db } from '@/app/lib/db';
import { logger } from '@/app/lib/logger';
import { generateText } from 'ai';

// Mock dependencies
jest.mock('@/app/lib/db');
jest.mock('@/app/lib/logger');
jest.mock('ai');
jest.mock('@ai-sdk/azure', () => ({
  createAzure: jest.fn(() => jest.fn())
}));

describe('donor-action-insights-tool', () => {
  let mockDb: any;
  let mockLoggingService: any;

  const testConfig = {
    organizationId: 'org123',
    staffId: 1,
    fromPhoneNumber: '+1234567890'
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock logging service
    mockLoggingService = {
      logActivity: jest.fn().mockResolvedValue(undefined)
    };

    // Create mock query builder
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockResolvedValue([])
    };

    (db.select as jest.Mock).mockReturnValue(mockDb);
  });

  describe('createDonorActionInsightsTool', () => {
    it('should create tool with analyzeActionNeeded function', () => {
      const tool = createDonorActionInsightsTool(testConfig.organizationId);

      expect(tool).toHaveProperty('analyzeActionNeeded');
      expect(tool.analyzeActionNeeded).toHaveProperty('description');
      expect(tool.analyzeActionNeeded).toHaveProperty('parameters');
      expect(tool.analyzeActionNeeded).toHaveProperty('execute');
    });
  });

  describe('analyzeActionNeeded execution', () => {
    let tool: any;

    beforeEach(() => {
      tool = createDonorActionInsightsTool(
        testConfig.organizationId,
        mockLoggingService,
        testConfig.staffId,
        testConfig.fromPhoneNumber
      );
    });

    it('should perform comprehensive analysis with default parameters', async () => {
      const mockDonorData = [
        {
          donorId: 1,
          firstName: 'John',
          lastName: 'Doe',
          displayName: 'John Doe',
          email: 'john@example.com',
          currentStage: 'Active',
          staffFirstName: 'Jane',
          staffLastName: 'Admin',
          totalDonated: 50000, // $500
          donationCount: 5,
          lastDonationDate: new Date('2024-01-01'),
          firstDonationDate: new Date('2023-01-01'),
          avgDonationAmount: 10000,
          donationMonths: [1, 3, 5, 7, 9]
        }
      ];

      const mockCommunicationData = [
        {
          donorId: 1,
          lastCommunicationDate: new Date('2024-02-01')
        }
      ];

      // Mock database queries
      mockDb.groupBy.mockResolvedValueOnce(mockDonorData);
      mockDb.groupBy.mockResolvedValueOnce(mockCommunicationData);

      // Mock AI response
      const mockAIResponse = {
        text: 'Analysis: John Doe is a high-value donor who needs attention.',
        usage: { totalTokens: 100 }
      };
      (generateText as jest.Mock).mockResolvedValue(mockAIResponse);

      const result = await tool.analyzeActionNeeded.execute({
        analysisType: 'comprehensive'
      });

      expect(result).toMatchObject({
        success: true,
        analysis: mockAIResponse.text,
        summary: {
          totalDonorsAnalyzed: 1,
          donorsInResults: 1,
          analysisType: 'comprehensive',
          priorityBreakdown: expect.any(Object)
        },
        tokensUsed: 100
      });

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Starting donor action insights analysis'),
        expect.objectContaining({
          analysisType: 'comprehensive',
          maxResults: 50,
          priorityLevel: 'all',
          organizationId: testConfig.organizationId
        })
      );
    });

    it('should handle lapse risk analysis type', async () => {
      const mockDonorData = [
        {
          donorId: 1,
          firstName: 'Jane',
          lastName: 'Smith',
          displayName: null,
          email: 'jane@example.com',
          currentStage: 'Lapsing',
          staffFirstName: null,
          staffLastName: null,
          totalDonated: 25000,
          donationCount: 3,
          lastDonationDate: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000), // 200 days ago
          firstDonationDate: new Date('2022-01-01'),
          avgDonationAmount: 8333,
          donationMonths: [3, 6, 9]
        }
      ];

      mockDb.groupBy.mockResolvedValueOnce(mockDonorData);
      mockDb.groupBy.mockResolvedValueOnce([]);

      const mockAIResponse = {
        text: 'Jane Smith is at high risk of lapsing. Last donation was 6+ months ago.',
        usage: { totalTokens: 80 }
      };
      (generateText as jest.Mock).mockResolvedValue(mockAIResponse);

      const result = await tool.analyzeActionNeeded.execute({
        analysisType: 'lapse_risk',
        maxResults: 10,
        priorityLevel: 'high'
      });

      expect(result.success).toBe(true);
      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('identify donors at highest risk of lapsing')
        })
      );
    });

    it('should handle seasonal opportunities analysis', async () => {
      const currentMonth = new Date().getMonth() + 1;
      const mockDonorData = [
        {
          donorId: 1,
          firstName: 'Bob',
          lastName: 'Wilson',
          displayName: 'Bob Wilson',
          email: 'bob@example.com',
          currentStage: 'Active',
          staffFirstName: 'Staff',
          staffLastName: 'Member',
          totalDonated: 100000,
          donationCount: 10,
          lastDonationDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          firstDonationDate: new Date('2020-01-01'),
          avgDonationAmount: 10000,
          donationMonths: [currentMonth, currentMonth] // Typically donates this month
        }
      ];

      mockDb.groupBy.mockResolvedValueOnce(mockDonorData);
      mockDb.groupBy.mockResolvedValueOnce([]);

      const mockAIResponse = {
        text: 'Bob Wilson typically donates during this time of year.',
        usage: { totalTokens: 90 }
      };
      (generateText as jest.Mock).mockResolvedValue(mockAIResponse);

      const result = await tool.analyzeActionNeeded.execute({
        analysisType: 'seasonal_opportunities'
      });

      expect(result.success).toBe(true);
      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('seasonal giving opportunities')
        })
      );
    });

    it('should handle communication gaps analysis', async () => {
      const mockDonorData = [
        {
          donorId: 1,
          firstName: 'Alice',
          lastName: 'Brown',
          displayName: null,
          email: 'alice@example.com',
          currentStage: 'New',
          staffFirstName: null,
          staffLastName: null,
          totalDonated: 5000,
          donationCount: 1,
          lastDonationDate: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000),
          firstDonationDate: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000),
          avgDonationAmount: 5000,
          donationMonths: [1]
        }
      ];

      mockDb.groupBy.mockResolvedValueOnce(mockDonorData);
      mockDb.groupBy.mockResolvedValueOnce([]); // No communication data

      const mockAIResponse = {
        text: 'Alice Brown is a new donor with no follow-up communication.',
        usage: { totalTokens: 75 }
      };
      (generateText as jest.Mock).mockResolvedValue(mockAIResponse);

      const result = await tool.analyzeActionNeeded.execute({
        analysisType: 'communication_gaps'
      });

      expect(result.success).toBe(true);
      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('communication follow-up')
        })
      );
    });

    it('should handle high value attention analysis', async () => {
      const mockDonorData = [
        {
          donorId: 1,
          firstName: 'Major',
          lastName: 'Donor',
          displayName: 'Major Donor',
          email: 'major@example.com',
          currentStage: 'Major Donor',
          staffFirstName: 'VIP',
          staffLastName: 'Manager',
          totalDonated: 10000000, // $100,000
          donationCount: 20,
          lastDonationDate: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
          firstDonationDate: new Date('2015-01-01'),
          avgDonationAmount: 500000,
          donationMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
        }
      ];

      mockDb.groupBy.mockResolvedValueOnce(mockDonorData);
      mockDb.groupBy.mockResolvedValueOnce([]);

      const mockAIResponse = {
        text: 'Major Donor requires immediate VIP attention.',
        usage: { totalTokens: 120 }
      };
      (generateText as jest.Mock).mockResolvedValue(mockAIResponse);

      const result = await tool.analyzeActionNeeded.execute({
        analysisType: 'high_value_attention',
        priorityLevel: 'high'
      });

      expect(result.success).toBe(true);
      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('high-value donors requiring special attention')
        })
      );
    });

    it('should properly calculate risk factors', async () => {
      const mockDonorData = [
        {
          donorId: 1,
          firstName: 'Risk',
          lastName: 'Donor',
          displayName: null,
          email: 'risk@example.com',
          currentStage: null, // No stage defined
          staffFirstName: null,
          staffLastName: null,
          totalDonated: 15000,
          donationCount: 3,
          lastDonationDate: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000), // Over 12 months ago
          firstDonationDate: new Date('2020-01-01'),
          avgDonationAmount: 5000,
          donationMonths: [6]
        }
      ];

      mockDb.groupBy.mockResolvedValueOnce(mockDonorData);
      mockDb.groupBy.mockResolvedValueOnce([]); // No communication

      const mockAIResponse = {
        text: 'Risk analysis complete.',
        usage: { totalTokens: 50 }
      };
      (generateText as jest.Mock).mockResolvedValue(mockAIResponse);

      const result = await tool.analyzeActionNeeded.execute({
        analysisType: 'comprehensive'
      });

      // Verify the prompt includes risk factors
      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('No donation in over 12 months')
        })
      );
    });

    it('should respect maxResults parameter', async () => {
      const mockDonorData = Array(100).fill(null).map((_, i) => ({
        donorId: i + 1,
        firstName: `Donor${i}`,
        lastName: 'Test',
        displayName: null,
        email: `donor${i}@example.com`,
        currentStage: 'Active',
        staffFirstName: null,
        staffLastName: null,
        totalDonated: 10000 * (i + 1),
        donationCount: 5,
        lastDonationDate: new Date(),
        firstDonationDate: new Date('2023-01-01'),
        avgDonationAmount: 2000 * (i + 1),
        donationMonths: [1, 2, 3]
      }));

      mockDb.groupBy.mockResolvedValueOnce(mockDonorData);
      mockDb.groupBy.mockResolvedValueOnce([]);

      const mockAIResponse = {
        text: 'Analysis of limited donors.',
        usage: { totalTokens: 60 }
      };
      (generateText as jest.Mock).mockResolvedValue(mockAIResponse);

      const result = await tool.analyzeActionNeeded.execute({
        analysisType: 'comprehensive',
        maxResults: 10
      });

      expect(result.summary.donorsInResults).toBe(10);
      expect(result.summary.totalDonorsAnalyzed).toBe(100);
    });

    it('should log activity when logging service is provided', async () => {
      mockDb.groupBy.mockResolvedValueOnce([]);
      mockDb.groupBy.mockResolvedValueOnce([]);

      const mockAIResponse = {
        text: 'No donors found.',
        usage: { totalTokens: 30 }
      };
      (generateText as jest.Mock).mockResolvedValue(mockAIResponse);

      await tool.analyzeActionNeeded.execute({
        analysisType: 'comprehensive'
      });

      expect(mockLoggingService.logActivity).toHaveBeenCalledWith({
        staffId: testConfig.staffId,
        organizationId: testConfig.organizationId,
        activityType: 'donor_action_insights_analysis',
        phoneNumber: testConfig.fromPhoneNumber,
        summary: expect.stringContaining('Analyzed 0 donors'),
        data: expect.objectContaining({
          analysisType: 'comprehensive',
          donorsAnalyzed: 0,
          analysisResult: 'No donors found.'
        }),
        metadata: expect.any(Object)
      });
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Database connection failed');
      mockDb.groupBy.mockRejectedValue(error);

      const result = await tool.analyzeActionNeeded.execute({
        analysisType: 'comprehensive'
      });

      expect(result).toEqual({
        success: false,
        error: 'Database connection failed'
      });

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error in donor action insights analysis'),
        error
      );
    });

    it('should properly format donor data for AI', async () => {
      const mockDonorData = [
        {
          donorId: 1,
          firstName: 'Format',
          lastName: 'Test',
          displayName: 'Format Test',
          email: 'format@example.com',
          currentStage: 'Active',
          staffFirstName: 'John',
          staffLastName: 'Staff',
          totalDonated: 250050, // $2,500.50
          donationCount: 5,
          lastDonationDate: new Date('2024-01-15'),
          firstDonationDate: new Date('2023-01-01'),
          avgDonationAmount: 50010,
          donationMonths: [1, 3, 5]
        }
      ];

      mockDb.groupBy.mockResolvedValueOnce(mockDonorData);
      mockDb.groupBy.mockResolvedValueOnce([]);

      const mockAIResponse = {
        text: 'Formatted analysis.',
        usage: { totalTokens: 40 }
      };
      (generateText as jest.Mock).mockResolvedValue(mockAIResponse);

      await tool.analyzeActionNeeded.execute({
        analysisType: 'comprehensive'
      });

      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('$2500.50') // Formatted total donated without comma
        })
      );
    });

    it('should handle null values in donor data', async () => {
      const mockDonorData = [
        {
          donorId: 1,
          firstName: 'Null',
          lastName: 'Test',
          displayName: null,
          email: 'null@example.com',
          currentStage: null,
          staffFirstName: null,
          staffLastName: null,
          totalDonated: 0,
          donationCount: 0,
          lastDonationDate: null,
          firstDonationDate: null,
          avgDonationAmount: 0,
          donationMonths: null
        }
      ];

      mockDb.groupBy.mockResolvedValueOnce(mockDonorData);
      mockDb.groupBy.mockResolvedValueOnce([]);

      const mockAIResponse = {
        text: 'Analysis complete.',
        usage: { totalTokens: 35 }
      };
      (generateText as jest.Mock).mockResolvedValue(mockAIResponse);

      const result = await tool.analyzeActionNeeded.execute({
        analysisType: 'comprehensive'
      });

      expect(result.success).toBe(true);
      // Should not crash with null values
    });
  });
});