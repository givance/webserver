import { generateBulkEmailsTask } from "@/trigger/jobs/generateBulkEmails";
import { db } from "@/app/lib/db";
import { EmailGenerationService } from "@/app/lib/utils/email-generator/service";
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
    assignedStaff: { id: 10, firstName: "Sarah", signature: "Sarah Jones" },
  },
  { id: 3, firstName: "Bob", lastName: "Johnson", assignedStaff: { id: 11, firstName: "Mike", signature: null } },
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
    instruction: "Write thank you emails",
    refinedInstruction: "Write personalized thank you emails",
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
        findFirst: jest.fn().mockResolvedValue({ id: 100, firstName: "Primary", signature: "Primary Staff" }),
      },
    };

    // Mock PersonResearchService
    (PersonResearchService as jest.Mock).mockImplementation(() => ({
      getPersonResearch: jest.fn().mockResolvedValue(null),
    }));

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

      mockGenerateEmails.mockResolvedValue([
        {
          donorId: 1,
          subject: "Thank you John",
          structuredContent: [{ piece: "Dear John,", references: [], addNewlineAfter: true }],
          referenceContexts: {},
        },
        {
          donorId: 2,
          subject: "Thank you Jane",
          structuredContent: [{ piece: "Dear Jane,", references: [], addNewlineAfter: true }],
          referenceContexts: {},
        },
        {
          donorId: 3,
          subject: "Thank you Bob",
          structuredContent: [{ piece: "Dear Bob,", references: [], addNewlineAfter: true }],
          referenceContexts: {},
        },
      ]);

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
        refinedInstruction: "Write personalized thank you emails",
        completedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });

      // Verify email generation was called 3 times (once per donor)
      expect(mockGenerateEmails).toHaveBeenCalledTimes(3);

      // Verify each call had the correct structure (checking just the first call)
      expect(mockGenerateEmails).toHaveBeenNthCalledWith(
        1,
        expect.arrayContaining([
          expect.objectContaining({
            id: 1,
            firstName: "John",
            lastName: "Doe",
          }),
        ]),
        "Write personalized thank you emails",
        "Test Foundation",
        expect.objectContaining({
          id: "org123",
          name: "Test Foundation",
        }),
        undefined, // organizationWritingInstructions
        expect.any(Object), // communicationHistories
        expect.any(Object), // donationHistories
        {}, // donorStatistics
        {}, // personResearchResults
        [], // personalMemories
        [], // organizationalMemories
        undefined, // currentDate
        "John Smith\nFundraising Director" // emailSignature
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

      mockGenerateEmails
        .mockResolvedValueOnce([
          {
            donorId: 1,
            subject: "Test",
            structuredContent: [{ piece: "Content", references: [], addNewlineAfter: true }],
            referenceContexts: {},
          },
        ])
        .mockResolvedValueOnce([
          {
            donorId: 2,
            subject: "Test",
            structuredContent: [{ piece: "Content", references: [], addNewlineAfter: true }],
            referenceContexts: {},
          },
        ])
        .mockResolvedValueOnce([
          {
            donorId: 3,
            subject: "Test",
            structuredContent: [{ piece: "Content", references: [], addNewlineAfter: true }],
            referenceContexts: {},
          },
        ]);

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
          references: [],
        })
      );

      // Donor 2 - Has assigned staff with custom signature
      expect(email2.structuredContent).toContainEqual(
        expect.objectContaining({
          piece: "Sarah Jones",
          references: [],
        })
      );

      // Donor 3 - Has assigned staff but no custom signature, should use "Best,\nMike"
      expect(email3.structuredContent).toContainEqual(
        expect.objectContaining({
          piece: "Best,\nMike",
          references: [],
        })
      );
    });
  });

  describe("error handling", () => {
    it("should handle organization not found error", async () => {
      setupDatabaseMocks({ organization: null });

      const runFunction = (generateBulkEmailsTask as any).run;
      await expect(runFunction(mockPayload, mockContext)).rejects.toThrow("Organization org123 not found");

      // Verify session was updated to FAILED
      expect(mockSet).toHaveBeenLastCalledWith({
        status: "FAILED",
        errorMessage: "Organization org123 not found",
        updatedAt: expect.any(Date),
      });
    });

    it("should handle user not found error", async () => {
      setupDatabaseMocks({ user: null });

      const runFunction = (generateBulkEmailsTask as any).run;
      await expect(runFunction(mockPayload, mockContext)).rejects.toThrow("User user123 not found");

      expect(mockSet).toHaveBeenLastCalledWith({
        status: "FAILED",
        errorMessage: "User user123 not found",
        updatedAt: expect.any(Date),
      });
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
      mockGenerateEmails
        .mockResolvedValueOnce([
          {
            donorId: 1,
            subject: "Test",
            structuredContent: [{ piece: "Content", references: [], addNewlineAfter: true }],
            referenceContexts: {},
          },
        ])
        .mockRejectedValueOnce(new Error("AI generation failed"))
        .mockRejectedValueOnce(new Error("Token limit exceeded"));

      // Should throw error on failed generation
      const runFunction = (generateBulkEmailsTask as any).run;
      await expect(runFunction(mockPayload, mockContext)).rejects.toThrow();

      // Should update status to FAILED
      expect(mockSet).toHaveBeenLastCalledWith({
        status: "FAILED",
        errorMessage: expect.any(String),
        updatedAt: expect.any(Date),
      });
    });
  });

  describe("duplicate email handling", () => {
    it("should skip donors with existing approved emails", async () => {
      setupDatabaseMocks({
        existingEmails: [{ donorId: 1 }, { donorId: 2 }],
      });

      mockGenerateEmails.mockResolvedValue([
        {
          donorId: 3,
          subject: "Thank you Bob",
          structuredContent: [{ piece: "Dear Bob,", references: [], addNewlineAfter: true }],
          referenceContexts: {},
        },
      ]);

      // Access the run function from the task configuration
      const runFunction = (generateBulkEmailsTask as any).run;
      const result = await runFunction(mockPayload, mockContext);

      // Should only generate email for donor 3
      expect(mockGenerateEmails).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 3,
            firstName: "Bob",
            lastName: "Johnson",
          }),
        ]),
        expect.any(String),
        expect.any(String),
        expect.any(Object),
        undefined,
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        expect.any(Array),
        expect.any(Array),
        undefined,
        expect.any(String)
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
      expect(mockGenerateEmails).not.toHaveBeenCalled();

      // Should update status to COMPLETED
      expect(mockSet).toHaveBeenLastCalledWith({
        status: "COMPLETED",
        completedDonors: 3,
        refinedInstruction: "Write personalized thank you emails",
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
      mockGenerateEmails
        .mockResolvedValueOnce([
          {
            donorId: 1,
            subject: "Test John",
            structuredContent: [],
            referenceContexts: {},
          },
        ])
        .mockResolvedValueOnce([
          {
            donorId: 2,
            subject: "Test Jane",
            structuredContent: [],
            referenceContexts: {},
          },
        ])
        .mockResolvedValueOnce([
          {
            donorId: 3,
            subject: "Test Bob",
            structuredContent: [],
            referenceContexts: {},
          },
        ]);

      // Access the run function from the task configuration
      const runFunction = (generateBulkEmailsTask as any).run;
      const result = await runFunction(mockPayload, mockContext);

      // Verify communication history was fetched for each donor
      expect(getDonorCommunicationHistory).toHaveBeenCalledTimes(3);

      // Verify donation data was fetched
      expect(listDonations).toHaveBeenCalled();
      expect(getMultipleComprehensiveDonorStats).toHaveBeenCalled();

      // Verify email generation received the data
      expect(mockGenerateEmails).toHaveBeenCalledWith(
        expect.any(Array), // donors
        expect.any(String), // refinedInstruction
        expect.any(String), // organizationName
        expect.any(Object), // organization
        undefined, // organizationWritingInstructions
        expect.any(Object), // communicationHistories
        expect.any(Object), // donationHistories
        mockStats, // donorStatistics
        expect.any(Object), // personResearchResults
        expect.any(Array), // personalMemories
        expect.any(Array), // organizationalMemories
        undefined, // currentDate
        expect.any(String) // emailSignature
      );
    });
  });
});
