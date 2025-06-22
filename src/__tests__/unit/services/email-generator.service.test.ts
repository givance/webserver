import { EmailGenerationService } from "@/app/lib/utils/email-generator/service";
import { generateObject } from "ai";
import { createAzure } from "@ai-sdk/azure";
import { logger } from "@/app/lib/logger";
import { processProjectMentions } from "@/app/lib/utils/email-generator/mention-processor";

// Mock dependencies
jest.mock("@/app/lib/logger");
jest.mock("ai");
jest.mock("@/app/lib/utils/email-generator/mention-processor");
jest.mock("@/app/lib/env", () => ({
  env: {
    AZURE_OPENAI_RESOURCE_NAME: "test-resource",
    AZURE_OPENAI_API_KEY: "test-key",
    AZURE_OPENAI_DEPLOYMENT_NAME: "test-deployment",
    MID_MODEL: "gpt-4",
  },
}));

// Mock the azure SDK with a function that returns a model
jest.mock("@ai-sdk/azure", () => ({
  createAzure: jest.fn(() => jest.fn().mockReturnValue("azure-model")),
}));

const mockGenerateObject = generateObject as jest.MockedFunction<typeof generateObject>;
const mockProcessProjectMentions = processProjectMentions as jest.MockedFunction<typeof processProjectMentions>;

describe("EmailGenerationService", () => {
  let service: EmailGenerationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EmailGenerationService();

    // Setup default mock for processProjectMentions
    mockProcessProjectMentions.mockImplementation(async (content, orgId) => content);
  });

  describe("generateEmails", () => {
    const mockOrganization = {
      id: "org123",
      name: "Test Foundation",
      description: "A nonprofit foundation focused on education",
      websiteSummary: "We provide educational opportunities to underserved communities.",
      writingInstructions: null,
    };

    const mockDonor = {
      id: 1,
      firstName: "John",
      lastName: "Doe",
      displayName: "John Doe",
      hisFirstName: "John",
      hisLastName: "Doe",
      herFirstName: null,
      herLastName: null,
      hisTitle: null,
      herTitle: null,
      hisInitial: null,
      herInitial: null,
      notes: null,
      email: "john@example.com",
      isCouple: false,
      currentStageName: "Initial Contact",
      organizationId: "org123",
    };

    const mockUserMemory = "Prefers formal tone";
    const mockOrganizationMemory = "Focus on education programs";

    const mockGeneratedEmail = {
      subject: "Thank you for your support",
      content: [
        {
          piece: "Dear John,",
          references: ["salutation"],
          addNewlineAfter: true,
        },
        {
          piece: "Thank you for your continued support of our mission.",
          references: ["gratitude"],
          addNewlineAfter: true,
        },
      ],
    };

    it("should generate personalized emails for donors", async () => {
      mockGenerateObject.mockResolvedValue({
        object: mockGeneratedEmail,
        finishReason: "stop",
        usage: { promptTokens: 500, completionTokens: 200, totalTokens: 700 },
      });

      const result = await service.generateEmails(
        [mockDonor], // donors
        "Write a warm thank you email emphasizing impact", // refinedInstruction
        "Test Foundation", // organizationName
        mockOrganization, // organization
        "Be warm and personal", // organizationWritingInstructions
        {}, // communicationHistories
        {}, // donationHistories
        {
          // donorStatistics
          1: {
            totalAmount: 50000,
            totalDonations: 5,
            firstDonation: {
              amount: 10000,
              date: new Date("2020-01-01"),
            },
            lastDonation: {
              amount: 20000,
              date: new Date("2024-01-01"),
            },
            donationsByProject: [],
          },
        },
        {}, // personResearchResults
        [mockUserMemory], // personalMemories
        [mockOrganizationMemory], // organizationalMemories
        "2024-01-15", // currentDate
        "Best regards,\nThe Test Foundation Team" // emailSignature
      );

      expect(mockGenerateObject).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        donorId: 1,
        subject: "Thank you for your support",
        structuredContent: mockGeneratedEmail.content,
        referenceContexts: expect.any(Object),
      });
    });

    it("should handle multiple donors with batch generation", async () => {
      const mockDonor2 = { ...mockDonor, id: 2, firstName: "Jane", email: "jane@example.com" };

      mockGenerateObject
        .mockResolvedValueOnce({
          object: mockGeneratedEmail,
          finishReason: "stop",
          usage: { promptTokens: 500, completionTokens: 200, totalTokens: 700 },
        })
        .mockResolvedValueOnce({
          object: { ...mockGeneratedEmail, subject: "Thank you Jane" },
          finishReason: "stop",
          usage: { promptTokens: 500, completionTokens: 200, totalTokens: 700 },
        });

      const result = await service.generateEmails(
        [mockDonor, mockDonor2],
        "Write warm thank you emails",
        "Test Foundation",
        mockOrganization,
        "Be warm and personal",
        {},
        {},
        {},
        {},
        [mockUserMemory],
        [mockOrganizationMemory]
      );

      expect(mockGenerateObject).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
    });

    it("should incorporate donor statistics when available", async () => {
      mockGenerateObject.mockResolvedValue({
        object: mockGeneratedEmail,
        finishReason: "stop",
        usage: { promptTokens: 600, completionTokens: 200, totalTokens: 800 },
      });

      await service.generateEmails(
        [mockDonor],
        "Write a personalized email",
        "Test Foundation",
        mockOrganization,
        "Be warm and personal",
        {
          // communicationHistories
          1: [
            {
              content: [
                {
                  content: "Thank you for your support this year...",
                },
              ],
            },
          ],
        },
        {
          // donationHistories
          1: [
            {
              id: 1,
              amount: 25000,
              date: new Date("2023-12-01"),
              donorId: 1,
              projectId: null,
              projectName: "General Fund",
              method: "check",
              type: "one-time",
              isRecurring: false,
              recurringDonationId: null,
            },
          ],
        },
        {
          // donorStatistics
          1: {
            totalAmount: 100000,
            totalDonations: 10,
            firstDonation: {
              amount: 5000,
              date: new Date("2019-01-01"),
            },
            lastDonation: {
              amount: 25000,
              date: new Date("2024-01-01"),
            },
            donationsByProject: [
              {
                projectId: 1,
                projectName: "Education Initiative",
                totalAmount: 50000,
                donationCount: 5,
              },
            ],
          },
        },
        {
          // personResearchResults
          1: {
            answer: "Major philanthropist interested in education",
            citations: [],
            researchTopic: "John Doe philanthropy",
            personIdentity: {
              fullName: "John Doe",
              profession: "Business Executive",
              location: "New York",
            },
          } as any,
        },
        [],
        []
      );

      const callArgs = mockGenerateObject.mock.calls[0][0];
      expect(callArgs.messages).toBeDefined();
      const userMessage = callArgs.messages.find((m: any) => m.role === "user");
      expect(userMessage.content).toContain("$100,000.00"); // Total donated (matches the totalAmount above)
      expect(userMessage.content).toContain("Major philanthropist"); // Research
    });

    it("should handle AI generation errors gracefully", async () => {
      mockGenerateObject.mockRejectedValue(new Error("AI service unavailable"));

      await expect(
        service.generateEmails(
          [mockDonor],
          "Write a personalized email",
          "Test Foundation",
          mockOrganization,
          "Be warm and personal",
          {},
          {},
          {},
          {},
          [],
          []
        )
      ).rejects.toThrow("AI service unavailable");

      expect(logger.error).toHaveBeenCalled();
    });

    it("should include person research in generated emails", async () => {
      const emailWithResearch = {
        ...mockGeneratedEmail,
        content: [
          {
            piece: "Thank you for your support",
            references: ["research-answer"],
            addNewlineAfter: true,
          },
        ],
      };

      mockGenerateObject.mockResolvedValue({
        object: emailWithResearch,
        finishReason: "stop",
        usage: { promptTokens: 500, completionTokens: 200, totalTokens: 700 },
      });

      const result = await service.generateEmails(
        [mockDonor],
        "Write an email",
        "Test Foundation",
        mockOrganization,
        "Be warm and personal",
        {},
        {},
        {},
        {
          // personResearchResults
          1: {
            answer: "Major philanthropist interested in education",
            citations: [],
            researchTopic: "John Doe philanthropy",
            personIdentity: {
              fullName: "John Doe",
              profession: "Business Executive",
              location: "New York",
            },
          } as any,
        },
        [],
        []
      );

      expect(result[0].referenceContexts["research-answer"]).toBe(
        "Person research: Major philanthropist interested in education"
      );
    });

    it("should handle empty donor list", async () => {
      const result = await service.generateEmails(
        [],
        "Write an email",
        "Test Foundation",
        mockOrganization,
        "Be warm and personal",
        {},
        {},
        {},
        {},
        [],
        []
      );

      expect(mockGenerateObject).not.toHaveBeenCalled();
      expect(result).toHaveLength(0);
    });

    it("should use template when templateId is provided", async () => {
      mockGenerateObject.mockResolvedValue({
        object: mockGeneratedEmail,
        finishReason: "stop",
        usage: { promptTokens: 400, completionTokens: 150, totalTokens: 550 },
      });

      await service.generateEmails(
        [mockDonor],
        "Use template for year-end appeal: Dear {firstName}, Year-end appeal template...",
        "Test Foundation",
        mockOrganization,
        "Be warm and personal",
        {},
        {},
        {},
        {},
        [],
        []
      );

      const callArgs = mockGenerateObject.mock.calls[0][0];
      const userMessage = callArgs.messages.find((m: any) => m.role === "user");
      expect(userMessage.content).toContain("Year-end appeal template");
    });

    it("should handle couple donors appropriately", async () => {
      const coupleDonor = {
        ...mockDonor,
        displayName: null, // Clear displayName to use his/her names
        isCouple: true,
        hisFirstName: "John",
        herFirstName: "Jane",
        hisLastName: "Doe",
        herLastName: "Doe",
      };

      mockGenerateObject.mockResolvedValue({
        object: {
          ...mockGeneratedEmail,
          content: [
            {
              piece: "Dear John and Jane,",
              references: ["couple_salutation"],
              addNewlineAfter: true,
            },
            ...mockGeneratedEmail.content.slice(1),
          ],
        },
        finishReason: "stop",
        usage: { promptTokens: 500, completionTokens: 200, totalTokens: 700 },
      });

      await service.generateEmails(
        [coupleDonor],
        "Write to couple",
        "Test Foundation",
        mockOrganization,
        "Be warm and personal",
        {},
        {},
        {},
        {},
        [],
        []
      );

      const callArgs = mockGenerateObject.mock.calls[0][0];
      const userMessage = callArgs.messages.find((m: any) => m.role === "user");
      expect(userMessage.content).toContain("John");
      expect(userMessage.content).toContain("Jane");
      expect(userMessage.content).toContain("couple");
    });
  });
});
