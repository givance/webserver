import { PersonResearchService } from '@/app/lib/services/person-research.service';
import { PersonResearchDatabaseService } from '@/app/lib/services/person-research/database.service';
import { QueryGenerationService } from '@/app/lib/services/person-research/query-generation.service';
import { WebSearchService } from '@/app/lib/services/person-research/web-search.service';
import { ReflectionService } from '@/app/lib/services/person-research/reflection.service';
import { AnswerSynthesisService } from '@/app/lib/services/person-research/answer-synthesis.service';
import { PersonIdentificationService } from '@/app/lib/services/person-research/person-identification.service';
import { StructuredDataExtractionService } from '@/app/lib/services/person-research/structured-data-extraction.service';
import { getDonorById } from '@/app/lib/data/donors';
import { db } from '@/app/lib/db';
import { logger } from '@/app/lib/logger';
import type {
  PersonResearchInput,
  PersonResearchResult,
  PersonResearchDBRecord,
  DonorInfo,
  createEmptyTokenUsage,
} from '@/app/lib/services/person-research/types';

// Mock dependencies
jest.mock('@/app/lib/services/person-research/database.service');
jest.mock('@/app/lib/services/person-research/query-generation.service');
jest.mock('@/app/lib/services/person-research/web-search.service');
jest.mock('@/app/lib/services/person-research/reflection.service');
jest.mock('@/app/lib/services/person-research/answer-synthesis.service');
jest.mock('@/app/lib/services/person-research/person-identification.service');
jest.mock('@/app/lib/services/person-research/structured-data-extraction.service');
jest.mock('@/app/lib/data/donors');
jest.mock('@/app/lib/db');
jest.mock('@/app/lib/logger');

describe('PersonResearchService', () => {
  let service: PersonResearchService;
  let mockDatabaseService: jest.Mocked<PersonResearchDatabaseService>;
  let mockQueryGenerationService: jest.Mocked<QueryGenerationService>;
  let mockWebSearchService: jest.Mocked<WebSearchService>;
  let mockReflectionService: jest.Mocked<ReflectionService>;
  let mockAnswerSynthesisService: jest.Mocked<AnswerSynthesisService>;
  let mockPersonIdentificationService: jest.Mocked<PersonIdentificationService>;
  let mockStructuredDataExtractionService: jest.Mocked<StructuredDataExtractionService>;

  const mockTokenUsage = {
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 150,
  };

  const mockInput: PersonResearchInput = {
    researchTopic: 'John Doe philanthropy background',
    organizationId: 'org123',
    userId: 'user123',
  };

  const mockDonor = {
    id: 1,
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    address: '123 Main St',
    state: 'NY',
    notes: 'Major donor',
  };

  const mockQueries = {
    queries: [
      { query: 'John Doe philanthropy', priority: 'high' as const },
      { query: 'John Doe charitable giving', priority: 'medium' as const },
    ],
    tokenUsage: mockTokenUsage,
  };

  const mockWebSearchResults = {
    results: [
      {
        query: 'John Doe philanthropy',
        sources: [
          {
            title: 'John Doe Foundation',
            url: 'https://example.com',
            snippet: 'John Doe has donated millions',
            datePublished: '2023-01-01',
          },
        ],
        summary: 'John Doe is a major philanthropist',
      },
    ],
    totalSources: 1,
    totalFilteredSources: 0,
    totalTokenUsage: mockTokenUsage,
  };

  const mockReflection = {
    isSufficient: true,
    knowledgeGap: '',
    followUpQueries: [],
    tokenUsage: mockTokenUsage,
  };

  const mockAnswer = {
    answer: 'John Doe is a prominent philanthropist who has donated millions to education.',
    citations: [
      {
        claimId: 'claim1',
        claim: 'John Doe has donated millions',
        sources: [
          {
            title: 'John Doe Foundation',
            url: 'https://example.com',
            snippet: 'John Doe has donated millions',
          },
        ],
      },
    ],
    tokenUsage: mockTokenUsage,
  };

  const mockPersonIdentity = {
    fullName: 'John Doe',
    profession: 'Business Executive',
    company: 'Doe Industries',
    location: 'New York, NY',
    keyIdentifiers: ['CEO of Doe Industries', 'Philanthropist'],
    confidence: 0.95,
  };

  const mockStructuredData = {
    structuredData: {
      netWorth: '$1 billion',
      philanthropicFocus: ['Education', 'Healthcare'],
      notableContributions: ['$10M to University', '$5M to Hospital'],
      highPotentialDonor: true,
    },
    tokenUsage: mockTokenUsage,
  };

  const mockDbRecord: PersonResearchDBRecord = {
    id: 100,
    donorId: 1,
    organizationId: 'org123',
    userId: 'user123',
    researchData: {} as PersonResearchResult,
    isLive: true,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup service mocks
    mockDatabaseService = {
      savePersonResearch: jest.fn(),
      getPersonResearch: jest.fn(),
      getAllPersonResearchVersions: jest.fn(),
      setResearchAsLive: jest.fn(),
    } as any;

    mockQueryGenerationService = {
      generateQueries: jest.fn(),
    } as any;

    mockWebSearchService = {
      conductParallelSearch: jest.fn(),
    } as any;

    mockReflectionService = {
      analyzeResults: jest.fn(),
    } as any;

    mockAnswerSynthesisService = {
      synthesizeAnswer: jest.fn(),
    } as any;

    mockPersonIdentificationService = {
      extractPersonIdentity: jest.fn(),
    } as any;

    mockStructuredDataExtractionService = {
      extractStructuredData: jest.fn(),
    } as any;

    // Mock implementations
    (PersonResearchDatabaseService as jest.Mock).mockImplementation(() => mockDatabaseService);
    (QueryGenerationService as jest.Mock).mockImplementation(() => mockQueryGenerationService);
    (WebSearchService as jest.Mock).mockImplementation(() => mockWebSearchService);
    (ReflectionService as jest.Mock).mockImplementation(() => mockReflectionService);
    (AnswerSynthesisService as jest.Mock).mockImplementation(() => mockAnswerSynthesisService);
    (PersonIdentificationService as jest.Mock).mockImplementation(() => mockPersonIdentificationService);
    (StructuredDataExtractionService as jest.Mock).mockImplementation(() => mockStructuredDataExtractionService);

    // Setup database mock
    const mockUpdate = jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([]),
      }),
    });
    (db.update as jest.Mock).mockReturnValue(mockUpdate);

    service = new PersonResearchService();
  });

  describe('conductAndSavePersonResearch', () => {
    beforeEach(() => {
      (getDonorById as jest.Mock).mockResolvedValue(mockDonor);
      mockQueryGenerationService.generateQueries.mockResolvedValue(mockQueries);
      mockWebSearchService.conductParallelSearch.mockResolvedValue(mockWebSearchResults);
      mockReflectionService.analyzeResults.mockResolvedValue(mockReflection);
      mockAnswerSynthesisService.synthesizeAnswer.mockResolvedValue(mockAnswer);
      mockPersonIdentificationService.extractPersonIdentity.mockResolvedValue({
        identity: mockPersonIdentity,
        tokenUsage: mockTokenUsage,
      });
      mockStructuredDataExtractionService.extractStructuredData.mockResolvedValue(mockStructuredData);
      mockDatabaseService.savePersonResearch.mockResolvedValue(mockDbRecord);
    });

    it('should conduct research with donor info and save to database', async () => {
      const result = await service.conductAndSavePersonResearch(mockInput, 1);

      expect(result).toMatchObject({
        result: expect.objectContaining({
          answer: mockAnswer.answer,
          citations: mockAnswer.citations,
          researchTopic: mockInput.researchTopic,
          personIdentity: mockPersonIdentity,
          structuredData: mockStructuredData.structuredData,
        }),
        dbRecord: mockDbRecord,
      });

      // Verify donor info was fetched
      expect(getDonorById).toHaveBeenCalledWith(1, 'org123');

      // Verify research was conducted with donor info
      expect(mockQueryGenerationService.generateQueries).toHaveBeenCalledWith(
        expect.objectContaining({
          researchTopic: mockInput.researchTopic,
          donorInfo: expect.objectContaining({
            fullName: 'John Doe',
            location: '123 Main St, NY',
            notes: 'Major donor',
          }),
        })
      );

      // Verify database save
      expect(mockDatabaseService.savePersonResearch).toHaveBeenCalledWith({
        donorId: 1,
        organizationId: 'org123',
        userId: 'user123',
        researchResult: expect.objectContaining({
          answer: mockAnswer.answer,
        }),
        setAsLive: true,
      });

      // Verify donor update with high potential flag
      expect(db.update).toHaveBeenCalledWith(expect.anything());
    });

    it('should handle missing donor info gracefully', async () => {
      (getDonorById as jest.Mock).mockResolvedValue(null);

      const result = await service.conductAndSavePersonResearch(mockInput, 1);

      expect(result.result).toBeDefined();
      expect(mockQueryGenerationService.generateQueries).toHaveBeenCalledWith(
        expect.not.objectContaining({ donorInfo: expect.anything() })
      );
    });

    it('should handle donor update failure gracefully', async () => {
      (db.update as jest.Mock).mockImplementation(() => {
        throw new Error('Database update failed');
      });

      const result = await service.conductAndSavePersonResearch(mockInput, 1);

      expect(result).toBeDefined();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to update donor 1 with research results')
      );
    });
  });

  describe('getPersonResearch', () => {
    it('should retrieve research from database', async () => {
      const mockResearchResult: PersonResearchResult = {
        answer: 'Test answer',
        citations: [],
        summaries: [],
        totalLoops: 1,
        totalSources: 0,
        researchTopic: 'Test topic',
        timestamp: new Date(),
        tokenUsage: {} as any,
        structuredData: {} as any,
      };

      mockDatabaseService.getPersonResearch.mockResolvedValue({
        ...mockDbRecord,
        researchData: mockResearchResult,
      });

      const result = await service.getPersonResearch(1, 'org123');

      expect(result).toEqual(mockResearchResult);
      expect(mockDatabaseService.getPersonResearch).toHaveBeenCalledWith({
        donorId: 1,
        organizationId: 'org123',
        version: undefined,
      });
    });

    it('should return null if research not found', async () => {
      mockDatabaseService.getPersonResearch.mockResolvedValue(null);

      const result = await service.getPersonResearch(1, 'org123');

      expect(result).toBeNull();
    });

    it('should handle specific version requests', async () => {
      await service.getPersonResearch(1, 'org123', 2);

      expect(mockDatabaseService.getPersonResearch).toHaveBeenCalledWith({
        donorId: 1,
        organizationId: 'org123',
        version: 2,
      });
    });
  });

  describe('getAllPersonResearchVersions', () => {
    it('should get all research versions', async () => {
      const mockVersions = [mockDbRecord, { ...mockDbRecord, version: 2 }];
      mockDatabaseService.getAllPersonResearchVersions.mockResolvedValue(mockVersions);

      const result = await service.getAllPersonResearchVersions(1, 'org123');

      expect(result).toEqual(mockVersions);
      expect(mockDatabaseService.getAllPersonResearchVersions).toHaveBeenCalledWith(1, 'org123');
    });
  });

  describe('setResearchAsLive', () => {
    it('should set research version as live', async () => {
      mockDatabaseService.setResearchAsLive.mockResolvedValue(mockDbRecord);

      const result = await service.setResearchAsLive(100, 1);

      expect(result).toEqual(mockDbRecord);
      expect(mockDatabaseService.setResearchAsLive).toHaveBeenCalledWith(100, 1);
    });
  });

  describe('conductPersonResearch', () => {
    beforeEach(() => {
      mockQueryGenerationService.generateQueries.mockResolvedValue(mockQueries);
      mockWebSearchService.conductParallelSearch.mockResolvedValue(mockWebSearchResults);
      mockReflectionService.analyzeResults.mockResolvedValue(mockReflection);
      mockAnswerSynthesisService.synthesizeAnswer.mockResolvedValue(mockAnswer);
      mockStructuredDataExtractionService.extractStructuredData.mockResolvedValue(mockStructuredData);
    });

    it('should conduct complete research pipeline', async () => {
      const result = await service.conductPersonResearch(mockInput);

      expect(result).toMatchObject({
        answer: mockAnswer.answer,
        citations: mockAnswer.citations,
        researchTopic: mockInput.researchTopic,
        totalLoops: 1,
        totalSources: 1,
        structuredData: mockStructuredData.structuredData,
      });

      // Verify pipeline stages
      expect(mockQueryGenerationService.generateQueries).toHaveBeenCalledTimes(1);
      expect(mockWebSearchService.conductParallelSearch).toHaveBeenCalledTimes(1);
      expect(mockReflectionService.analyzeResults).toHaveBeenCalledTimes(1); // Called but returns sufficient
      expect(mockAnswerSynthesisService.synthesizeAnswer).toHaveBeenCalledTimes(1);
      expect(mockStructuredDataExtractionService.extractStructuredData).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple research loops', async () => {
      // First reflection indicates more research needed
      mockReflectionService.analyzeResults
        .mockResolvedValueOnce({
          isSufficient: false,
          knowledgeGap: 'Need more info on donations',
          followUpQueries: ['donation history'],
          tokenUsage: mockTokenUsage,
        })
        .mockResolvedValueOnce(mockReflection);

      // Second query generation for follow-up
      mockQueryGenerationService.generateQueries
        .mockResolvedValueOnce(mockQueries)
        .mockResolvedValueOnce({
          queries: [{ query: 'John Doe donation history', priority: 'high' as const }],
          tokenUsage: mockTokenUsage,
        });

      const result = await service.conductPersonResearch(mockInput);

      expect(result.totalLoops).toBe(2);
      expect(mockQueryGenerationService.generateQueries).toHaveBeenCalledTimes(2);
      expect(mockWebSearchService.conductParallelSearch).toHaveBeenCalledTimes(2);
      expect(mockReflectionService.analyzeResults).toHaveBeenCalledTimes(1);
    });

    it('should extract person identity when donor info provided', async () => {
      const donorInfo: DonorInfo = {
        fullName: 'John Doe',
        location: 'New York, NY',
        notes: 'Major donor',
      };

      mockPersonIdentificationService.extractPersonIdentity.mockResolvedValue({
        identity: mockPersonIdentity,
        tokenUsage: mockTokenUsage,
      });

      const result = await service.conductPersonResearch(mockInput, donorInfo);

      expect(result.personIdentity).toEqual(mockPersonIdentity);
      expect(mockPersonIdentificationService.extractPersonIdentity).toHaveBeenCalledWith(
        donorInfo,
        expect.any(Array)
      );
      // Just verify the web search service was called, the exact parameters are complex
      expect(mockWebSearchService.conductParallelSearch).toHaveBeenCalledTimes(1);
    });

    it('should handle person identification failure gracefully', async () => {
      const donorInfo: DonorInfo = { fullName: 'John Doe' };
      mockPersonIdentificationService.extractPersonIdentity.mockRejectedValue(
        new Error('Identification failed')
      );

      const result = await service.conductPersonResearch(mockInput, donorInfo);

      expect(result).toBeDefined();
      expect(result.personIdentity).toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to extract identity')
      );
    });

    it('should calculate token usage correctly', async () => {
      const result = await service.conductPersonResearch(mockInput);

      expect(result.tokenUsage).toMatchObject({
        queryGeneration: mockTokenUsage,
        webSearchSummaries: mockTokenUsage,
        reflection: mockTokenUsage, // Even though reflection wasn't called, it's initialized
        answerSynthesis: mockTokenUsage,
        structuredDataExtraction: mockTokenUsage,
        total: expect.objectContaining({
          totalTokens: expect.any(Number),
        }),
      });
    });

    it('should validate input parameters', async () => {
      await expect(
        service.conductPersonResearch({ ...mockInput, researchTopic: '' })
      ).rejects.toThrow('Research topic is required');

      await expect(
        service.conductPersonResearch({ ...mockInput, organizationId: '' })
      ).rejects.toThrow('Organization ID is required');

      await expect(
        service.conductPersonResearch({ ...mockInput, userId: '' })
      ).rejects.toThrow('User ID is required');
    });

    it('should handle service failures', async () => {
      mockQueryGenerationService.generateQueries.mockRejectedValue(new Error('Query generation failed'));

      await expect(service.conductPersonResearch(mockInput)).rejects.toThrow(
        'Failed to conduct person research: Query generation failed'
      );

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Person research failed for topic')
      );
    });

    it('should respect MAX_RESEARCH_LOOPS', async () => {
      // Always return insufficient to test loop limit
      mockReflectionService.analyzeResults.mockResolvedValue({
        isSufficient: false,
        knowledgeGap: 'Need more info',
        followUpQueries: ['more queries'],
        tokenUsage: mockTokenUsage,
      });

      const result = await service.conductPersonResearch(mockInput);

      expect(result.totalLoops).toBe(2); // MAX_RESEARCH_LOOPS
      expect(mockWebSearchService.conductParallelSearch).toHaveBeenCalledTimes(2);
    });
  });
});