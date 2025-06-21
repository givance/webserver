import { EmailCampaignsService } from "@/app/lib/services/email-campaigns.service";
import { db } from "@/app/lib/db";
import { emailGenerationSessions, generatedEmails } from "@/app/lib/db/schema";
import { eq, and, or } from "drizzle-orm";
import { generateBulkEmailsTask } from "@/trigger/jobs/generateBulkEmails";

// Mock dependencies
jest.mock("@/app/lib/db");
jest.mock("@trigger.dev/sdk/v3", () => ({
  runs: {
    cancel: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock("@/trigger/jobs/generateBulkEmails", () => ({
  generateBulkEmailsTask: {
    trigger: jest.fn().mockResolvedValue({ id: "mock-trigger-job-id" }),
  },
}));

describe("EmailCampaignsService - Draft Completion", () => {
  let service: EmailCampaignsService;
  const mockOrgId = "test-org-123";
  const mockUserId = "test-user-123";

  beforeEach(() => {
    service = new EmailCampaignsService();
    jest.clearAllMocks();
  });

  describe("launchCampaign from draft with all emails", () => {
    it("should mark session as READY_TO_SEND when all donors already have emails", async () => {
      const mockDraft = {
        id: 1,
        organizationId: mockOrgId,
        jobName: "Test Campaign",
        status: "DRAFT",
      };

      const selectedDonorIds = [1, 2, 3];
      const input = {
        campaignName: "Test Campaign",
        instruction: "Test instruction",
        chatHistory: [],
        selectedDonorIds,
        previewDonorIds: [],
      };

      // Mock finding existing draft
      (db.select as jest.Mock).mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockDraft]),
          }),
        }),
      });

      // Mock counting existing emails for selected donors - all donors have emails
      (db.select as jest.Mock).mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ donorId: 1 }, { donorId: 2 }, { donorId: 3 }]),
        }),
      });

      // Mock update draft to READY_TO_SEND with completedDonors count
      (db.update as jest.Mock).mockReturnValueOnce({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([
              {
                id: 1,
                status: "READY_TO_SEND",
                totalDonors: 3,
                completedDonors: 3,
              },
            ]),
          }),
        }),
      });

      // Mock update PENDING_APPROVAL emails to APPROVED
      (db.update as jest.Mock).mockReturnValueOnce({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      });

      // Mock getting existing approved emails - all have emails
      (db.select as jest.Mock).mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ donorId: 1 }, { donorId: 2 }, { donorId: 3 }]),
        }),
      });

      // Mock final update to READY_TO_SEND (in else block when no donors to generate)
      (db.update as jest.Mock).mockReturnValueOnce({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      });

      // Mock checkAndUpdateCampaignCompletion call
      jest.spyOn(service, "checkAndUpdateCampaignCompletion").mockResolvedValue(undefined);

      const result = await service.launchCampaign(input, mockOrgId, mockUserId);

      expect(result.sessionId).toBe(1);

      // Verify the update calls
      expect(db.update).toHaveBeenCalled();

      // Verify that no trigger job was created (all emails already exist)
      expect(generateBulkEmailsTask.trigger).not.toHaveBeenCalled();
    });

    it("should correctly count only selected donors when updating from draft", async () => {
      const mockDraft = {
        id: 1,
        organizationId: mockOrgId,
        jobName: "Test Campaign",
        status: "DRAFT",
      };

      const selectedDonorIds = [1, 2, 3, 4, 5];
      const input = {
        campaignName: "Test Campaign",
        instruction: "Test instruction",
        chatHistory: [],
        selectedDonorIds,
        previewDonorIds: [],
      };

      // Mock finding existing draft
      (db.select as jest.Mock).mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockDraft]),
          }),
        }),
      });

      // Mock counting existing emails for selected donors - only 3 out of 5 donors have emails
      (db.select as jest.Mock).mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([
            { donorId: 1 },
            { donorId: 2 },
            { donorId: 3 },
            { donorId: 7 }, // This donor is not in selectedDonorIds so doesn't count
          ]),
        }),
      });

      // Mock update draft to GENERATING
      (db.update as jest.Mock).mockReturnValueOnce({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([
              {
                id: 1,
                status: "GENERATING",
                totalDonors: 5,
                completedDonors: 3,
              },
            ]),
          }),
        }),
      });

      // Mock update PENDING_APPROVAL emails
      (db.update as jest.Mock).mockReturnValueOnce({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      });

      // Mock getting existing approved emails for trigger check
      (db.select as jest.Mock).mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ donorId: 1 }, { donorId: 2 }, { donorId: 3 }]),
        }),
      });

      // Mock checkAndUpdateCampaignCompletion call (no additional update mock needed for this path)
      jest.spyOn(service, "checkAndUpdateCampaignCompletion").mockResolvedValue(undefined);

      const result = await service.launchCampaign(input, mockOrgId, mockUserId);

      expect(result.sessionId).toBe(1);

      // Verify that trigger was called for the 2 donors without emails
      expect(generateBulkEmailsTask.trigger).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedDonorIds: [4, 5], // Only donors 4 and 5 need emails
        })
      );
    });
  });

  describe("createSession draft functionality", () => {
    it("should create a new draft session", async () => {
      const selectedDonorIds = [1, 2, 3];
      const input = {
        campaignName: "Test Campaign",
        instruction: "Test instruction",
        chatHistory: [],
        selectedDonorIds,
        previewDonorIds: [],
      };

      // Mock no existing draft
      (db.select as jest.Mock).mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      // Mock insert new session
      (db.insert as jest.Mock).mockReturnValueOnce({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([
            {
              id: 1,
              status: "DRAFT",
              totalDonors: 3,
              completedDonors: 0,
            },
          ]),
        }),
      });

      const result = await service.createSession(input, mockOrgId, mockUserId);

      expect(result.sessionId).toBe(1);
      expect(db.insert).toHaveBeenCalled();
    });

    it("should update existing draft session", async () => {
      const mockDraft = {
        id: 1,
        organizationId: mockOrgId,
        jobName: "Test Campaign",
        status: "DRAFT",
      };

      const selectedDonorIds = [1, 2, 3, 4];
      const input = {
        campaignName: "Test Campaign",
        instruction: "Updated instruction",
        chatHistory: [],
        selectedDonorIds,
        previewDonorIds: [],
      };

      // Mock finding existing draft
      (db.select as jest.Mock).mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockDraft]),
          }),
        }),
      });

      // Mock update existing draft
      (db.update as jest.Mock).mockReturnValueOnce({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([
              {
                id: 1,
                status: "DRAFT",
                totalDonors: 4,
                completedDonors: 0,
              },
            ]),
          }),
        }),
      });

      const result = await service.createSession(input, mockOrgId, mockUserId);

      expect(result.sessionId).toBe(1);
      expect(db.update).toHaveBeenCalled();
    });
  });

  describe("getSessionStatus failsafe", () => {
    it("should update status to COMPLETED when all donors are completed", async () => {
      const mockSession = {
        id: 1,
        status: "GENERATING",
        totalDonors: 5,
        completedDonors: 5,
      };

      // Mock the session query
      (db.query.emailGenerationSessions.findFirst as jest.Mock) = jest.fn().mockResolvedValue(mockSession);

      // Mock the update
      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      });

      const result = await service.getSessionStatus(1, mockOrgId);

      expect(result).toMatchObject({
        id: 1,
        status: "COMPLETED",
        totalDonors: 5,
        completedDonors: 5,
      });

      // Verify the update was called
      expect(db.update).toHaveBeenCalledWith(emailGenerationSessions);
    });

    it("should not update status when donors are not all completed", async () => {
      const mockSession = {
        id: 1,
        status: "READY_TO_SEND",
        totalDonors: 5,
        completedDonors: 3,
      };

      (db.query.emailGenerationSessions.findFirst as jest.Mock) = jest.fn().mockResolvedValue(mockSession);

      const result = await service.getSessionStatus(1, mockOrgId);

      expect(result).toMatchObject({
        id: 1,
        status: "READY_TO_SEND",
        totalDonors: 5,
        completedDonors: 3,
      });

      // Verify no update was called
      expect(db.update).not.toHaveBeenCalled();
    });
  });
});
