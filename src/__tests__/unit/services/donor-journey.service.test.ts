// Mock dependencies first before imports
jest.mock('@/app/lib/logger');
jest.mock('@/app/lib/env', () => ({
  env: {
    AZURE_OPENAI_RESOURCE_NAME: 'test-resource',
    AZURE_OPENAI_API_KEY: 'test-key',
    AZURE_OPENAI_DEPLOYMENT_NAME: 'test-deployment',
  },
}));

// Mock Azure SDK
jest.mock('@ai-sdk/azure', () => ({
  createAzure: jest.fn(() => jest.fn()),
}));

// Mock generateObject
jest.mock('ai');

// Now import after mocks are set up
import { DonorJourneyService } from '@/app/lib/services/donor-journey.service';
import { logger } from '@/app/lib/logger';
import { generateObject } from 'ai';

const mockGenerateObject = generateObject as jest.MockedFunction<typeof generateObject>;

describe('DonorJourneyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('processJourney', () => {
    const mockJourneyDescription = 'First, reach out to new donors via email. Then follow up with a phone call. Finally, schedule an in-person meeting.';

    const mockGeneratedJourney = {
      nodes: [
        {
          id: 'n1',
          label: 'Initial Email Outreach',
          properties: {
            description: 'First contact with potential donor via email',
            actions: ['Send welcome email', 'Add to CRM'],
          },
        },
        {
          id: 'n2',
          label: 'Phone Follow-up',
          properties: {
            description: 'Follow up with phone call after email',
            actions: ['Call donor', 'Log conversation notes'],
          },
        },
        {
          id: 'n3',
          label: 'In-person Meeting',
          properties: {
            description: 'Schedule face-to-face meeting',
            actions: ['Schedule meeting', 'Prepare presentation materials'],
          },
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 'n1',
          target: 'n2',
          label: 'FOLLOW_UP',
          properties: {
            description: 'Follow up after initial email',
          },
        },
        {
          id: 'e2',
          source: 'n2',
          target: 'n3',
          label: 'SCHEDULE_MEETING',
          properties: {
            description: 'Schedule meeting after successful call',
          },
        },
      ],
    };

    it('should successfully process a donor journey description', async () => {
      mockGenerateObject.mockResolvedValue({
        object: mockGeneratedJourney,
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
      });

      const result = await DonorJourneyService.processJourney(mockJourneyDescription);

      expect(mockGenerateObject).toHaveBeenCalled();
      const callArgs = mockGenerateObject.mock.calls[0][0];
      expect(callArgs.prompt).toContain(mockJourneyDescription);
      expect(callArgs.system).toContain('donor journey analyzer');
      expect(callArgs.schema).toBeDefined();

      expect(result).toEqual(mockGeneratedJourney);
      expect(result.nodes).toHaveLength(3);
      expect(result.edges).toHaveLength(2);

      // Verify node structure
      result.nodes.forEach(node => {
        expect(node).toHaveProperty('id');
        expect(node).toHaveProperty('label');
        expect(node).toHaveProperty('properties.description');
        expect(node.properties.actions).toBeInstanceOf(Array);
      });

      // Verify edge structure
      result.edges.forEach(edge => {
        expect(edge).toHaveProperty('id');
        expect(edge).toHaveProperty('source');
        expect(edge).toHaveProperty('target');
        expect(edge).toHaveProperty('label');
        expect(edge).toHaveProperty('properties.description');
      });

      expect(logger.info).toHaveBeenCalledWith('Processing donor journey description');
      expect(logger.info).toHaveBeenCalledWith(
        'Successfully processed donor journey',
        { nodeCount: 3, edgeCount: 2 }
      );
    });

    it('should handle empty journey description', async () => {
      const emptyJourney = {
        nodes: [],
        edges: [],
      };

      mockGenerateObject.mockResolvedValue({
        object: emptyJourney,
        finishReason: 'stop',
        usage: { promptTokens: 50, completionTokens: 10, totalTokens: 60 },
      });

      const result = await DonorJourneyService.processJourney('');

      expect(result).toEqual(emptyJourney);
      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
    });

    it('should handle AI generation errors', async () => {
      const error = new Error('AI generation failed');
      mockGenerateObject.mockRejectedValue(error);

      await expect(
        DonorJourneyService.processJourney(mockJourneyDescription)
      ).rejects.toThrow('AI generation failed');

      expect(logger.error).toHaveBeenCalledWith('Failed to process donor journey:', error);
    });

    it('should handle complex journey with multiple properties', async () => {
      const complexJourney = {
        nodes: [
          {
            id: 'n1',
            label: 'Donor Research',
            properties: {
              description: 'Research potential donor background',
              actions: ['Check wealth indicators', 'Review giving history', 'Analyze interests'],
              expectedDuration: '1-2 weeks',
              requiredResources: ['Research team', 'Database access'],
              customField: 'Additional data',
            },
          },
        ],
        edges: [],
      };

      mockGenerateObject.mockResolvedValue({
        object: complexJourney,
        finishReason: 'stop',
        usage: { promptTokens: 150, completionTokens: 100, totalTokens: 250 },
      });

      const result = await DonorJourneyService.processJourney('Research donor thoroughly');

      expect(result.nodes[0].properties).toHaveProperty('expectedDuration');
      expect(result.nodes[0].properties).toHaveProperty('requiredResources');
      expect(result.nodes[0].properties).toHaveProperty('customField');
    });
  });

  describe('getStageIdFromName', () => {
    const mockJourney = {
      nodes: [
        { id: 'n1', label: 'Initial Contact', properties: { description: 'First contact' } },
        { id: 'n2', label: 'Follow Up', properties: { description: 'Follow up stage' } },
        { id: 'n3', label: 'Meeting', properties: { description: 'Schedule meeting' } },
      ],
      edges: [],
    };

    it('should return stage ID when stage name exists', () => {
      const stageId = DonorJourneyService.getStageIdFromName(mockJourney, 'Follow Up');
      expect(stageId).toBe('n2');
    });

    it('should return null when stage name does not exist', () => {
      const stageId = DonorJourneyService.getStageIdFromName(mockJourney, 'Non-existent Stage');
      expect(stageId).toBeNull();
    });

    it('should handle empty journey', () => {
      const emptyJourney = { nodes: [], edges: [] };
      const stageId = DonorJourneyService.getStageIdFromName(emptyJourney, 'Any Stage');
      expect(stageId).toBeNull();
    });

    it('should be case sensitive', () => {
      const stageId = DonorJourneyService.getStageIdFromName(mockJourney, 'follow up');
      expect(stageId).toBeNull();
    });
  });

  describe('getStageNameFromId', () => {
    const mockJourney = {
      nodes: [
        { id: 'n1', label: 'Initial Contact', properties: { description: 'First contact' } },
        { id: 'n2', label: 'Follow Up', properties: { description: 'Follow up stage' } },
        { id: 'n3', label: 'Meeting', properties: { description: 'Schedule meeting' } },
      ],
      edges: [],
    };

    it('should return stage name when stage ID exists', () => {
      const stageName = DonorJourneyService.getStageNameFromId(mockJourney, 'n2');
      expect(stageName).toBe('Follow Up');
    });

    it('should return null when stage ID does not exist', () => {
      const stageName = DonorJourneyService.getStageNameFromId(mockJourney, 'n99');
      expect(stageName).toBeNull();
    });

    it('should handle empty journey', () => {
      const emptyJourney = { nodes: [], edges: [] };
      const stageName = DonorJourneyService.getStageNameFromId(emptyJourney, 'n1');
      expect(stageName).toBeNull();
    });
  });

  describe('isValidDonorJourney', () => {
    it('should validate a correct donor journey structure', () => {
      const validJourney = {
        nodes: [
          {
            id: 'n1',
            label: 'Stage 1',
            properties: {
              description: 'Description 1',
              actions: ['Action 1', 'Action 2'],
            },
          },
        ],
        edges: [
          {
            id: 'e1',
            source: 'n1',
            target: 'n2',
            label: 'TRANSITION',
            properties: {
              description: 'Transition description',
            },
          },
        ],
      };

      // Access private method through type casting
      const isValid = (DonorJourneyService as any).isValidDonorJourney(validJourney);
      expect(isValid).toBe(true);
    });

    it('should invalidate journey with missing required fields', () => {
      const invalidJourney = {
        nodes: [
          {
            id: 'n1',
            label: 'Stage 1',
            // Missing properties
          },
        ],
        edges: [],
      };

      const isValid = (DonorJourneyService as any).isValidDonorJourney(invalidJourney);
      expect(isValid).toBe(false);
    });

    it('should invalidate non-object input', () => {
      expect((DonorJourneyService as any).isValidDonorJourney(null)).toBe(false);
      expect((DonorJourneyService as any).isValidDonorJourney(undefined)).toBe(false);
      expect((DonorJourneyService as any).isValidDonorJourney('string')).toBe(false);
      expect((DonorJourneyService as any).isValidDonorJourney(123)).toBe(false);
    });

    it('should invalidate journey with invalid edge structure', () => {
      const invalidJourney = {
        nodes: [
          {
            id: 'n1',
            label: 'Stage 1',
            properties: {
              description: 'Description',
              actions: [],
            },
          },
        ],
        edges: [
          {
            id: 'e1',
            // Missing required fields
            label: 'TRANSITION',
          },
        ],
      };

      const isValid = (DonorJourneyService as any).isValidDonorJourney(invalidJourney);
      expect(isValid).toBe(false);
    });
  });
});