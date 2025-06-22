import {
  formatDonationHistoryWithIds,
  formatCommunicationHistoryWithIds,
  formatWebsiteSummaryWithIds,
} from "@/app/lib/utils/email-generator/context-formatters";
import type { DonationWithDetails } from "@/app/lib/data/donations";
import type { RawCommunicationThread, Organization } from "@/app/lib/utils/email-generator/types";

describe("context-formatters", () => {
  describe("formatDonationHistoryWithIds", () => {
    it("should return empty state for no donations", () => {
      const result = formatDonationHistoryWithIds([]);
      expect(result.promptString).toBe("No previous donations.");
      expect(result.donationsWithIds).toEqual([]);
    });

    it("should format donations with single context ID", () => {
      const donations: DonationWithDetails[] = [
        {
          id: 1,
          amount: 10000, // $100
          date: new Date("2024-01-15"),
          project: { id: 1, name: "Education Fund" },
          donorId: 123,
          organizationId: "org123",
        } as DonationWithDetails,
        {
          id: 2,
          amount: 25000, // $250
          date: new Date("2024-02-20"),
          project: null,
          donorId: 123,
          organizationId: "org123",
        } as DonationWithDetails,
      ];

      const result = formatDonationHistoryWithIds(donations);

      expect(result.donationsWithIds).toHaveLength(2);
      expect(result.donationsWithIds[0].displayId).toBe("donation-context");
      expect(result.donationsWithIds[1].displayId).toBe("donation-context");

      // Should be sorted by date (most recent first)
      expect(result.donationsWithIds[0].date.getTime()).toBeGreaterThan(result.donationsWithIds[1].date.getTime());
    });

    it("should format prompt string with single donation context", () => {
      const donations: DonationWithDetails[] = [
        {
          id: 1,
          amount: 50000, // $500
          date: new Date("2024-03-01"),
          project: { id: 1, name: "Building Campaign" },
          donorId: 123,
          organizationId: "org123",
        } as DonationWithDetails,
      ];

      const result = formatDonationHistoryWithIds(donations);

      expect(result.promptString).toContain("[donation-context]");
      expect(result.promptString).toContain("All donations:");
      expect(result.promptString).toContain("1. ");
      expect(result.promptString).toContain("$500.00");
      expect(result.promptString).toContain("to Building Campaign");
      // Date will be formatted based on system locale
      expect(result.promptString).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/); // Matches date format
      // Should be multi-line format
      expect(result.promptString.split("\n")).toHaveLength(2);
    });

    it("should handle donations without projects in single context", () => {
      const donations: DonationWithDetails[] = [
        {
          id: 1,
          amount: 15000, // $150
          date: new Date("2024-01-01"),
          project: null,
          donorId: 123,
          organizationId: "org123",
        } as DonationWithDetails,
      ];

      const result = formatDonationHistoryWithIds(donations);

      expect(result.promptString).toContain("[donation-context]");
      expect(result.promptString).toContain("1. ");
      expect(result.promptString).toContain("$150.00");
      expect(result.promptString).not.toContain(" to ");
    });

    it("should combine multiple donations in numbered list format", () => {
      const donations: DonationWithDetails[] = [
        {
          id: 1,
          amount: 10000,
          date: new Date("2024-01-01"),
          project: { id: 1, name: "Project A" },
          donorId: 123,
          organizationId: "org123",
        } as DonationWithDetails,
        {
          id: 2,
          amount: 20000,
          date: new Date("2024-03-01"),
          project: { id: 2, name: "Project B" },
          donorId: 123,
          organizationId: "org123",
        } as DonationWithDetails,
      ];

      const result = formatDonationHistoryWithIds(donations);

      expect(result.promptString).toContain("[donation-context]");
      expect(result.promptString).toContain("All donations:");
      expect(result.promptString).toContain("1. "); // First donation (most recent)
      expect(result.promptString).toContain("2. "); // Second donation
      expect(result.promptString).toContain("$200.00"); // Most recent first
      expect(result.promptString).toContain("$100.00");
      expect(result.promptString).toContain("Project A");
      expect(result.promptString).toContain("Project B");
      // Should be multi-line format with numbered list
      const lines = result.promptString.split("\n");
      expect(lines).toHaveLength(3); // Header + 2 donations
      expect(lines[1]).toMatch(/^1\. /); // First numbered item
      expect(lines[2]).toMatch(/^2\. /); // Second numbered item
    });

    it("should sort donations by date (most recent first)", () => {
      const donations: DonationWithDetails[] = [
        {
          id: 1,
          amount: 10000,
          date: new Date("2024-01-01"),
          project: null,
          donorId: 123,
          organizationId: "org123",
        } as DonationWithDetails,
        {
          id: 2,
          amount: 20000,
          date: new Date("2024-03-01"),
          project: null,
          donorId: 123,
          organizationId: "org123",
        } as DonationWithDetails,
        {
          id: 3,
          amount: 30000,
          date: new Date("2024-02-01"),
          project: null,
          donorId: 123,
          organizationId: "org123",
        } as DonationWithDetails,
      ];

      const result = formatDonationHistoryWithIds(donations);

      expect(result.donationsWithIds[0].id).toBe(2); // March (most recent)
      expect(result.donationsWithIds[1].id).toBe(3); // February
      expect(result.donationsWithIds[2].id).toBe(1); // January (oldest)
    });
  });

  describe("formatCommunicationHistoryWithIds", () => {
    it("should return empty state for no communications", () => {
      const result = formatCommunicationHistoryWithIds([]);
      expect(result.promptString).toBe("No past communications.");
      expect(result.formattedMessages).toEqual([]);
    });

    it("should format communication messages with IDs", () => {
      const communications: RawCommunicationThread[] = [
        {
          content: [{ content: "First message in thread 1" }, { content: "Second message in thread 1" }],
        },
        {
          content: [{ content: "First message in thread 2" }],
        },
      ];

      const result = formatCommunicationHistoryWithIds(communications);

      expect(result.formattedMessages).toHaveLength(3);
      expect(result.formattedMessages[0].id).toBe("comm-1-1");
      expect(result.formattedMessages[1].id).toBe("comm-1-2");
      expect(result.formattedMessages[2].id).toBe("comm-2-1");
    });

    it("should format prompt string correctly", () => {
      const communications: RawCommunicationThread[] = [
        {
          content: [{ content: "Thank you for your donation!" }],
        },
      ];

      const result = formatCommunicationHistoryWithIds(communications);

      expect(result.promptString).toBe("- [comm-1-1] Thank you for your donation!");
    });

    it("should handle empty content arrays", () => {
      const communications: RawCommunicationThread[] = [{ content: [] }, { content: null as any }];

      const result = formatCommunicationHistoryWithIds(communications);

      expect(result.promptString).toBe("No past communications.");
      expect(result.formattedMessages).toEqual([]);
    });

    it("should handle multiple threads and messages", () => {
      const communications: RawCommunicationThread[] = [
        {
          content: [{ content: "Message 1" }, { content: "Message 2" }],
        },
        {
          content: [{ content: "Message 3" }],
        },
      ];

      const result = formatCommunicationHistoryWithIds(communications);

      const lines = result.promptString.split("\n");
      expect(lines).toHaveLength(3);
      expect(lines[0]).toContain("[comm-1-1] Message 1");
      expect(lines[1]).toContain("[comm-1-2] Message 2");
      expect(lines[2]).toContain("[comm-2-1] Message 3");
    });
  });

  describe("formatWebsiteSummaryWithIds", () => {
    it("should return empty state for null organization", () => {
      const result = formatWebsiteSummaryWithIds(null);
      expect(result.promptString).toBe("No website summary provided.");
      expect(result.summaryParagraphs).toEqual([]);
    });

    it("should return empty state for organization without summary", () => {
      const org: Organization = {
        websiteSummary: null,
      } as Organization;

      const result = formatWebsiteSummaryWithIds(org);
      expect(result.promptString).toBe("No website summary provided.");
      expect(result.summaryParagraphs).toEqual([]);
    });

    it("should prioritize rawWebsiteSummary over websiteSummary", () => {
      const org: Organization = {
        websiteSummary: "Old summary",
        rawWebsiteSummary: "New raw summary",
      } as Organization;

      const result = formatWebsiteSummaryWithIds(org);
      expect(result.summaryParagraphs[0].content).toBe("New raw summary");
    });

    it("should split summary into paragraphs", () => {
      const org: Organization = {
        websiteSummary: "First paragraph.\n\nSecond paragraph.\n\n\nThird paragraph.",
      } as Organization;

      const result = formatWebsiteSummaryWithIds(org);

      expect(result.summaryParagraphs).toHaveLength(3);
      expect(result.summaryParagraphs[0].id).toBe("summary-paragraph-1");
      expect(result.summaryParagraphs[0].content).toBe("First paragraph.");
      expect(result.summaryParagraphs[1].id).toBe("summary-paragraph-2");
      expect(result.summaryParagraphs[1].content).toBe("Second paragraph.");
      expect(result.summaryParagraphs[2].id).toBe("summary-paragraph-3");
      expect(result.summaryParagraphs[2].content).toBe("Third paragraph.");
    });

    it("should format prompt string correctly", () => {
      const org: Organization = {
        websiteSummary: "Summary paragraph 1.\n\nSummary paragraph 2.",
      } as Organization;

      const result = formatWebsiteSummaryWithIds(org);

      const lines = result.promptString.split("\n");
      expect(lines).toHaveLength(2);
      expect(lines[0]).toBe("- [summary-paragraph-1] Summary paragraph 1.");
      expect(lines[1]).toBe("- [summary-paragraph-2] Summary paragraph 2.");
    });

    it("should handle empty or whitespace-only summary", () => {
      const org: Organization = {
        websiteSummary: "   \n\n   ",
      } as Organization;

      const result = formatWebsiteSummaryWithIds(org);
      expect(result.promptString).toBe("No website summary provided.");
      expect(result.summaryParagraphs).toEqual([]);
    });

    it("should trim paragraph content", () => {
      const org: Organization = {
        websiteSummary: "  Paragraph with spaces  \n\n  Another paragraph  ",
      } as Organization;

      const result = formatWebsiteSummaryWithIds(org);

      expect(result.summaryParagraphs[0].content).toBe("Paragraph with spaces");
      expect(result.summaryParagraphs[1].content).toBe("Another paragraph");
    });
  });
});
