import { AgenticEmailGenerationService, type AgenticEmailGenerationInput } from '@/app/lib/services/agentic-email-generation.service';
import { EmailGenerationService } from '@/app/lib/services/email-generation.service';
import { AgenticEmailGenerationOrchestrator } from '@/app/lib/utils/email-generator/agentic-flow';
import { logger } from '@/app/lib/logger';
import { db } from '@/app/lib/db';
import * as orgData from '@/app/lib/data/organizations';
import * as userData from '@/app/lib/data/users';
import * as commData from '@/app/lib/data/communications';
import * as donationData from '@/app/lib/data/donations';
import { PersonResearchService } from '@/app/lib/services/person-research.service';
import fs from 'fs/promises';

// Mock dependencies
jest.mock('@/app/lib/services/email-generation.service');
jest.mock('@/app/lib/utils/email-generator/agentic-flow');
jest.mock('@/app/lib/logger');
jest.mock('@/app/lib/db');
jest.mock('@/app/lib/data/organizations');
jest.mock('@/app/lib/data/users');
jest.mock('@/app/lib/data/communications');
jest.mock('@/app/lib/data/donations');
jest.mock('@/app/lib/services/person-research.service');
jest.mock('fs/promises');

describe('AgenticEmailGenerationService', () => {
  let service: AgenticEmailGenerationService;
  let mockOrchestrator: jest.Mocked<AgenticEmailGenerationOrchestrator>;
  let mockEmailService: jest.Mocked<EmailGenerationService>;
  let mockPersonResearchService: jest.Mocked<PersonResearchService>;

  const mockInput: AgenticEmailGenerationInput = {
    instruction: 'Write a thank you email',
    donors: [
      { id: 1, firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
      { id: 2, firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' },
    ],
    organizationName: 'Test Org',
    organizationWritingInstructions: 'Be friendly',
    currentDate: '2024-01-01',
  };

  const mockContext = {
    userInstruction: mockInput.instruction,
    donors: expect.any(Array),
    organizationName: mockInput.organizationName,
    organization: expect.any(Object),
    organizationWritingInstructions: mockInput.organizationWritingInstructions,
    donationHistories: expect.any(Object),
    personResearchResults: expect.any(Object),
    bestPractices: 'Best practices content',
    userMemories: ['Memory 1'],
    organizationMemories: ['Org Memory 1'],
    currentDate: mockInput.currentDate,
  };

  const mockFlowResult = {
    steps: [
      {
        type: 'initial' as const,
        content: 'Starting flow',
        questions: ['Question 1?'],
        canProceed: true,
      },
    ],
    isComplete: false,
    needsUserInput: true,
    finalPrompt: undefined,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mocks
    mockOrchestrator = {
      startFlow: jest.fn(),
      continueFlow: jest.fn(),
      generateFinalPrompt: jest.fn(),
    } as any;
    
    mockEmailService = {
      generateSmartEmails: jest.fn(),
    } as any;

    mockPersonResearchService = {
      getPersonResearch: jest.fn(),
    } as any;

    (AgenticEmailGenerationOrchestrator as jest.Mock).mockImplementation(() => mockOrchestrator);
    (EmailGenerationService as jest.Mock).mockImplementation(() => mockEmailService);
    (PersonResearchService as jest.Mock).mockImplementation(() => mockPersonResearchService);

    service = new AgenticEmailGenerationService();
  });

  describe('startAgenticFlow', () => {
    const organizationId = 'org123';
    const userId = 'user123';

    beforeEach(() => {
      // Mock file system for best practices
      (fs.readFile as jest.Mock).mockResolvedValue('Best practices content');

      // Mock database queries
      const mockOrg = { 
        id: organizationId, 
        name: 'Test Org',
        websiteSummary: 'Website summary',
      };
      const mockDonors = [
        { 
          id: 1, 
          email: 'john@example.com',
          firstName: 'John',
          lastName: 'Doe',
          notes: 'VIP donor',
          displayName: 'John Doe',
          organizationId,
        },
        { 
          id: 2, 
          email: 'jane@example.com',
          firstName: 'Jane',
          lastName: 'Smith',
          notes: 'Regular donor',
          displayName: 'Jane Smith',
          organizationId,
        },
      ];

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockOrg]),
          }),
        }),
      });

      (db.query as any) = {
        donors: {
          findMany: jest.fn().mockResolvedValue(mockDonors),
        },
      };

      // Mock data functions
      (orgData.getOrganizationMemories as jest.Mock).mockResolvedValue(['Org Memory 1']);
      (userData.getUserMemories as jest.Mock).mockResolvedValue(['Memory 1']);
      (commData.getDonorCommunicationHistory as jest.Mock).mockResolvedValue([
        { content: [{ content: 'Previous email' }] },
      ]);
      (donationData.listDonations as jest.Mock).mockResolvedValue({
        donations: [{ amount: 100, date: '2023-01-01' }],
      });
      mockPersonResearchService.getPersonResearch.mockResolvedValue({
        researchTopic: 'John Doe background',
        data: 'Research data',
      });

      // Mock orchestrator
      mockOrchestrator.startFlow.mockResolvedValue(mockFlowResult);
    });

    it('should start a new agentic flow successfully', async () => {
      const result = await service.startAgenticFlow(mockInput, organizationId, userId);

      expect(result).toMatchObject({
        sessionId: expect.stringMatching(/^agentic_\d+_[a-z0-9]+$/),
        needsUserInput: true,
        isComplete: false,
        conversation: expect.arrayContaining([
          {
            role: 'assistant',
            content: 'Starting flow',
            timestamp: expect.any(Date),
            stepType: 'initial',
          },
          {
            role: 'assistant',
            content: 'Question 1?',
            timestamp: expect.any(Date),
            stepType: 'question',
          },
        ]),
        canProceed: true,
      });

      expect(mockOrchestrator.startFlow).toHaveBeenCalledWith(
        expect.objectContaining({
          userInstruction: mockInput.instruction,
          organizationName: mockInput.organizationName,
          bestPractices: 'Best practices content',
        })
      );
      
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Starting agentic email generation flow'));
    });

    it('should build context with complete donor data', async () => {
      await service.startAgenticFlow(mockInput, organizationId, userId);

      expect(commData.getDonorCommunicationHistory).toHaveBeenCalledTimes(2);
      expect(donationData.listDonations).toHaveBeenCalledTimes(2);
      expect(mockPersonResearchService.getPersonResearch).toHaveBeenCalledTimes(2);
      
      expect(mockOrchestrator.startFlow).toHaveBeenCalledWith(
        expect.objectContaining({
          donors: expect.arrayContaining([
            expect.objectContaining({
              id: 1,
              email: 'john@example.com',
              notes: 'VIP donor',
            }),
          ]),
          donationHistories: expect.objectContaining({
            1: expect.arrayContaining([{ amount: 100, date: '2023-01-01' }]),
          }),
          personResearchResults: expect.objectContaining({
            1: expect.objectContaining({ researchTopic: 'John Doe background' }),
          }),
        })
      );
    });

    it('should handle missing best practices file gracefully', async () => {
      (fs.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));

      const result = await service.startAgenticFlow(mockInput, organizationId, userId);

      expect(result.sessionId).toBeDefined();
      expect(mockOrchestrator.startFlow).toHaveBeenCalledWith(
        expect.objectContaining({
          bestPractices: 'Best practices file not found. Please follow general email best practices.',
        })
      );
    });

    it('should handle orchestrator errors', async () => {
      mockOrchestrator.startFlow.mockRejectedValue(new Error('Orchestrator failed'));

      await expect(
        service.startAgenticFlow(mockInput, organizationId, userId)
      ).rejects.toThrow('Failed to start agentic email generation flow');

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to start agentic flow'));
    });

    it('should handle missing person research gracefully', async () => {
      mockPersonResearchService.getPersonResearch.mockRejectedValue(new Error('Research not found'));

      const result = await service.startAgenticFlow(mockInput, organizationId, userId);

      expect(result.sessionId).toBeDefined();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch person research for donor')
      );
    });
  });

  describe('continueAgenticFlow', () => {
    const sessionId = 'agentic_123_abc';
    const userResponse = 'I want to add more personalization';

    beforeEach(() => {
      // Start a session first
      const mockState = {
        sessionId,
        context: mockContext,
        steps: mockFlowResult.steps,
        isComplete: false,
        needsUserInput: true,
      };
      (service as any).activeSessions.set(sessionId, mockState);

      const continuedResult = {
        ...mockFlowResult,
        steps: [
          ...mockFlowResult.steps,
          {
            type: 'followup' as const,
            content: 'Adding personalization',
            canProceed: true,
          },
        ],
      };
      mockOrchestrator.continueFlow.mockResolvedValue(continuedResult);
    });

    it('should continue an existing flow', async () => {
      const result = await service.continueAgenticFlow(sessionId, userResponse);

      expect(result).toMatchObject({
        needsUserInput: true,
        isComplete: false,
        conversation: expect.arrayContaining([
          expect.objectContaining({ content: 'Starting flow' }),
          expect.objectContaining({ content: 'Adding personalization' }),
        ]),
        canProceed: true,
      });

      expect(mockOrchestrator.continueFlow).toHaveBeenCalledWith(
        mockContext,
        userResponse,
        mockFlowResult.steps
      );
    });

    it('should throw error for non-existent session', async () => {
      await expect(
        service.continueAgenticFlow('invalid-session', userResponse)
      ).rejects.toThrow('Session not found or expired');

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Session not found'));
    });

    it('should handle orchestrator errors', async () => {
      mockOrchestrator.continueFlow.mockRejectedValue(new Error('Continue failed'));

      await expect(
        service.continueAgenticFlow(sessionId, userResponse)
      ).rejects.toThrow('Failed to continue agentic flow');

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to continue agentic flow'));
    });

    it('should update session state after continuing', async () => {
      await service.continueAgenticFlow(sessionId, userResponse);

      const updatedState = service.getSessionState(sessionId);
      expect(updatedState?.steps).toHaveLength(2);
      expect(updatedState?.steps[1]).toMatchObject({
        type: 'followup',
        content: 'Adding personalization',
      });
    });
  });

  describe('generateFinalPrompt', () => {
    const sessionId = 'agentic_123_abc';

    beforeEach(() => {
      const mockState = {
        sessionId,
        context: mockContext,
        steps: mockFlowResult.steps,
        isComplete: false,
        needsUserInput: false,
      };
      (service as any).activeSessions.set(sessionId, mockState);

      mockOrchestrator.generateFinalPrompt.mockResolvedValue({
        finalPrompt: 'Final prompt for email generation',
        summary: 'Summary of the conversation',
        estimatedComplexity: 'medium' as const,
      });
    });

    it('should generate final prompt successfully', async () => {
      const result = await service.generateFinalPrompt(sessionId);

      expect(result).toEqual({
        finalPrompt: 'Final prompt for email generation',
        summary: 'Summary of the conversation',
        estimatedComplexity: 'medium',
      });

      expect(mockOrchestrator.generateFinalPrompt).toHaveBeenCalledWith(
        mockContext,
        mockFlowResult.steps
      );
    });

    it('should update session with final prompt', async () => {
      await service.generateFinalPrompt(sessionId);

      const state = service.getSessionState(sessionId);
      expect(state?.finalPrompt).toBe('Final prompt for email generation');
    });

    it('should throw error for non-existent session', async () => {
      await expect(
        service.generateFinalPrompt('invalid-session')
      ).rejects.toThrow('Session not found or expired');
    });

    it('should handle orchestrator errors', async () => {
      mockOrchestrator.generateFinalPrompt.mockRejectedValue(new Error('Generation failed'));

      await expect(
        service.generateFinalPrompt(sessionId)
      ).rejects.toThrow('Failed to generate final prompt');
    });
  });

  describe('executeEmailGeneration', () => {
    const sessionId = 'agentic_123_abc';
    const confirmedPrompt = 'Final confirmed prompt';

    beforeEach(() => {
      const mockState = {
        sessionId,
        context: {
          ...mockContext,
          organization: { id: 'org123' },
          donors: [
            {
              id: 1,
              firstName: 'John',
              lastName: 'Doe',
              email: 'john@example.com',
            },
          ],
        },
        steps: mockFlowResult.steps,
        isComplete: false,
        needsUserInput: false,
        finalPrompt: 'Original prompt',
      };
      (service as any).activeSessions.set(sessionId, mockState);

      mockEmailService.generateSmartEmails.mockResolvedValue({
        emails: [{ donorId: 1, subject: 'Thank you', body: 'Email body' }],
      });
    });

    it('should execute email generation successfully', async () => {
      const result = await service.executeEmailGeneration(sessionId, confirmedPrompt);

      expect(result).toEqual({
        emails: [{ donorId: 1, subject: 'Thank you', body: 'Email body' }],
      });

      expect(mockEmailService.generateSmartEmails).toHaveBeenCalledWith(
        expect.objectContaining({
          instruction: confirmedPrompt,
          donors: expect.arrayContaining([
            expect.objectContaining({
              id: 1,
              firstName: 'John',
              lastName: 'Doe',
              email: 'john@example.com',
            }),
          ]),
          organizationName: mockInput.organizationName,
        }),
        'org123',
        ''
      );
    });

    it('should clean up session after execution', async () => {
      await service.executeEmailGeneration(sessionId, confirmedPrompt);

      const state = service.getSessionState(sessionId);
      expect(state).toBeNull();
    });

    it('should handle missing donor names', async () => {
      const mockState = {
        sessionId,
        context: {
          ...mockContext,
          organization: { id: 'org123' },
          donors: [
            {
              id: 1,
              email: 'john@example.com',
            },
          ],
        },
        steps: mockFlowResult.steps,
        isComplete: false,
        needsUserInput: false,
      };
      (service as any).activeSessions.set(sessionId, mockState);

      await service.executeEmailGeneration(sessionId, confirmedPrompt);

      expect(mockEmailService.generateSmartEmails).toHaveBeenCalledWith(
        expect.objectContaining({
          donors: expect.arrayContaining([
            expect.objectContaining({
              id: 1,
              firstName: '',
              lastName: '',
              email: 'john@example.com',
            }),
          ]),
        }),
        'org123',
        ''
      );
    });

    it('should throw error for non-existent session', async () => {
      await expect(
        service.executeEmailGeneration('invalid-session', confirmedPrompt)
      ).rejects.toThrow('Session not found or expired');
    });

    it('should handle email generation errors', async () => {
      mockEmailService.generateSmartEmails.mockRejectedValue(new Error('Email generation failed'));

      await expect(
        service.executeEmailGeneration(sessionId, confirmedPrompt)
      ).rejects.toThrow('Failed to execute email generation');
    });
  });

  describe('getSessionState', () => {
    it('should return session state when exists', () => {
      const sessionId = 'agentic_123_abc';
      const mockState = {
        sessionId,
        context: mockContext,
        steps: mockFlowResult.steps,
        isComplete: false,
        needsUserInput: true,
      };
      (service as any).activeSessions.set(sessionId, mockState);

      const state = service.getSessionState(sessionId);
      expect(state).toEqual(mockState);
    });

    it('should return null for non-existent session', () => {
      const state = service.getSessionState('invalid-session');
      expect(state).toBeNull();
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should remove completed sessions', () => {
      const completedSession = {
        sessionId: 'completed',
        context: mockContext,
        steps: [],
        isComplete: true,
        needsUserInput: false,
      };
      const activeSession = {
        sessionId: 'active',
        context: mockContext,
        steps: [],
        isComplete: false,
        needsUserInput: true,
      };

      (service as any).activeSessions.set('completed', completedSession);
      (service as any).activeSessions.set('active', activeSession);

      service.cleanupExpiredSessions();

      expect(service.getSessionState('completed')).toBeNull();
      expect(service.getSessionState('active')).toBeDefined();
    });
  });

  describe('convertStepsToMessages', () => {
    it('should convert steps to conversation messages', () => {
      const steps = [
        {
          type: 'initial' as const,
          content: 'Step 1',
          questions: ['Q1?', 'Q2?'],
        },
        {
          type: 'followup' as const,
          content: 'Step 2',
        },
      ];

      const messages = (service as any).convertStepsToMessages(steps);

      expect(messages).toHaveLength(4); // 2 steps + 2 questions
      expect(messages[0]).toMatchObject({
        role: 'assistant',
        content: 'Step 1',
        stepType: 'initial',
      });
      expect(messages[1]).toMatchObject({
        role: 'assistant',
        content: 'Q1?',
        stepType: 'question',
      });
      expect(messages[2]).toMatchObject({
        role: 'assistant',
        content: 'Q2?',
        stepType: 'question',
      });
      expect(messages[3]).toMatchObject({
        role: 'assistant',
        content: 'Step 2',
        stepType: 'followup',
      });
    });
  });

  describe('generateSessionId', () => {
    it('should generate unique session IDs', () => {
      const id1 = (service as any).generateSessionId();
      const id2 = (service as any).generateSessionId();

      expect(id1).toMatch(/^agentic_\d+_[a-z0-9]+$/);
      expect(id2).toMatch(/^agentic_\d+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });
});