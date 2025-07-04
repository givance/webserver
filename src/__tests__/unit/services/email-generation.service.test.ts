import {
  EmailGenerationService,
  type GenerateEmailsInput,
  type DonorInput,
} from "@/app/lib/services/email-generation.service";
import { PersonResearchService } from "@/app/lib/services/person-research.service";
import { TRPCError } from "@trpc/server";
import { db } from "@/app/lib/db";
import * as orgData from "@/app/lib/data/organizations";
import * as userData from "@/app/lib/data/users";
import * as commData from "@/app/lib/data/communications";
import * as donationData from "@/app/lib/data/donations";
import { generateSmartDonorEmails } from "@/app/lib/utils/email-generator";
import { processProjectMentions } from "@/app/lib/utils/email-generator/mention-processor";
import { logger } from "@/app/lib/logger";

// Mock dependencies
jest.mock("@/app/lib/db");
jest.mock("@/app/lib/data/organizations");
jest.mock("@/app/lib/data/users");
jest.mock("@/app/lib/data/communications");
jest.mock("@/app/lib/data/donations");
jest.mock("@/app/lib/utils/email-generator");
jest.mock("@/app/lib/utils/email-generator/mention-processor");
jest.mock("@/app/lib/services/person-research.service");
jest.mock("@/app/lib/logger");
jest.mock("drizzle-orm", () => ({
  eq: jest.fn((a, b) => ({ type: "eq", a, b })),
  and: jest.fn((...conditions) => ({ type: "and", conditions })),
  inArray: jest.fn((column, values) => ({ type: "inArray", column, values })),
  sql: jest.fn((strings, ...values) => ({ type: "sql", strings, values })),
  relations: jest.fn(() => ({})),
}));

describe("EmailGenerationService", () => {
  let service: EmailGenerationService;
  let mockPersonResearchService: jest.Mocked<PersonResearchService>;

  const mockOrganization = {
    id: "org123",
    name: "Test Foundation",
    websiteSummary: "We help communities",
    writingInstructions: "Be warm and personal",
  };

  const mockDonors: DonorInput[] = [
    { id: 1, firstName: "John", lastName: "Doe", email: "john@example.com" },
    { id: 2, firstName: "Jane", lastName: "Smith", email: "jane@example.com" },
  ];

  const mockFullDonors = [
    {
      id: 1,
      firstName: "John",
      lastName: "Doe",
      email: "john@example.com",
      notes: "VIP donor",
      displayName: "John Doe",
      hisFirstName: "John",
      hisLastName: "Doe",
      isCouple: false,
      organizationId: "org123",
      assignedStaff: {
        id: 10,
        firstName: "Sarah",
        lastName: "Johnson",
        signature: "Best regards,\nSarah Johnson",
      },
    },
    {
      id: 2,
      firstName: "Jane",
      lastName: "Smith",
      email: "jane@example.com",
      notes: "Regular donor",
      displayName: "Jane Smith",
      herFirstName: "Jane",
      herLastName: "Smith",
      isCouple: false,
      organizationId: "org123",
      assignedStaff: null,
    },
  ];

  const mockUser = {
    id: "user123",
    firstName: "Test",
    lastName: "User",
    emailSignature: "Best regards,\nTest User",
  };

  const mockPrimaryStaff = {
    id: 20,
    firstName: "Primary",
    lastName: "Staff",
    signature: "Sincerely,\nPrimary Staff",
    isPrimary: true,
    organizationId: "org123",
  };

  const mockGeneratedEmailsForDonor1 = {
    emails: [
      {
        donorId: 1,
        subject: "Thank you for your support",
        structuredContent: [
          {
            piece: "Dear John,",
            references: ["salutation"],
            addNewlineAfter: true,
          },
          {
            piece: "Thank you for your generous support.",
            references: ["gratitude"],
            addNewlineAfter: true,
          },
        ],
        referenceContexts: {
          salutation: "Greeting the donor",
          gratitude: "Expressing thanks",
        },
      },
    ],
    tokenUsage: {
      instructionRefinement: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
      emailGeneration: { promptTokens: 250, completionTokens: 150, totalTokens: 400 },
      total: { promptTokens: 300, completionTokens: 175, totalTokens: 475 },
    },
  };

  const mockGeneratedEmailsForDonor2 = {
    emails: [
      {
        donorId: 2,
        subject: "Your impact matters",
        structuredContent: [
          {
            piece: "Dear Jane,",
            references: ["salutation"],
            addNewlineAfter: true,
          },
          {
            piece: "Your support makes a difference.",
            references: ["impact"],
            addNewlineAfter: true,
          },
        ],
        referenceContexts: {
          salutation: "Greeting the donor",
          impact: "Highlighting donor impact",
        },
      },
    ],
    tokenUsage: {
      instructionRefinement: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
      emailGeneration: { promptTokens: 250, completionTokens: 150, totalTokens: 400 },
      total: { promptTokens: 300, completionTokens: 175, totalTokens: 475 },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mocks
    mockPersonResearchService = {
      getPersonResearch: jest.fn(),
    } as any;

    (PersonResearchService as jest.Mock).mockImplementation(() => mockPersonResearchService);

    service = new EmailGenerationService();

    // Default mocks
    (processProjectMentions as jest.Mock).mockImplementation(async (text) => text);
    // Mock generateSmartDonorEmails to return appropriate email based on donor
    (generateSmartDonorEmails as jest.Mock).mockImplementation(async (donors) => {
      // Since the service now calls with single donors, check the first donor
      const donor = donors[0];
      if (donor.id === 1) {
        return mockGeneratedEmailsForDonor1;
      } else if (donor.id === 2) {
        return mockGeneratedEmailsForDonor2;
      }
      throw new Error(`Unexpected donor ID: ${donor.id}`);
    });
  });

  describe("generateSmartEmails", () => {
    const input: GenerateEmailsInput = {
      instruction: "Write a thank you email",
      donors: mockDonors,
      organizationName: "Test Foundation",
      organizationWritingInstructions: "Be warm",
      currentDate: "2024-01-01",
    };

    beforeEach(() => {
      // Mock database queries
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockOrganization]),
          }),
        }),
      });

      (db.query as any) = {
        donors: {
          findMany: jest.fn().mockResolvedValue(mockFullDonors),
        },
        staff: {
          findFirst: jest.fn().mockResolvedValue(mockPrimaryStaff),
        },
      };

      // Mock data functions
      (orgData.getOrganizationMemories as jest.Mock).mockResolvedValue(["Org memory 1"]);
      (userData.getUserMemories as jest.Mock).mockResolvedValue(["User memory 1"]);
      (userData.getUserById as jest.Mock).mockResolvedValue(mockUser);
      (commData.getDonorCommunicationHistory as jest.Mock).mockResolvedValue([
        { content: [{ content: "Previous email" }] },
      ]);
      (donationData.listDonations as jest.Mock).mockResolvedValue({
        donations: [{ amount: 1000, date: new Date("2023-01-01") }],
      });
      (donationData.getMultipleComprehensiveDonorStatsExcludingExternal as jest.Mock).mockResolvedValue({
        1: {
          totalAmount: 5000,
          totalDonations: 5,
          firstDonation: { amount: 500, date: new Date("2020-01-01") },
          lastDonation: { amount: 1000, date: new Date("2023-01-01") },
          donationsByProject: [],
        },
        2: {
          totalAmount: 3000,
          totalDonations: 3,
          firstDonation: { amount: 1000, date: new Date("2021-01-01") },
          lastDonation: { amount: 1000, date: new Date("2023-01-01") },
          donationsByProject: [],
        },
      });
      mockPersonResearchService.getPersonResearch.mockResolvedValue({
        researchTopic: "Donor background",
        answer: "Research answer",
        citations: [],
      });
    });

    it("should generate emails successfully with all data", async () => {
      const result = await service.generateSmartEmails(input, "org123", "user123");

      expect(result.emails).toHaveLength(2);
      // Token usage should be the sum of both individual calls
      expect(result.tokenUsage.total.totalTokens).toBe(950); // 475 + 475

      // Verify organization fetch
      expect(db.select).toHaveBeenCalled();

      // Verify donor data fetch
      expect(db.query.donors.findMany).toHaveBeenCalledWith({
        where: expect.anything(),
        with: { assignedStaff: true },
      });

      // Verify all data fetches
      expect(commData.getDonorCommunicationHistory).toHaveBeenCalledTimes(2);
      expect(donationData.listDonations).toHaveBeenCalledTimes(2);
      expect(donationData.getMultipleComprehensiveDonorStatsExcludingExternal).toHaveBeenCalledWith([1, 2], "org123");
      expect(mockPersonResearchService.getPersonResearch).toHaveBeenCalledTimes(2);

      // Verify email generation calls - should be called twice (once per donor)
      expect(generateSmartDonorEmails).toHaveBeenCalledTimes(2);
      
      // Verify first call (for donor 1)
      expect(generateSmartDonorEmails).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 1,
            email: "john@example.com",
            notes: "VIP donor",
          }),
        ]),
        "Write a thank you email",
        "Test Foundation",
        expect.objectContaining({
          id: "org123",
          rawWebsiteSummary: "We help communities",
        }),
        "Be warm and personal",        // organizationWritingInstructions
        undefined,                      // staffWritingInstructions
        expect.any(Object),             // communicationHistories
        expect.any(Object),             // donationHistories
        expect.any(Object),             // donorStatistics
        expect.any(Object),             // personResearchResults
        ["User memory 1"],
        ["Org memory 1"],
        expect.any(String),             // currentDate
        undefined,                      // previousInstruction
        undefined,                      // chatHistory
        expect.any(String)              // staffName
      );
    });

    it("should generate emails without signatures (signatures added at runtime)", async () => {
      const result = await service.generateSmartEmails(input, "org123", "user123");

      // Emails should not contain signatures as they are added at runtime
      expect(result.emails[0].structuredContent).not.toContainEqual(
        expect.objectContaining({
          references: expect.arrayContaining(["signature"]),
        })
      );

      expect(result.emails[1].structuredContent).not.toContainEqual(
        expect.objectContaining({
          references: expect.arrayContaining(["signature"]),
        })
      );

      // The service should still determine appropriate staff names
      expect(generateSmartDonorEmails).toHaveBeenCalledWith(
        expect.any(Array),              // donors
        expect.any(String),             // userInstruction
        expect.any(String),             // organizationName
        expect.any(Object),             // organization
        expect.any(String),             // organizationWritingInstructions
        undefined,                      // staffWritingInstructions
        expect.any(Object),             // communicationHistories
        expect.any(Object),             // donationHistories
        expect.any(Object),             // donorStatistics
        expect.any(Object),             // personResearchResults
        expect.any(Array),              // userMemories
        expect.any(Array),              // organizationMemories
        expect.any(String),             // currentDate
        undefined,                      // previousInstruction
        undefined,                      // chatHistory
        expect.any(String)              // staffName
      );
    });

    it("should pass appropriate staff names even without custom signatures", async () => {
      // Remove custom signatures
      mockFullDonors[0].assignedStaff!.signature = "";
      mockPrimaryStaff.signature = "";

      const result = await service.generateSmartEmails(input, "org123", "user123");

      // Verify staff names are still passed correctly
      expect(generateSmartDonorEmails).toHaveBeenNthCalledWith(
        1,
        expect.any(Array),              // donors
        expect.any(String),             // userInstruction
        expect.any(String),             // organizationName
        expect.any(Object),             // organization
        expect.any(String),             // organizationWritingInstructions
        undefined,                      // staffWritingInstructions
        expect.any(Object),             // communicationHistories
        expect.any(Object),             // donationHistories
        expect.any(Object),             // donorStatistics
        expect.any(Object),             // personResearchResults
        expect.any(Array),              // userMemories
        expect.any(Array),              // organizationMemories
        expect.any(String),             // currentDate
        undefined,                      // previousInstruction
        undefined,                      // chatHistory
        expect.any(String)              // staffName
      );

      expect(generateSmartDonorEmails).toHaveBeenNthCalledWith(
        2,
        expect.any(Array),              // donors
        expect.any(String),             // userInstruction
        expect.any(String),             // organizationName
        expect.any(Object),             // organization
        expect.any(String),             // organizationWritingInstructions
        undefined,                      // staffWritingInstructions
        expect.any(Object),             // communicationHistories
        expect.any(Object),             // donationHistories
        expect.any(Object),             // donorStatistics
        expect.any(Object),             // personResearchResults
        expect.any(Array),              // userMemories
        expect.any(Array),              // organizationMemories
        expect.any(String),             // currentDate
        undefined,                      // previousInstruction
        undefined,                      // chatHistory
        "Primary Staff"                 // staffName
      );
    });

    it("should pass undefined staff name when no staff available", async () => {
      // Remove all staff
      mockFullDonors[0].assignedStaff = null;
      (db.query.staff.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.generateSmartEmails(input, "org123", "user123");

      // Both calls should have undefined staff name
      expect(generateSmartDonorEmails).toHaveBeenCalledWith(
        expect.any(Array),              // donors
        expect.any(String),             // userInstruction
        expect.any(String),             // organizationName
        expect.any(Object),             // organization
        expect.any(String),             // organizationWritingInstructions
        undefined,                      // staffWritingInstructions
        expect.any(Object),             // communicationHistories
        expect.any(Object),             // donationHistories
        expect.any(Object),             // donorStatistics
        expect.any(Object),             // personResearchResults
        expect.any(Array),              // userMemories
        expect.any(Array),              // organizationMemories
        expect.any(String),             // currentDate
        undefined,                      // previousInstruction
        undefined,                      // chatHistory
        undefined                       // No staff name
      );
    });

    it("should process project mentions in instruction", async () => {
      (processProjectMentions as jest.Mock).mockResolvedValue("Processed instruction with project details");

      await service.generateSmartEmails(input, "org123", "user123");

      expect(processProjectMentions).toHaveBeenCalledWith("Write a thank you email", "org123");
      expect(generateSmartDonorEmails).toHaveBeenCalledTimes(2);
      
      // Verify that both calls used the processed instruction
      expect(generateSmartDonorEmails).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 1,
            email: "john@example.com",
            notes: "VIP donor",
          }),
        ]),
        "Processed instruction with project details",
        "Test Foundation",
        expect.objectContaining({
          id: "org123",
          rawWebsiteSummary: "We help communities",
        }),
        "Be warm and personal",        // organizationWritingInstructions
        undefined,                      // staffWritingInstructions
        expect.any(Object),             // communicationHistories
        expect.any(Object),             // donationHistories
        expect.any(Object),             // donorStatistics
        expect.any(Object),             // personResearchResults
        ["User memory 1"],
        ["Org memory 1"],
        expect.any(String),             // currentDate
        undefined,                      // previousInstruction
        undefined,                      // chatHistory
        expect.any(String)              // staffName
      );
    });

    it("should throw error if organization not found", async () => {
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      await expect(service.generateSmartEmails(input, "org123", "user123")).rejects.toThrow(TRPCError);

      await expect(service.generateSmartEmails(input, "org123", "user123")).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "Organization not found",
      });
    });

    it("should throw error if some donors not found", async () => {
      (db.query.donors.findMany as jest.Mock).mockResolvedValue([mockFullDonors[0]]); // Only return one donor

      await expect(service.generateSmartEmails(input, "org123", "user123")).rejects.toThrow(TRPCError);

      await expect(service.generateSmartEmails(input, "org123", "user123")).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "Some donors not found or don't belong to this organization",
      });
    });

    it("should handle person research fetch failures gracefully", async () => {
      mockPersonResearchService.getPersonResearch
        .mockResolvedValueOnce({ researchTopic: "Topic", answer: "Answer", citations: [] })
        .mockRejectedValueOnce(new Error("Research failed"));

      const result = await service.generateSmartEmails(input, "org123", "user123");

      expect(result.emails).toHaveLength(2);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Failed to fetch person research for donor 2"));
    });

    it("should pass chat history and previous instruction when provided", async () => {
      const inputWithHistory: GenerateEmailsInput = {
        ...input,
        previousInstruction: "Previous instruction",
        chatHistory: [
          { role: "user", content: "Make it shorter" },
          { role: "assistant", content: "I will make it shorter" },
        ],
      };

      await service.generateSmartEmails(inputWithHistory, "org123", "user123");

      expect(generateSmartDonorEmails).toHaveBeenCalledWith(
        expect.any(Array),              // donors
        expect.any(String),             // userInstruction
        expect.any(String),             // organizationName
        expect.any(Object),             // organization
        expect.any(String),             // organizationWritingInstructions
        undefined,                      // staffWritingInstructions
        expect.any(Object),             // communicationHistories
        expect.any(Object),             // donationHistories
        expect.any(Object),             // donorStatistics
        expect.any(Object),             // personResearchResults
        expect.any(Array),              // userMemories
        expect.any(Array),              // organizationMemories
        expect.any(String),             // currentDate
        "Previous instruction",
        inputWithHistory.chatHistory,
        expect.any(String)              // staffName
      );
    });

    it("should handle couple donors appropriately", async () => {
      const coupleDonor = {
        ...mockFullDonors[0],
        isCouple: true,
        hisFirstName: "John",
        herFirstName: "Mary",
        hisLastName: "Doe",
        herLastName: "Doe",
      };
      (db.query.donors.findMany as jest.Mock).mockResolvedValue([coupleDonor, mockFullDonors[1]]);

      const result = await service.generateSmartEmails(input, "org123", "user123");

      expect(generateSmartDonorEmails).toHaveBeenCalledTimes(2);
      
      // Verify the first call includes couple information
      expect(generateSmartDonorEmails).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 1,
            isCouple: true,
            hisFirstName: "John",
            herFirstName: "Mary",
          }),
        ]),
        "Write a thank you email",
        "Test Foundation",
        expect.objectContaining({
          id: "org123",
          rawWebsiteSummary: "We help communities",
        }),
        "Be warm and personal",        // organizationWritingInstructions
        undefined,                      // staffWritingInstructions
        expect.any(Object),             // communicationHistories
        expect.any(Object),             // donationHistories
        expect.any(Object),             // donorStatistics
        expect.any(Object),             // personResearchResults
        ["User memory 1"],
        ["Org memory 1"],
        expect.any(String),             // currentDate
        undefined,                      // previousInstruction
        undefined,                      // chatHistory
        expect.any(String)              // staffName
      );
    });
  });

  describe("enhanceEmail", () => {
    const enhanceInput = {
      emailId: 100,
      enhancementInstruction: "Make it more personal",
      currentSubject: "Thank you",
      currentStructuredContent: [
        {
          piece: "Dear John,",
          references: ["salutation"],
          addNewlineAfter: true,
        },
      ],
      currentReferenceContexts: {
        salutation: "Greeting",
      },
    };

    const mockEmailData = {
      id: 100,
      donorId: 1,
      sentAt: null,
      sessionId: 200,
      session: {
        id: 200,
        organizationId: "org123",
        instruction: "Original instruction",
      },
      donor: mockFullDonors[0],
    };

    beforeEach(() => {
      // Mock database queries
      (db.query as any) = {
        generatedEmails: {
          findFirst: jest.fn().mockResolvedValue(mockEmailData),
        },
        staff: {
          findFirst: jest.fn().mockResolvedValue(mockPrimaryStaff),
        },
      };

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockOrganization]),
          }),
        }),
      });

      const mockUpdate = jest.fn();
      const mockSet = jest.fn();
      const mockWhere = jest.fn();
      const mockReturning = jest.fn();

      mockUpdate.mockReturnValue({ set: mockSet });
      mockSet.mockReturnValue({ where: mockWhere });
      mockWhere.mockReturnValue({ returning: mockReturning });
      mockReturning.mockResolvedValue([
        {
          ...mockEmailData,
          subject: "Enhanced subject",
          structuredContent: [{ piece: "Enhanced content", references: [], addNewlineAfter: false }],
        },
      ]);

      (db.update as jest.Mock).mockImplementation(() => ({
        set: mockSet,
      }));

      // Mock generateSmartDonorEmails to return enhanced email
      (generateSmartDonorEmails as jest.Mock).mockResolvedValue({
        refinedInstruction: "Enhanced instruction",
        reasoning: "Enhancement reasoning",
        emails: [
          {
            donorId: 1,
            subject: "Enhanced subject",
            structuredContent: [{ piece: "Enhanced content", references: [], addNewlineAfter: false }],
            referenceContexts: { greeting: "Enhanced greeting" },
            tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          },
        ],
        tokenUsage: {
          instructionRefinement: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
          emailGeneration: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          total: { promptTokens: 150, completionTokens: 75, totalTokens: 225 },
        },
      });

      // Mock data functions
      (commData.getDonorCommunicationHistory as jest.Mock).mockResolvedValue([]);
      (donationData.listDonations as jest.Mock).mockResolvedValue({ donations: [] });
      (donationData.getMultipleComprehensiveDonorStatsExcludingExternal as jest.Mock).mockResolvedValue({
        1: { totalAmount: 1000, totalDonations: 1 },
      });
      (orgData.getOrganizationMemories as jest.Mock).mockResolvedValue([]);
      (userData.getUserMemories as jest.Mock).mockResolvedValue([]);
    });

    it("should enhance email successfully", async () => {
      const result = await service.enhanceEmail(enhanceInput, "org123", "user123");

      expect(result).toMatchObject({
        subject: "Enhanced subject",
        structuredContent: expect.any(Array),
        referenceContexts: expect.any(Object),
        email: expect.objectContaining({
          id: 100,
          subject: "Enhanced subject",
        }),
        sessionId: 200,
      });

      expect(db.query.generatedEmails.findFirst).toHaveBeenCalledWith({
        where: expect.any(Object),
        with: { donor: { with: { assignedStaff: true } }, session: true },
      });

      // Verify that generateSmartDonorEmails was called with enhanced instruction
      expect(generateSmartDonorEmails).toHaveBeenCalled();
    });

    it("should throw error if email not found", async () => {
      (db.query.generatedEmails.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.enhanceEmail(enhanceInput, "org123", "user123")).rejects.toThrow(TRPCError);

      await expect(service.enhanceEmail(enhanceInput, "org123", "user123")).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "Email not found",
      });
    });

    it("should throw error if email belongs to different organization", async () => {
      (db.query.generatedEmails.findFirst as jest.Mock).mockResolvedValue({
        ...mockEmailData,
        session: { ...mockEmailData.session, organizationId: "different-org" },
      });

      await expect(service.enhanceEmail(enhanceInput, "org123", "user123")).rejects.toThrow(TRPCError);

      await expect(service.enhanceEmail(enhanceInput, "org123", "user123")).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "Email does not belong to your organization",
      });
    });

    it("should throw error if email already sent", async () => {
      (db.query.generatedEmails.findFirst as jest.Mock).mockResolvedValue({
        ...mockEmailData,
        sentAt: new Date(),
      });

      await expect(service.enhanceEmail(enhanceInput, "org123", "user123")).rejects.toThrow(TRPCError);

      await expect(service.enhanceEmail(enhanceInput, "org123", "user123")).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "Cannot enhance an email that has already been sent",
      });
    });

    it("should handle person research fetch failure gracefully", async () => {
      mockPersonResearchService.getPersonResearch.mockRejectedValue(new Error("Research failed"));

      const result = await service.enhanceEmail(enhanceInput, "org123", "user123");

      expect(result).toBeDefined();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to fetch person research for donor 1 during enhancement")
      );
    });

    it("should update database with enhanced content", async () => {
      await service.enhanceEmail(enhanceInput, "org123", "user123");

      expect(db.update).toHaveBeenCalledWith(expect.any(Object));
    });

    it("should use generateSmartDonorEmails for actual enhancement", async () => {
      await service.enhanceEmail(enhanceInput, "org123", "user123");

      expect(generateSmartDonorEmails).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 1,
            firstName: "John",
            lastName: "Doe",
            email: "john@example.com",
          }),
        ]),
        expect.stringContaining("Original instruction"),
        "Test Foundation",
        expect.objectContaining({
          id: "org123",
          name: "Test Foundation",
        }),
        "Be warm and personal",        // organizationWritingInstructions
        undefined,                      // staffWritingInstructions
        expect.any(Object),             // communicationHistories
        expect.any(Object),             // donationHistories
        expect.any(Object),             // donorStatistics
        expect.any(Object),             // personResearchResults
        expect.any(Array),              // userMemories
        expect.any(Array),              // organizationMemories
        expect.any(String),             // currentDate
        "Original instruction",         // previousInstruction
        undefined                       // chatHistory
        // No staffName parameter in enhancement
      );
    });
  });
});
