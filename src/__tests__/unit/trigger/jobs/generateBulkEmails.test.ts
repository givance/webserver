import { generateBulkEmailsTask } from "@/trigger/jobs/generateBulkEmails";
import { db } from "@/app/lib/db";
import { UnifiedSmartEmailGenerationService } from "@/app/lib/services/unified-smart-email-generation.service";
import { logger as triggerLogger } from "@trigger.dev/sdk/v3";

// Mock dependencies
jest.mock("@/app/lib/db");
jest.mock("@/app/lib/services/unified-smart-email-generation.service");

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
  },
}));

// Setup mocks
const mockDb = db as jest.Mocked<typeof db>;
const mockUpdate = jest.fn();
const mockSet = jest.fn();
const mockWhere = jest.fn();
const mockSelect = jest.fn();
const mockFrom = jest.fn();

// Mock UnifiedSmartEmailGenerationService
const mockGenerateSmartEmailsForCampaign = jest.fn();
(UnifiedSmartEmailGenerationService as jest.Mock).mockImplementation(() => ({
  generateSmartEmailsForCampaign: mockGenerateSmartEmailsForCampaign,
}));

// Remove references to old generateSmartDonorEmails as it's no longer used

// Test data
const mockPayload = {
  sessionId: 1,
  organizationId: "org123",
  userId: "user123",
  selectedDonorIds: [1, 2, 3],
  previewDonorIds: [],
  chatHistory: [
    { role: "user" as const, content: "Write thank you emails" },
  ],
};

const mockContext = {
  ctx: {
    run: {
      id: "job123",
    },
  },
};

// Setup mock chain
const setupMockChain = () => {
  // For update queries
  mockUpdate.mockReturnValue({ set: mockSet });
  mockSet.mockReturnValue({ where: mockWhere });
  mockWhere.mockResolvedValue(undefined);

  // For select queries
  mockSelect.mockReturnValue({ from: mockFrom });
  mockFrom.mockReturnValue({ where: mockWhere });
  mockWhere.mockResolvedValue([]);
};

describe("generateBulkEmailsTask", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMockChain();
    
    // Setup default database mocks
    (mockDb as any).update = mockUpdate;
    (mockDb as any).select = mockSelect;
  });

  describe("successful email generation", () => {
    it("should generate emails using UnifiedSmartEmailGenerationService", async () => {
      // Mock unified service response
      mockGenerateSmartEmailsForCampaign.mockResolvedValue({
        results: [
          {
            donor: { id: 1, firstName: "John", lastName: "Doe" },
            email: {
              subject: "Thank you John",
              content: "Dear John, thank you for your support.",
              reasoning: "Personalized for John",
              response: "Generated thank you email for John",
            },
            tokensUsed: 150,
          },
          {
            donor: { id: 2, firstName: "Jane", lastName: "Smith" },
            email: {
              subject: "Thank you Jane",
              content: "Dear Jane, thank you for your support.",
              reasoning: "Personalized for Jane",
              response: "Generated thank you email for Jane",
            },
            tokensUsed: 180,
          },
          {
            donor: { id: 3, firstName: "Bob", lastName: "Johnson" },
            email: {
              subject: "Thank you Bob",
              content: "Dear Bob, thank you for your support.",
              reasoning: "Personalized for Bob",
              response: "Generated thank you email for Bob",
            },
            tokensUsed: 165,
          },
        ],
        totalTokensUsed: 495,
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
        status: "READY_TO_SEND",
        completedDonors: 3,
        updatedAt: expect.any(Date),
      });

      // Verify unified service was called correctly
      expect(mockGenerateSmartEmailsForCampaign).toHaveBeenCalledTimes(1);
      expect(mockGenerateSmartEmailsForCampaign).toHaveBeenCalledWith({
        organizationId: "org123",
        sessionId: "1",
        chatHistory: mockPayload.chatHistory,
        donorIds: ["1", "2", "3"],
      });

      // Verify result
      expect(result).toEqual({
        status: "success",
        sessionId: 1,
        emailsGenerated: 3,
        totalTokensUsed: 495,
        message: "Generated 3 emails successfully",
      });
    });

    it("should handle existing emails and only generate missing ones", async () => {
      // Mock existing emails query to return one existing email
      mockWhere.mockResolvedValueOnce([{ donorId: 1 }]);

      // Mock unified service response for remaining donors
      mockGenerateSmartEmailsForCampaign.mockResolvedValue({
        results: [
          {
            donor: { id: 2, firstName: "Jane", lastName: "Smith" },
            email: {
              subject: "Thank you Jane",
              content: "Dear Jane, thank you for your support.",
              reasoning: "Personalized for Jane",
              response: "Generated thank you email for Jane",
            },
            tokensUsed: 180,
          },
          {
            donor: { id: 3, firstName: "Bob", lastName: "Johnson" },
            email: {
              subject: "Thank you Bob", 
              content: "Dear Bob, thank you for your support.",
              reasoning: "Personalized for Bob",
              response: "Generated thank you email for Bob",
            },
            tokensUsed: 165,
          },
        ],
        totalTokensUsed: 345,
      });

      const runFunction = (generateBulkEmailsTask as any).run;
      const result = await runFunction(mockPayload, mockContext);

      // Verify unified service was called with only donors 2 and 3
      expect(mockGenerateSmartEmailsForCampaign).toHaveBeenCalledWith({
        organizationId: "org123",
        sessionId: "1",
        chatHistory: mockPayload.chatHistory,
        donorIds: ["2", "3"],
      });

      expect(result).toEqual({
        status: "success",
        sessionId: 1,
        emailsGenerated: 2,
        totalTokensUsed: 345,
        message: "Generated 2 emails successfully",
      });
    });

    it("should handle all emails already existing", async () => {
      // Mock existing emails query to return all donors
      mockWhere.mockResolvedValueOnce([
        { donorId: 1 },
        { donorId: 2 },
        { donorId: 3 },
      ]);

      const runFunction = (generateBulkEmailsTask as any).run;
      const result = await runFunction(mockPayload, mockContext);

      // Verify unified service was not called
      expect(mockGenerateSmartEmailsForCampaign).not.toHaveBeenCalled();

      // Verify session was updated to COMPLETED
      expect(mockSet).toHaveBeenNthCalledWith(2, {
        status: "COMPLETED",
        completedDonors: 3,
        completedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });

      expect(result).toEqual({
        status: "success",
        sessionId: 1,
        emailsGenerated: 0,
        message: "All emails were already generated",
      });
    });

    it("should handle errors from unified service", async () => {
      // Mock unified service to throw error
      mockGenerateSmartEmailsForCampaign.mockRejectedValue(new Error("AI service error"));

      const runFunction = (generateBulkEmailsTask as any).run;
      
      await expect(runFunction(mockPayload, mockContext)).rejects.toThrow("AI service error");

      // Verify error was logged
      expect(triggerLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Error in generateBulkEmailsTask for session 1:"),
        expect.any(Error)
      );

      // Verify session was updated with error
      expect(mockSet).toHaveBeenLastCalledWith({
        status: "READY_TO_SEND",
        errorMessage: "AI service error",
        updatedAt: expect.any(Date),
      });
    });
  });
});