import { EmailSchedulingService } from "@/app/lib/services/email-scheduling.service";
import { db } from "@/app/lib/db";
import { runs } from "@trigger.dev/sdk/v3";

// Mock dependencies
jest.mock("@/app/lib/db");
jest.mock("@trigger.dev/sdk/v3", () => ({
  runs: {
    cancel: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock("@/trigger/jobs/sendSingleEmail", () => ({
  sendSingleEmailTask: {
    trigger: jest.fn().mockResolvedValue({ id: "mock-trigger-job-id" }),
  },
}));

describe("Email Scheduling Flow - Pause/Resume", () => {
  let service: EmailSchedulingService;
  const mockOrgId = "test-org-123";
  const mockUserId = "test-user-123";
  const mockSessionId = 1;

  beforeEach(() => {
    service = new EmailSchedulingService();
    jest.clearAllMocks();
  });

  describe("Complete scheduling and pause/resume flow", () => {
    it("should handle the complete flow: schedule -> pause -> resume", async () => {
      // Mock config
      jest.spyOn(service, "getOrCreateScheduleConfig").mockResolvedValue({
        organizationId: mockOrgId,
        dailyLimit: 150,
        minGapMinutes: 1,
        maxGapMinutes: 3,
        timezone: "America/New_York",
      } as any);

      jest.spyOn(service, "getEmailsSentToday").mockResolvedValue(0);

      // Mock emails to schedule
      const mockEmails = [
        { id: 1, donorId: 1, sessionId: mockSessionId, sendStatus: "pending" },
        { id: 2, donorId: 2, sessionId: mockSessionId, sendStatus: "pending" },
        { id: 3, donorId: 3, sessionId: mockSessionId, sendStatus: "pending" },
      ];

      jest.mocked(db.select).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(mockEmails),
        }),
      } as any);

      // Mock job creation
      const mockJobRecords = mockEmails.map((email, idx) => ({
        id: idx + 1,
        emailId: email.id,
        sessionId: mockSessionId,
        organizationId: mockOrgId,
        scheduledTime: new Date(Date.now() + idx * 2 * 60 * 1000),
        status: "scheduled",
      }));

      jest.mocked(db.insert).mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue(mockJobRecords),
        }),
      } as any);

      jest.mocked(db.update).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      } as any);

      // Step 1: Schedule emails
      const scheduleResult = await service.scheduleEmailCampaign(mockSessionId, mockOrgId, mockUserId);
      
      expect(scheduleResult.scheduled).toBe(3);
      expect(db.insert).toHaveBeenCalled();
      expect(db.update).toHaveBeenCalled();

      // Step 2: Mock pause - return scheduled jobs for cancellation
      jest.mocked(db.select).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(mockJobRecords),
        }),
      } as any);

      const pauseResult = await service.pauseCampaign(mockSessionId, mockOrgId);
      expect(pauseResult.cancelledJobs).toBe(3);

      // Step 3: Mock resume - return paused emails
      const pausedEmails = mockEmails.map(e => ({ ...e, sendStatus: "paused" }));
      jest.mocked(db.select).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(pausedEmails.map(e => ({ id: e.id }))),
        }),
      } as any);

      // Reset emails to pending
      jest.mocked(db.update).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      } as any);

      // Mock rescheduling
      jest.spyOn(service, "scheduleEmailCampaign").mockResolvedValue({
        scheduled: 3,
        scheduledForToday: 3,
        scheduledForLater: 0,
        estimatedCompletionTime: new Date(),
      });

      const resumeResult = await service.resumeCampaign(mockSessionId, mockOrgId, mockUserId);
      
      expect(resumeResult.rescheduled).toBe(3);
      expect(service.scheduleEmailCampaign).toHaveBeenCalledWith(mockSessionId, mockOrgId, mockUserId);
    });

    it("should handle partial sending before pause", async () => {
      // Mock that 2 emails were already sent, only 1 scheduled
      const scheduledJobs = [
        { id: 3, triggerJobId: "trigger-3", status: "scheduled", emailId: 3 },
      ];

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(scheduledJobs),
        }),
      } as any);

      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      } as any);

      const pauseResult = await service.pauseCampaign(mockSessionId, mockOrgId);
      expect(pauseResult.cancelledJobs).toBe(1); // Only 1 job to cancel
    });

    it("should respect daily limits when scheduling", async () => {
      // Mock config with low daily limit
      jest.spyOn(service, "getOrCreateScheduleConfig").mockResolvedValue({
        organizationId: mockOrgId,
        dailyLimit: 2,
        minGapMinutes: 1,
        maxGapMinutes: 3,
        timezone: "America/New_York",
      } as any);

      jest.spyOn(service, "getEmailsSentToday").mockResolvedValue(0);

      // Mock 5 emails to schedule
      const mockEmails = Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        donorId: i + 1,
        sessionId: mockSessionId,
        sendStatus: "pending",
      }));

      jest.mocked(db.select).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(mockEmails),
        }),
      } as any);

      const mockJobRecords = mockEmails.map((email, idx) => ({
        id: idx + 1,
        emailId: email.id,
        sessionId: mockSessionId,
        organizationId: mockOrgId,
        scheduledTime: new Date(),
        status: "scheduled",
      }));

      jest.mocked(db.insert).mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue(mockJobRecords),
        }),
      } as any);

      jest.mocked(db.update).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      } as any);

      const result = await service.scheduleEmailCampaign(mockSessionId, mockOrgId, mockUserId);
      
      expect(result.scheduled).toBe(5);
      expect(result.scheduledForToday).toBe(2); // Only 2 due to daily limit
      expect(result.scheduledForLater).toBe(3); // Rest scheduled for later
    });

    it("should handle cancel campaign flow", async () => {
      // Mock pause to succeed
      jest.spyOn(service, "pauseCampaign").mockResolvedValue({ cancelledJobs: 5 });

      // Mock update to cancel emails - the entire chain resolves to the array
      const mockReturnValue = [{ id: 1 }, { id: 2 }, { id: 3 }];
      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue(mockReturnValue),
          }),
        }),
      } as any);

      const result = await service.cancelCampaign(mockSessionId, mockOrgId);
      
      expect(service.pauseCampaign).toHaveBeenCalledWith(mockSessionId, mockOrgId);
      expect(result.cancelledEmails).toBe(3);
    });
  });

  describe("getCampaignSchedule", () => {
    it("should return campaign schedule with accurate statistics", async () => {
      const mockSession = {
        id: mockSessionId,
        jobName: "Test Campaign",
        status: "IN_PROGRESS",
        organizationId: mockOrgId,
      };

      const mockEmailStatuses = [
        { status: "scheduled", count: 5 },
        { status: "sent", count: 3 },
        { status: "failed", count: 1 },
      ];

      const mockScheduledEmails = [
        {
          emailId: 1,
          donorId: 1,
          scheduledTime: new Date(Date.now() + 3600000),
          status: "scheduled",
          jobStatus: "scheduled",
          actualSendTime: null,
        },
        {
          emailId: 2,
          donorId: 2,
          scheduledTime: new Date(Date.now() - 3600000),
          status: "sent",
          jobStatus: "completed",
          actualSendTime: new Date(Date.now() - 3600000),
        },
      ];

      jest.mocked(db.select).mockImplementation(() => {
        return {
          from: jest.fn().mockImplementation(() => ({
            where: jest.fn().mockImplementation(() => ({
              limit: jest.fn().mockResolvedValue([mockSession]),
              groupBy: jest.fn().mockResolvedValue(mockEmailStatuses),
            })),
            leftJoin: jest.fn().mockImplementation(() => ({
              where: jest.fn().mockImplementation(() => ({
                orderBy: jest.fn().mockResolvedValue(mockScheduledEmails),
              })),
            })),
          })),
        } as any;
      });

      const result = await service.getCampaignSchedule(mockSessionId, mockOrgId);

      expect(result.session.id).toBe(mockSessionId);
      expect(result.stats.scheduled).toBe(5);
      expect(result.stats.sent).toBe(3);
      expect(result.stats.failed).toBe(1);
      expect(result.scheduledEmails).toHaveLength(2);
      expect(result.nextScheduledTime).toBeDefined();
      expect(result.lastSentTime).toBeDefined();
    });
  });
});