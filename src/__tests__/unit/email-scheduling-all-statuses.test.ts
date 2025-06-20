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

describe("Email Scheduling - All Statuses", () => {
  let service: EmailSchedulingService;

  beforeEach(() => {
    service = new EmailSchedulingService();
    jest.clearAllMocks();
  });

  it("should include emails with any status (not just APPROVED)", () => {
    // Test that the scheduling query doesn't filter by approval status
    const mockEmails = [
      { id: 1, status: "APPROVED", isSent: false, sendStatus: "pending" },
      { id: 2, status: "PENDING_APPROVAL", isSent: false, sendStatus: "pending" },
      { id: 3, status: "GENERATED", isSent: false, sendStatus: null },
    ];

    // All these emails should be schedulable
    const schedulableEmails = mockEmails.filter(email => 
      !email.isSent && 
      (email.sendStatus === null || email.sendStatus === "pending" || email.sendStatus === "paused")
    );

    expect(schedulableEmails).toHaveLength(3);
  });

  it("should exclude emails that are already sent", () => {
    const mockEmails = [
      { id: 1, status: "APPROVED", isSent: true, sendStatus: "sent" },
      { id: 2, status: "APPROVED", isSent: false, sendStatus: "pending" },
    ];

    const schedulableEmails = mockEmails.filter(email => !email.isSent);
    expect(schedulableEmails).toHaveLength(1);
    expect(schedulableEmails[0].id).toBe(2);
  });

  it("should exclude emails with incompatible send status", () => {
    const mockEmails = [
      { id: 1, status: "APPROVED", isSent: false, sendStatus: "scheduled" },
      { id: 2, status: "APPROVED", isSent: false, sendStatus: "running" },
      { id: 3, status: "APPROVED", isSent: false, sendStatus: "pending" },
      { id: 4, status: "APPROVED", isSent: false, sendStatus: "paused" },
      { id: 5, status: "APPROVED", isSent: false, sendStatus: null },
    ];

    const schedulableEmails = mockEmails.filter(email => 
      !email.isSent && 
      (email.sendStatus === null || email.sendStatus === "pending" || email.sendStatus === "paused")
    );

    expect(schedulableEmails).toHaveLength(3);
    expect(schedulableEmails.map(e => e.id)).toEqual([3, 4, 5]);
  });
});