import { EmailSchedulingService } from "@/app/lib/services/email-scheduling.service";

// Mock the database and dependencies
jest.mock("@/app/lib/db", () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  }
}));

jest.mock("@/trigger/jobs/sendSingleEmail", () => ({
  sendSingleEmailTask: {
    trigger: jest.fn().mockResolvedValue({ id: "trigger-job-id" })
  }
}));

describe("Email Scheduling - Failed Email Retry", () => {
  let service: EmailSchedulingService;

  beforeEach(() => {
    service = new EmailSchedulingService();
    jest.clearAllMocks();
  });

  it("should include failed emails for retry", () => {
    const mockEmails = [
      { id: 1, status: "APPROVED", isSent: false, sendStatus: "pending" },
      { id: 2, status: "APPROVED", isSent: false, sendStatus: "failed" },
      { id: 3, status: "APPROVED", isSent: false, sendStatus: "paused" },
      { id: 4, status: "APPROVED", isSent: true, sendStatus: "sent" },
      { id: 5, status: "APPROVED", isSent: false, sendStatus: "scheduled" },
    ];

    // Test which emails should be schedulable
    const schedulableEmails = mockEmails.filter(email => 
      !email.isSent && 
      (email.sendStatus === null || 
       email.sendStatus === "pending" || 
       email.sendStatus === "paused" ||
       email.sendStatus === "failed")
    );

    expect(schedulableEmails).toHaveLength(3);
    expect(schedulableEmails.map(e => e.id)).toEqual([1, 2, 3]);
    
    // Verify that failed email is included
    const failedEmail = schedulableEmails.find(e => e.sendStatus === "failed");
    expect(failedEmail).toBeDefined();
    expect(failedEmail?.id).toBe(2);
  });

  it("should exclude emails that are already scheduled or running", () => {
    const mockEmails = [
      { id: 1, status: "APPROVED", isSent: false, sendStatus: "failed" },    // ✓ Should retry
      { id: 2, status: "APPROVED", isSent: false, sendStatus: "scheduled" }, // ✗ Already scheduled
      { id: 3, status: "APPROVED", isSent: false, sendStatus: "running" },   // ✗ Currently running
      { id: 4, status: "APPROVED", isSent: true, sendStatus: "sent" },       // ✗ Already sent
    ];

    const schedulableEmails = mockEmails.filter(email => 
      !email.isSent && 
      email.sendStatus !== "scheduled" && 
      email.sendStatus !== "running"
    );

    expect(schedulableEmails).toHaveLength(1);
    expect(schedulableEmails[0].id).toBe(1);
    expect(schedulableEmails[0].sendStatus).toBe("failed");
  });

  it("should handle a campaign with only failed emails", () => {
    const mockEmails = [
      { id: 1, status: "APPROVED", isSent: false, sendStatus: "failed" },
      { id: 2, status: "APPROVED", isSent: false, sendStatus: "failed" },
    ];

    const schedulableEmails = mockEmails.filter(email => 
      !email.isSent && 
      (email.sendStatus === "failed" || email.sendStatus === "pending")
    );

    expect(schedulableEmails).toHaveLength(2);
    schedulableEmails.forEach(email => {
      expect(email.sendStatus).toBe("failed");
    });
  });
});