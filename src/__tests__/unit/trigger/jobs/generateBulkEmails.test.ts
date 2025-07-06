import { generateBulkEmailsTask } from "@/trigger/jobs/generateBulkEmails";
import { db } from "@/app/lib/db";
import { EmailGenerationService } from "@/app/lib/utils/email-generator/service";
import { generateSmartDonorEmails } from "@/app/lib/utils/email-generator";
import { getDonorCommunicationHistory } from "@/app/lib/data/communications";
import { listDonations, getMultipleComprehensiveDonorStats } from "@/app/lib/data/donations";
import { getOrganizationMemories } from "@/app/lib/data/organizations";
import { getUserMemories, getDismissedMemories } from "@/app/lib/data/users";
import { logger as triggerLogger } from "@trigger.dev/sdk/v3";
import { PersonResearchService } from "@/app/lib/services/person-research.service";

// Mock PersonResearchService
jest.mock("@/app/lib/services/person-research.service");

// Mock dependencies
jest.mock("@/app/lib/db");
jest.mock("@/app/lib/utils/email-generator/service");
jest.mock("@/app/lib/utils/email-generator");
jest.mock("@/app/lib/data/communications");
jest.mock("@/app/lib/data/donations");
jest.mock("@/app/lib/data/organizations");
jest.mock("@/app/lib/data/users");

// Mock the Trigger.dev SDK's task function
const mockTaskRun = jest.fn();
jest.mock("@trigger.dev/sdk/v3", () => ({
  task: (config: any) => ({
    id: config.id,
    run: config.run || mockTaskRun,
  }),
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock implementations
const mockUpdate = jest.fn();
const mockSet = jest.fn();
const mockWhere = jest.fn();
const mockSelect = jest.fn();
const mockFrom = jest.fn();
const mockLimit = jest.fn();
const mockInsert = jest.fn();
const mockValues = jest.fn();

// Mock EmailGenerationService
const mockGenerateEmails = jest.fn();
(EmailGenerationService as jest.Mock).mockImplementation(() => ({
  generateEmails: mockGenerateEmails,
}));

// Mock generateSmartDonorEmails
const mockGenerateSmartDonorEmails = jest.fn();

// Ensure the module is properly mocked after import
jest.mocked(generateSmartDonorEmails).mockImplementation(mockGenerateSmartDonorEmails);

// Test data
const mockOrganization = {
  id: "org123",
  name: "Test Foundation",
  websiteSummary: "We are a test foundation",
  writingInstructions: null,
};

const mockUser = {
  id: "user123",
  firstName: "John",
  emailSignature: "John Smith\nFundraising Director",
};

const mockDonors = [
  { id: 1, firstName: "John", lastName: "Doe", assignedStaff: null },
  {
    id: 2,
    firstName: "Jane",
    lastName: "Smith",
    assignedStaff: { id: 10, firstName: "Sarah", lastName: "Jones", signature: "Sarah Jones" },
  },
  { id: 3, firstName: "Bob", lastName: "Johnson", assignedStaff: { id: 11, firstName: "Mike", lastName: "Smith", signature: null } },
];

// Setup mock chain
const setupMockChain = () => {
  // For update queries
  mockUpdate.mockReturnValue({ set: mockSet });
  mockSet.mockReturnValue({ where: mockWhere });
  mockWhere.mockResolvedValue(undefined);

  // For select queries - need to handle both organization/user queries and existing emails query
  mockSelect.mockReturnValue({ from: mockFrom });
  mockFrom.mockReturnValue({ where: mockWhere });

  // Setup a chain that returns either limit or the final result
  mockWhere.mockImplementation(() => ({
    limit: mockLimit,
    // This allows mockWhere to also resolve directly for the existing emails query
    then: (resolve: any) => resolve([]),
  }));

  mockInsert.mockReturnValue({ values: mockValues });
  mockValues.mockResolvedValue(undefined);
};

// Helper function to setup database mocks for tests
const setupDatabaseMocks = (
  options: {
    organization?: any;
    user?: any;
    existingEmails?: any[];
  } = {}
) => {
  const { organization = mockOrganization, user = mockUser, existingEmails = [] } = options;

  // Mock db.update
  mockUpdate.mockReturnValue({ set: mockSet });
  mockSet.mockReturnValue({ where: mockWhere });
  mockWhere.mockResolvedValue(undefined);

  // Mock db.select for different queries
  let selectCount = 0;
  mockSelect.mockImplementation(() => {
    selectCount++;
    return {
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockImplementation(() => {
          if (selectCount <= 2) {
            return {
              limit: jest
                .fn()
                .mockResolvedValue(selectCount === 1 ? (organization ? [organization] : []) : user ? [user] : []),
            };
          } else {
            return Promise.resolve(existingEmails);
          }
        }),
      }),
    };
  });

  // Mock db.insert
  mockInsert.mockReturnValue({ values: mockValues });
  mockValues.mockResolvedValue(undefined);

  // Setup db mock
  (db as any).update = mockUpdate;
  (db as any).select = mockSelect;
  (db as any).insert = mockInsert;
};

describe("generateBulkEmailsTask", () => {
  const mockPayload = {
    sessionId: 1,
    organizationId: "org123",
    userId: "user123",
    selectedDonorIds: [1, 2, 3],
    previewDonorIds: [1],
    chatHistory: [
      { role: "user" as const, content: "Create campaign" },
      { role: "assistant" as const, content: "I will help create a campaign" },
    ],
    templateId: undefined,
  };

  const mockContext = {
    ctx: {
      run: { id: "job123" },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setupMockChain();

    // Setup db mocks
    (db as any).update = mockUpdate;
    (db as any).select = mockSelect;
    (db as any).insert = mockInsert;
    (db as any).query = {
      donors: {
        findMany: jest.fn().mockResolvedValue(mockDonors),
      },
      personResearch: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      staff: {
        findFirst: jest.fn().mockResolvedValue({ id: 100, firstName: "Primary", lastName: "Staff", signature: "Primary Staff" }),
      },
    };

    // Mock PersonResearchService
    (PersonResearchService as jest.Mock).mockImplementation(() => ({
      getPersonResearch: jest.fn().mockResolvedValue(null),
    }));

    // Reset generateSmartDonorEmails mock
    mockGenerateSmartDonorEmails.mockClear();

    // Setup default mocks for data functions
    (getDonorCommunicationHistory as jest.Mock).mockResolvedValue([]);
    (listDonations as jest.Mock).mockResolvedValue({ donations: [] });
    (getMultipleComprehensiveDonorStats as jest.Mock).mockResolvedValue({});
    (getOrganizationMemories as jest.Mock).mockResolvedValue([]);
    (getUserMemories as jest.Mock).mockResolvedValue([]);
    (getDismissedMemories as jest.Mock).mockResolvedValue([]);
  });

  describe("successful email generation", () => {
    it("should generate emails for all selected donors", async () => {
      // Setup database mocks
      setupDatabaseMocks();

      mockGenerateSmartDonorEmails
        .mockResolvedValueOnce({
          refinedInstruction: "Write personalized thank you emails",
          reasoning: "AI reasoning",
          emails: [
            {
              donorId: 1,
              subject: "Thank you John",
              structuredContent: [{ piece: "Dear John,", references: [], addNewlineAfter: true }],
              referenceContexts: {},
              tokenUsage: {
                promptTokens: 100,
                completionTokens: 50,
                totalTokens: 150,
              },
            },
          ],
          tokenUsage: {
            instructionRefinement: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            emailGeneration: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
            total: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          },
        })
        .mockResolvedValueOnce({
          refinedInstruction: "Write personalized thank you emails",
          reasoning: "AI reasoning",
          emails: [
            {
              donorId: 2,
              subject: "Thank you Jane",
              structuredContent: [{ piece: "Dear Jane,", references: [], addNewlineAfter: true }],
              referenceContexts: {},
              tokenUsage: {
                promptTokens: 120,
                completionTokens: 60,
                totalTokens: 180,
              },
            },
          ],
          tokenUsage: {
            instructionRefinement: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            emailGeneration: { promptTokens: 120, completionTokens: 60, totalTokens: 180 },
            total: { promptTokens: 120, completionTokens: 60, totalTokens: 180 },
          },
        })
        .mockResolvedValueOnce({
          refinedInstruction: "Write personalized thank you emails",
          reasoning: "AI reasoning",
          emails: [
            {
              donorId: 3,
              subject: "Thank you Bob",
              structuredContent: [{ piece: "Dear Bob,", references: [], addNewlineAfter: true }],
              referenceContexts: {},
              tokenUsage: {
                promptTokens: 110,
                completionTokens: 55,
                totalTokens: 165,
              },
            },
          ],
          tokenUsage: {
            instructionRefinement: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            emailGeneration: { promptTokens: 110, completionTokens: 55, totalTokens: 165 },
            total: { promptTokens: 110, completionTokens: 55, totalTokens: 165 },
          },
        });

      // Access the run function from the task configuration
      const runFunction = (generateBulkEmailsTask as any).run;
      const result = await runFunction(mockPayload, mockContext);

      // Verify session status updates
      expect(mockUpdate).toHaveBeenCalledTimes(2); // Initial and final update
      expect(mockSet).toHaveBeenNthCalledWith(1, {
        status: "GENERATING",
        triggerJobId: "job123",
        updatedAt: expect.any(Date),
      });
      expect(mockSet).toHaveBeenNthCalledWith(2, {
        status: "COMPLETED",
        completedDonors: 3,
        completedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });

      // Verify email generation was called 3 times (once per donor)
      expect(mockGenerateSmartDonorEmails).toHaveBeenCalledTimes(3);

      // Verify each call had the correct structure (checking just the first call)
      expect(mockGenerateSmartDonorEmails).toHaveBeenNthCalledWith(
        1,
        expect.arrayContaining([
          expect.objectContaining({
            id: 1,
            firstName: "John",
            lastName: "Doe",
          }),
        ]),
        "Test Foundation",
        expect.objectContaining({
          id: "org123",
          name: "Test Foundation",
        }),
        undefined, // organizationWritingInstructions
        undefined, // staffWritingInstructions
        expect.any(Object), // communicationHistories
        expect.any(Object), // donationHistories
        {}, // donorStatistics
        {}, // personResearchResults
        [], // personalMemories
        [], // organizationalMemories
        undefined, // currentDate
        expect.any(Array), // chatHistory
        expect.any(String) // staffName
      );

      // Verify emails were saved
      expect(mockInsert).toHaveBeenCalledTimes(1);
      expect(mockValues).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            sessionId: 1,
            donorId: expect.any(Number),
            subject: expect.any(String),
            structuredContent: expect.any(Array),
            status: "APPROVED",
          }),
        ])
      );
    });

    it("should append appropriate signatures based on staff assignment", async () => {
      // Setup database mocks
      setupDatabaseMocks();

      mockGenerateSmartDonorEmails
        .mockResolvedValueOnce({
          refinedInstruction: "",
          reasoning: "",
          emails: [
            {
              donorId: 1,
              subject: "Test",
              structuredContent: [{ piece: "Content", references: [], addNewlineAfter: true }],
              referenceContexts: {},
              tokenUsage: {
                promptTokens: 100,
                completionTokens: 50,
                totalTokens: 150,
              },
            },
          ],
          tokenUsage: {
            instructionRefinement: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            emailGeneration: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
            total: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          },
        })
        .mockResolvedValueOnce({
          refinedInstruction: "",
          reasoning: "",
          emails: [
            {
              donorId: 2,
              subject: "Test",
              structuredContent: [{ piece: "Content", references: [], addNewlineAfter: true }],
              referenceContexts: {},
              tokenUsage: {
                promptTokens: 120,
                completionTokens: 60,
                totalTokens: 180,
              },
            },
          ],
          tokenUsage: {
            instructionRefinement: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            emailGeneration: { promptTokens: 120, completionTokens: 60, totalTokens: 180 },
            total: { promptTokens: 120, completionTokens: 60, totalTokens: 180 },
          },
        })
        .mockResolvedValueOnce({
          refinedInstruction: "",
          reasoning: "",
          emails: [
            {
              donorId: 3,
              subject: "Test",
              structuredContent: [{ piece: "Content", references: [], addNewlineAfter: true }],
              referenceContexts: {},
              tokenUsage: {
                promptTokens: 110,
                completionTokens: 55,
                totalTokens: 165,
              },
            },
          ],
          tokenUsage: {
            instructionRefinement: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            emailGeneration: { promptTokens: 110, completionTokens: 55, totalTokens: 165 },
            total: { promptTokens: 110, completionTokens: 55, totalTokens: 165 },
          },
        });

      // Access the run function from the task configuration
      const runFunction = (generateBulkEmailsTask as any).run;
      const result = await runFunction(mockPayload, mockContext);

      // Check signatures appended - all emails are inserted in one call
      const insertCall = mockValues.mock.calls[0][0];
      expect(insertCall).toHaveLength(3);

      // Find emails by donorId
      const email1 = insertCall.find((e: any) => e.donorId === 1);
      const email2 = insertCall.find((e: any) => e.donorId === 2);
      const email3 = insertCall.find((e: any) => e.donorId === 3);

      // Donor 1 - No assigned staff, should use primary staff signature
      expect(email1.structuredContent).toContainEqual(
        expect.objectContaining({
          piece: "Primary Staff",
          references: ["signature"],
        })
      );

      // Donor 2 - Has assigned staff with custom signature
      expect(email2.structuredContent).toContainEqual(
        expect.objectContaining({
          piece: "Sarah Jones",
          references: ["signature"],
        })
      );

      // Donor 3 - Has assigned staff but no custom signature, should use "Best,\nMike"
      expect(email3.structuredContent).toContainEqual(
        expect.objectContaining({
          piece: "Best,\nMike",
          references: ["signature"],
        })
      );
    });
  });

  describe("error handling", () => {
    it("should handle organization not found error", async () => {
      setupDatabaseMocks({ organization: null });

      const runFunction = (generateBulkEmailsTask as any).run;
      await expect(runFunction(mockPayload, mockContext)).rejects.toThrow("Organization org123 not found");

      // Verify session was updated with error message
      expect(mockSet).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          errorMessage: "Organization org123 not found",
          updatedAt: expect.any(Date),
        })
      );
    });

    it("should handle user not found error", async () => {
      setupDatabaseMocks({ user: null });

      const runFunction = (generateBulkEmailsTask as any).run;
      await expect(runFunction(mockPayload, mockContext)).rejects.toThrow("User user123 not found");

      expect(mockSet).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          errorMessage: "User user123 not found",
          updatedAt: expect.any(Date),
        })
      );
    });

    it("should handle missing donors", async () => {
      setupDatabaseMocks();

      // Return only 2 donors instead of 3
      (db as any).query.donors.findMany.mockResolvedValue([mockDonors[0], mockDonors[1]]);

      const runFunction = (generateBulkEmailsTask as any).run;
      await expect(runFunction(mockPayload, mockContext)).rejects.toThrow("Some donors not found. Expected 3, found 2");
    });

    it("should handle email generation errors", async () => {
      setupDatabaseMocks();

      // Mock errors for some donors
      mockGenerateSmartDonorEmails
        .mockResolvedValueOnce({
          refinedInstruction: "",
          reasoning: "",
          emails: [
            {
              donorId: 1,
              subject: "Test",
              structuredContent: [{ piece: "Content", references: [], addNewlineAfter: true }],
              referenceContexts: {},
              tokenUsage: {
                promptTokens: 100,
                completionTokens: 50,
                totalTokens: 150,
              },
            },
          ],
          tokenUsage: {
            instructionRefinement: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            emailGeneration: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
            total: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          },
        })
        .mockRejectedValueOnce(new Error("AI generation failed"))
        .mockRejectedValueOnce(new Error("Token limit exceeded"));

      // Should throw error on failed generation
      const runFunction = (generateBulkEmailsTask as any).run;
      await expect(runFunction(mockPayload, mockContext)).rejects.toThrow();

      // Should update session with error message
      expect(mockSet).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          errorMessage: expect.any(String),
          updatedAt: expect.any(Date),
        })
      );
    });
  });

  describe("duplicate email handling", () => {
    it("should skip donors with existing approved emails", async () => {
      setupDatabaseMocks({
        existingEmails: [{ donorId: 1 }, { donorId: 2 }],
      });

      mockGenerateSmartDonorEmails.mockResolvedValue({
        refinedInstruction: "",
        reasoning: "",
        emails: [
          {
            donorId: 3,
            subject: "Thank you Bob",
            structuredContent: [{ piece: "Dear Bob,", references: [], addNewlineAfter: true }],
            referenceContexts: {},
            tokenUsage: {
              promptTokens: 110,
              completionTokens: 55,
              totalTokens: 165,
            },
          },
        ],
        tokenUsage: {
          instructionRefinement: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          emailGeneration: { promptTokens: 110, completionTokens: 55, totalTokens: 165 },
          total: { promptTokens: 110, completionTokens: 55, totalTokens: 165 },
        },
      });

      // Access the run function from the task configuration
      const runFunction = (generateBulkEmailsTask as any).run;
      const result = await runFunction(mockPayload, mockContext);

      // Should only generate email for donor 3
      expect(mockGenerateSmartDonorEmails).toHaveBeenCalledTimes(1);
      
      // Check that the call was for donor 3
      const call = mockGenerateSmartDonorEmails.mock.calls[0];
      expect(call[0]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 3,
            firstName: "Bob",
            lastName: "Johnson",
          }),
        ])
      );

      // Should only insert one email
      expect(mockInsert).toHaveBeenCalledTimes(1);
    });

    it("should mark session as COMPLETED if all emails already exist", async () => {
      setupDatabaseMocks({
        existingEmails: [{ donorId: 1 }, { donorId: 2 }, { donorId: 3 }],
      });

      // Access the run function from the task configuration
      const runFunction = (generateBulkEmailsTask as any).run;
      const result = await runFunction(mockPayload, mockContext);

      // Should not call email generation
      expect(mockGenerateSmartDonorEmails).not.toHaveBeenCalled();

      // Should update status to COMPLETED
      expect(mockSet).toHaveBeenLastCalledWith({
        status: "COMPLETED",
        completedDonors: 3,
        completedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
    });
  });

  describe("comprehensive data fetching", () => {
    it("should fetch and include all donor data", async () => {
      setupDatabaseMocks();

      const mockCommunicationHistory = [{ content: [{ content: "Previous email content" }] }];
      const mockDonations = {
        donations: [{ amount: 10000, date: new Date("2023-12-01") }],
      };
      const mockStats = {
        1: { totalAmount: 10000, totalDonations: 1 },
        2: { totalAmount: 5000, totalDonations: 2 },
        3: { totalAmount: 2000, totalDonations: 1 },
      };

      (getDonorCommunicationHistory as jest.Mock).mockResolvedValue(mockCommunicationHistory);
      (listDonations as jest.Mock).mockResolvedValue(mockDonations);
      (getMultipleComprehensiveDonorStats as jest.Mock).mockResolvedValue(mockStats);

      // Mock individual email generation for each donor
      mockGenerateSmartDonorEmails
        .mockResolvedValueOnce({
          refinedInstruction: "",
          reasoning: "",
          emails: [
            {
              donorId: 1,
              subject: "Test John",
              structuredContent: [],
              referenceContexts: {},
              tokenUsage: {
                promptTokens: 100,
                completionTokens: 50,
                totalTokens: 150,
              },
            },
          ],
          tokenUsage: {
            instructionRefinement: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            emailGeneration: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
            total: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          },
        })
        .mockResolvedValueOnce({
          refinedInstruction: "",
          reasoning: "",
          emails: [
            {
              donorId: 2,
              subject: "Test Jane",
              structuredContent: [],
              referenceContexts: {},
              tokenUsage: {
                promptTokens: 120,
                completionTokens: 60,
                totalTokens: 180,
              },
            },
          ],
          tokenUsage: {
            instructionRefinement: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            emailGeneration: { promptTokens: 120, completionTokens: 60, totalTokens: 180 },
            total: { promptTokens: 120, completionTokens: 60, totalTokens: 180 },
          },
        })
        .mockResolvedValueOnce({
          refinedInstruction: "",
          reasoning: "",
          emails: [
            {
              donorId: 3,
              subject: "Test Bob",
              structuredContent: [],
              referenceContexts: {},
              tokenUsage: {
                promptTokens: 110,
                completionTokens: 55,
                totalTokens: 165,
              },
            },
          ],
          tokenUsage: {
            instructionRefinement: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            emailGeneration: { promptTokens: 110, completionTokens: 55, totalTokens: 165 },
            total: { promptTokens: 110, completionTokens: 55, totalTokens: 165 },
          },
        });

      // Access the run function from the task configuration
      const runFunction = (generateBulkEmailsTask as any).run;
      const result = await runFunction(mockPayload, mockContext);

      // Verify communication history was fetched for each donor
      expect(getDonorCommunicationHistory).toHaveBeenCalledTimes(3);

      // Verify donation data was fetched
      expect(listDonations).toHaveBeenCalled();
      expect(getMultipleComprehensiveDonorStats).toHaveBeenCalled();

      // Verify email generation received the data - called once per donor
      expect(mockGenerateSmartDonorEmails).toHaveBeenCalledTimes(3);
      
      // Check that all calls have the expected structure
      const calls = mockGenerateSmartDonorEmails.mock.calls;
      calls.forEach((call, index) => {
        expect(call[1]).toBe("Test Foundation"); // organizationName (now parameter 1)
        expect(call[7]).toEqual(mockStats); // donorStatistics (now parameter 7)
      });
    });
  });
});
