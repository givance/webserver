import { EmailSchedulingService } from '@/app/lib/services/email-scheduling.service';
import { db } from '@/app/lib/db';
import { emailScheduleConfig, generatedEmails, emailSendJobs } from '@/app/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { runs } from '@trigger.dev/sdk/v3';

// Mock dependencies
jest.mock('@/app/lib/db');
jest.mock('@/app/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock('@trigger.dev/sdk/v3', () => ({
  runs: {
    cancel: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('@/trigger/jobs/sendSingleEmail', () => ({
  sendSingleEmailTask: {
    trigger: jest.fn().mockResolvedValue({ id: 'mock-trigger-job-id' }),
  },
}));

describe('EmailSchedulingService', () => {
  let service: EmailSchedulingService;

  beforeEach(() => {
    service = new EmailSchedulingService();
    jest.clearAllMocks();

    // Reset mock implementation counters
    jest.mocked(db.select).mockReset();
    jest.mocked(db.insert).mockReset();
    jest.mocked(db.update).mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getOrCreateScheduleConfig', () => {
    it('should return existing config if found', async () => {
      const mockConfig = {
        id: 1,
        organizationId: 'org-123',
        dailyLimit: 150,
        maxDailyLimit: 500,
        minGapMinutes: 1,
        maxGapMinutes: 3,
        timezone: 'America/New_York',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.mocked(db.select).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockConfig]),
          }),
        }),
      } as any);

      const result = await service.getOrCreateScheduleConfig('org-123');
      expect(result).toEqual(mockConfig);
    });

    it('should create default config if not found', async () => {
      const mockNewConfig = {
        id: 1,
        organizationId: 'org-123',
        dailyLimit: 150,
        maxDailyLimit: 500,
        minGapMinutes: 1,
        maxGapMinutes: 3,
        timezone: 'America/New_York',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.mocked(db.select).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      } as any);

      jest.mocked(db.insert).mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([mockNewConfig]),
        }),
      } as any);

      const result = await service.getOrCreateScheduleConfig('org-123');
      expect(result).toEqual(mockNewConfig);
      expect(db.insert).toHaveBeenCalledWith(emailScheduleConfig);
    });
  });

  describe('updateScheduleConfig', () => {
    it('should update config with valid values', async () => {
      const updatedConfig = {
        id: 1,
        organizationId: 'org-123',
        dailyLimit: 200,
        minGapMinutes: 2,
        maxGapMinutes: 5,
        timezone: 'Europe/London',
        updatedAt: new Date(),
      };

      jest.mocked(db.update).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedConfig]),
          }),
        }),
      } as any);

      const result = await service.updateScheduleConfig('org-123', {
        dailyLimit: 200,
        minGapMinutes: 2,
        maxGapMinutes: 5,
        timezone: 'Europe/London',
      });

      expect(result).toEqual(updatedConfig);
    });

    it('should throw error for invalid daily limit', async () => {
      await expect(service.updateScheduleConfig('org-123', { dailyLimit: 600 })).rejects.toThrow(
        TRPCError
      );

      await expect(service.updateScheduleConfig('org-123', { dailyLimit: 0 })).rejects.toThrow(
        TRPCError
      );
    });

    it('should throw error if max gap is less than min gap', async () => {
      await expect(
        service.updateScheduleConfig('org-123', {
          minGapMinutes: 5,
          maxGapMinutes: 3,
        })
      ).rejects.toThrow('Maximum gap must be greater than or equal to minimum gap');
    });
  });

  describe('scheduleEmailCampaign', () => {
    it('should schedule emails with proper delays', async () => {
      // Mock current date to be a Monday at 10 AM
      const mockDate = new Date('2024-01-08T15:00:00Z'); // Monday, 10 AM EST
      jest.useFakeTimers();
      jest.setSystemTime(mockDate);

      const mockConfig = {
        organizationId: 'org-123',
        dailyLimit: 150,
        minGapMinutes: 1,
        maxGapMinutes: 3,
        timezone: 'America/New_York',
        allowedDays: [1, 2, 3, 4, 5], // Monday through Friday
        allowedStartTime: '09:00',
        allowedEndTime: '17:00',
        allowedTimezone: 'America/New_York',
      };

      const mockAllEmails = [
        { id: 1, status: 'generated', isSent: false, sendStatus: 'pending' },
        { id: 2, status: 'generated', isSent: false, sendStatus: 'pending' },
        { id: 3, status: 'generated', isSent: false, sendStatus: 'pending' },
      ];

      const mockEmailsToSchedule = [
        { id: 1, donorId: 1, sessionId: 1, sendStatus: 'pending' },
        { id: 2, donorId: 2, sessionId: 1, sendStatus: 'pending' },
        { id: 3, donorId: 3, sessionId: 1, sendStatus: 'pending' },
      ];

      // Mock getOrCreateScheduleConfig
      jest.spyOn(service, 'getOrCreateScheduleConfig').mockResolvedValue(mockConfig as any);

      // Mock getEmailsSentToday
      jest.spyOn(service, 'getEmailsSentToday').mockResolvedValue(0);

      // Mock the three different select queries
      let selectCallCount = 0;
      jest.mocked(db.select).mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // First call: get all emails for logging
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue(mockAllEmails),
            }),
          } as any;
        } else if (selectCallCount === 2) {
          // Second call: get emails to schedule
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue(mockEmailsToSchedule),
            }),
          } as any;
        } else {
          // Third call: validate donors have staff with Gmail
          const mockDonorValidation = mockEmailsToSchedule.map((email) => ({
            donorId: email.donorId,
            donorFirstName: 'Test',
            donorLastName: 'Donor',
            donorEmail: 'donor@test.com',
            assignedToStaffId: 1,
            staffFirstName: 'Staff',
            staffLastName: 'Member',
            staffEmail: 'staff@test.com',
            hasGmailToken: true,
          }));
          return {
            from: jest.fn().mockReturnValue({
              leftJoin: jest.fn().mockReturnValue({
                leftJoin: jest.fn().mockReturnValue({
                  where: jest.fn().mockResolvedValue(mockDonorValidation),
                }),
              }),
            }),
          } as any;
        }
      });

      // Mock insert for email send jobs
      const mockJobRecords = mockEmailsToSchedule.map((email, idx) => ({
        id: idx + 1,
        emailId: email.id,
        sessionId: 1,
        organizationId: 'org-123',
        scheduledTime: new Date(Date.now() + idx * 2 * 60 * 1000), // 2 minutes apart
        status: 'scheduled' as const,
      }));

      jest.mocked(db.insert).mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue(mockJobRecords),
        }),
      } as any);

      // Mock update for emails
      jest.mocked(db.update).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      } as any);

      const result = await service.scheduleEmailCampaign(1, 'org-123', 'user-123');

      expect(result.scheduled).toBe(3);
      expect(result.scheduledForToday).toBe(3);
      expect(result.scheduledForLater).toBe(0);
      expect(result.estimatedCompletionTime).toBeDefined();

      jest.useRealTimers();
    });

    it('should handle daily limit by scheduling emails for next day', async () => {
      // Mock current date to be a Monday at 10 AM
      const mockDate = new Date('2024-01-08T15:00:00Z'); // Monday, 10 AM EST
      jest.useFakeTimers();
      jest.setSystemTime(mockDate);

      const mockConfig = {
        organizationId: 'org-123',
        dailyLimit: 2,
        minGapMinutes: 1,
        maxGapMinutes: 3,
        timezone: 'America/New_York',
        allowedDays: [1, 2, 3, 4, 5], // Monday through Friday
        allowedStartTime: '09:00',
        allowedEndTime: '17:00',
        allowedTimezone: 'America/New_York',
      };

      const mockAllEmails = [
        { id: 1, status: 'generated', isSent: false, sendStatus: 'pending' },
        { id: 2, status: 'generated', isSent: false, sendStatus: 'pending' },
        { id: 3, status: 'generated', isSent: false, sendStatus: 'pending' },
      ];

      const mockEmailsToSchedule = [
        { id: 1, donorId: 1, sessionId: 1, sendStatus: 'pending' },
        { id: 2, donorId: 2, sessionId: 1, sendStatus: 'pending' },
        { id: 3, donorId: 3, sessionId: 1, sendStatus: 'pending' },
      ];

      jest.spyOn(service, 'getOrCreateScheduleConfig').mockResolvedValue(mockConfig as any);
      jest.spyOn(service, 'getEmailsSentToday').mockResolvedValue(0);

      // Mock the three different select queries
      let selectCallCount = 0;
      jest.mocked(db.select).mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // First call: get all emails for logging
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue(mockAllEmails),
            }),
          } as any;
        } else if (selectCallCount === 2) {
          // Second call: get emails to schedule
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue(mockEmailsToSchedule),
            }),
          } as any;
        } else {
          // Third call: validate donors have staff with Gmail
          const mockDonorValidation = mockEmailsToSchedule.map((email) => ({
            donorId: email.donorId,
            donorFirstName: 'Test',
            donorLastName: 'Donor',
            donorEmail: 'donor@test.com',
            assignedToStaffId: 1,
            staffFirstName: 'Staff',
            staffLastName: 'Member',
            staffEmail: 'staff@test.com',
            hasGmailToken: true,
          }));
          return {
            from: jest.fn().mockReturnValue({
              leftJoin: jest.fn().mockReturnValue({
                leftJoin: jest.fn().mockReturnValue({
                  where: jest.fn().mockResolvedValue(mockDonorValidation),
                }),
              }),
            }),
          } as any;
        }
      });

      const mockJobRecords = mockEmailsToSchedule.map((email, idx) => ({
        id: idx + 1,
        emailId: email.id,
        sessionId: 1,
        organizationId: 'org-123',
        scheduledTime: new Date(),
        status: 'scheduled' as const,
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

      const result = await service.scheduleEmailCampaign(1, 'org-123', 'user-123');

      expect(result.scheduled).toBe(3);
      expect(result.scheduledForToday).toBe(2); // Only 2 can be sent today due to limit
      expect(result.scheduledForLater).toBe(1); // 1 scheduled for tomorrow

      jest.useRealTimers();
    });

    it('should throw error if no approved emails to schedule', async () => {
      jest.spyOn(service, 'getOrCreateScheduleConfig').mockResolvedValue({} as any);

      // Mock both select queries to return empty arrays
      let selectCallCount = 0;
      jest.mocked(db.select).mockImplementation(() => {
        selectCallCount++;
        return {
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([]),
          }),
        } as any;
      });

      await expect(service.scheduleEmailCampaign(1, 'org-123', 'user-123')).rejects.toThrow(
        'No emails are ready to be scheduled. No emails found for this campaign.'
      );
    });
  });

  describe('pauseCampaign', () => {
    it('should cancel scheduled jobs and update statuses', async () => {
      const mockJobs = [
        { id: 1, triggerJobId: 'trigger-1', status: 'scheduled' },
        { id: 2, triggerJobId: 'trigger-2', status: 'scheduled' },
      ];

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(mockJobs),
        }),
      } as any);

      (db.update as jest.Mock).mockImplementation((table) => {
        return {
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]),
            }),
          }),
        } as any;
      });

      const result = await service.pauseCampaign(1, 'org-123');

      expect(result.cancelledJobs).toBe(2);
      expect(db.update).toHaveBeenCalledTimes(2); // Once for jobs, once for emails
    });

    it('should throw error if no scheduled emails to pause', async () => {
      jest.mocked(db.select).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      } as any);

      await expect(service.pauseCampaign(1, 'org-123')).rejects.toThrow(
        'No scheduled emails to pause'
      );
    });
  });

  describe('resumeCampaign', () => {
    it('should reschedule paused emails with fresh delays', async () => {
      const mockPausedEmails = [{ id: 1 }, { id: 2 }, { id: 3 }];

      let selectCallCount = 0;
      jest.mocked(db.select).mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // First call - return paused emails
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue(mockPausedEmails),
            }),
          } as any;
        } else {
          // Second call - return campaign config
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue([{ scheduleConfig: null }]),
              }),
            }),
          } as any;
        }
      });

      jest.mocked(db.update).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]),
          }),
        }),
      } as any);

      // Mock scheduleEmailCampaign
      jest.spyOn(service, 'scheduleEmailCampaign').mockResolvedValue({
        scheduled: 3,
        scheduledForToday: 3,
        scheduledForLater: 0,
        estimatedCompletionTime: new Date(),
      });

      const result = await service.resumeCampaign(1, 'org-123', 'user-123');

      expect(result.rescheduled).toBe(3);
      expect(service.scheduleEmailCampaign).toHaveBeenCalledWith(1, 'org-123', 'user-123', null);
    });

    it('should throw error if no paused emails to resume', async () => {
      jest.mocked(db.select).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      } as any);

      await expect(service.resumeCampaign(1, 'org-123', 'user-123')).rejects.toThrow(
        'No paused emails to resume'
      );
    });
  });

  describe('cancelCampaign', () => {
    it('should cancel all remaining emails', async () => {
      // Mock pauseCampaign
      jest.spyOn(service, 'pauseCampaign').mockResolvedValue({ cancelledJobs: 5 });

      jest.mocked(db.update).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]),
          }),
        }),
      } as any);

      const result = await service.cancelCampaign(1, 'org-123');

      expect(service.pauseCampaign).toHaveBeenCalledWith(1, 'org-123');
      expect(result.cancelledEmails).toBe(3);
    });
  });

  describe('getCampaignSchedule', () => {
    it('should return campaign schedule with statistics', async () => {
      const mockSession = {
        id: 1,
        jobName: 'Test Campaign',
        status: 'IN_PROGRESS',
        organizationId: 'org-123',
      };

      const mockEmailStatuses = [
        { status: 'scheduled', count: 5 },
        { status: 'sent', count: 3 },
        { status: 'failed', count: 1 },
      ];

      const mockScheduledEmails = [
        {
          emailId: 1,
          donorId: 1,
          scheduledTime: new Date(),
          status: 'scheduled',
          jobStatus: 'scheduled',
          actualSendTime: null,
        },
        {
          emailId: 2,
          donorId: 2,
          scheduledTime: new Date(Date.now() - 3600000),
          status: 'sent',
          jobStatus: 'completed',
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

      const result = await service.getCampaignSchedule(1, 'org-123');

      expect(result.session.id).toBe(1);
      expect(result.stats.scheduled).toBe(5);
      expect(result.stats.sent).toBe(3);
      expect(result.stats.failed).toBe(1);
      expect(result.scheduledEmails).toHaveLength(2);
    });

    it('should throw error if campaign not found', async () => {
      jest.mocked(db.select).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      } as any);

      await expect(service.getCampaignSchedule(1, 'org-123')).rejects.toThrow('Campaign not found');
    });
  });
});
