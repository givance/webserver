import {
  EmailGenerationService,
  type GenerateEmailsInput,
  type DonorInput,
} from "@/app/lib/services/email-generation.service";
import { UnifiedSmartEmailGenerationService } from "@/app/lib/services/unified-smart-email-generation.service";
import { TRPCError } from "@trpc/server";
import { db } from "@/app/lib/db";
import { logger } from "@/app/lib/logger";

// Mock dependencies
jest.mock("@/app/lib/db");
jest.mock("@/app/lib/services/unified-smart-email-generation.service");
jest.mock("@/app/lib/logger");
jest.mock("drizzle-orm", () => ({
  eq: jest.fn((a, b) => ({ type: "eq", a, b })),
  sql: jest.fn((strings, ...values) => ({
    type: "sql",
    strings,
    values,
  })),
  relations: jest.fn(() => ({})),
}));

const mockDb = db as jest.Mocked<typeof db>;
const mockUnifiedService = UnifiedSmartEmailGenerationService as jest.MockedClass<typeof UnifiedSmartEmailGenerationService>;

describe("EmailGenerationService", () => {
  let service: EmailGenerationService;
  let mockUnifiedServiceInstance: jest.Mocked<UnifiedSmartEmailGenerationService>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock instance of UnifiedSmartEmailGenerationService
    mockUnifiedServiceInstance = {
      generateSmartEmailsForCampaign: jest.fn(),
    } as any;
    
    mockUnifiedService.mockImplementation(() => mockUnifiedServiceInstance);
    
    service = new EmailGenerationService();
  });

  const mockDonors: DonorInput[] = [
    { id: 1, firstName: "John", lastName: "Doe", email: "john@example.com" },
    { id: 2, firstName: "Jane", lastName: "Smith", email: "jane@example.com" },
  ];

  const mockInput: GenerateEmailsInput = {
    donors: mockDonors,
    organizationName: "Test Org",
    chatHistory: [
      { role: "user", content: "Write a thank you email" },
    ],
  };

  describe("generateSmartEmails", () => {
    it("should create a temporary session and use UnifiedSmartEmailGenerationService", async () => {
      // Mock database operations
      const mockSessionId = 123;
      mockDb.insert = jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{ id: mockSessionId }]),
        }),
      });
      
      mockDb.update = jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      });

      // Mock unified service response
      const mockGeneratedEmails = {
        results: [
          {
            donor: { id: 1, firstName: "John", lastName: "Doe" },
            email: {
              subject: "Thank you!",
              content: "Thank you for your support.",
              reasoning: "Personalized thank you",
              response: "Generated thank you email",
            },
            tokensUsed: 100,
          },
          {
            donor: { id: 2, firstName: "Jane", lastName: "Smith" },
            email: {
              subject: "Thank you Jane!",
              content: "Thank you Jane for your support.",
              reasoning: "Personalized for Jane",
              response: "Generated thank you email for Jane",
            },
            tokensUsed: 110,
          },
        ],
        totalTokensUsed: 210,
      };

      mockUnifiedServiceInstance.generateSmartEmailsForCampaign.mockResolvedValue(mockGeneratedEmails);

      // Call the service
      const result = await service.generateSmartEmails(mockInput, "org-123", "user-456");

      // Verify session was created
      expect(mockDb.insert).toHaveBeenCalled();
      
      // Verify unified service was called with correct params
      expect(mockUnifiedServiceInstance.generateSmartEmailsForCampaign).toHaveBeenCalledWith({
        organizationId: "org-123",
        sessionId: String(mockSessionId),
        chatHistory: mockInput.chatHistory,
        donorIds: ["1", "2"],
      });

      // Verify response structure
      expect(result).toEqual({
        emails: [
          {
            donorId: 1,
            subject: "Thank you!",
            emailContent: "Thank you for your support.",
            reasoning: "Personalized thank you",
            response: "Generated thank you email",
            structuredContent: [{
              piece: "Thank you for your support.",
              references: ['email-content'],
              addNewlineAfter: false,
            }],
            referenceContexts: { 'email-content': 'Generated email content' },
            tokenUsage: {
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 100,
            },
          },
          {
            donorId: 2,
            subject: "Thank you Jane!",
            emailContent: "Thank you Jane for your support.",
            reasoning: "Personalized for Jane",
            response: "Generated thank you email for Jane",
            structuredContent: [{
              piece: "Thank you Jane for your support.",
              references: ['email-content'],
              addNewlineAfter: false,
            }],
            referenceContexts: { 'email-content': 'Generated email content' },
            tokenUsage: {
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 110,
            },
          },
        ],
        sessionId: mockSessionId,
        tokensUsed: 210,
      });

      // Verify session was updated
      expect(mockDb.update).toHaveBeenCalled();
    });

    it("should handle errors from unified service", async () => {
      // Mock database operations
      mockDb.insert = jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{ id: 123 }]),
        }),
      });

      // Mock unified service to throw error
      mockUnifiedServiceInstance.generateSmartEmailsForCampaign.mockRejectedValue(
        new Error("AI service error")
      );

      // Call the service and expect error
      await expect(
        service.generateSmartEmails(mockInput, "org-123", "user-456")
      ).rejects.toThrow(TRPCError);
    });

    it("should filter out null emails from results", async () => {
      // Mock database operations
      mockDb.insert = jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{ id: 123 }]),
        }),
      });
      
      mockDb.update = jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      });

      // Mock unified service response with one null email
      const mockGeneratedEmails = {
        results: [
          {
            donor: { id: 1, firstName: "John", lastName: "Doe" },
            email: {
              subject: "Thank you!",
              content: "Thank you for your support.",
              reasoning: "Personalized thank you",
              response: "Generated thank you email",
            },
            tokensUsed: 100,
          },
          {
            donor: { id: 2, firstName: "Jane", lastName: "Smith" },
            email: null,
            tokensUsed: 0,
          },
        ],
        totalTokensUsed: 100,
      };

      mockUnifiedServiceInstance.generateSmartEmailsForCampaign.mockResolvedValue(mockGeneratedEmails);

      // Call the service
      const result = await service.generateSmartEmails(mockInput, "org-123", "user-456");

      // Verify only non-null email is returned
      expect(result.emails).toHaveLength(1);
      expect(result.emails[0].donorId).toBe(1);
    });
  });
});