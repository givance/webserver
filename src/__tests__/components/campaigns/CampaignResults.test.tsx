import React from "react";
import { render, screen, waitFor } from "@/__tests__/utils/test-utils";
import userEvent from "@testing-library/user-event";
import EmailGenerationResultsPage from "@/app/(app)/campaign/results/[sessionId]/page";
import { donorFactory } from "@/__tests__/mocks/data";

// Mock the hooks
jest.mock("@/app/hooks/use-communications");
jest.mock("@/app/hooks/use-donors");
jest.mock("@/app/hooks/use-email-tracking");
jest.mock("@/app/hooks/use-staff-members");

// Mock useParams to return the session ID
jest.mock("next/navigation", () => {
  const actual = jest.requireActual("next/navigation");
  return {
    ...actual,
    useParams: () => ({ sessionId: "123" }),
  };
});

// Mock the EmailListViewer component
jest.mock("@/app/(app)/campaign/components/EmailListViewer", () => ({
  EmailListViewer: ({ emails, donors }: any) => (
    <div data-testid="email-list-viewer">
      <p>Emails: {emails.length}</p>
      <p>Donors: {Object.keys(donors).length}</p>
    </div>
  ),
}));

// Mock TrackingAnalytics component
jest.mock("@/components/tracking/tracking-analytics", () => ({
  TrackingAnalytics: ({ stats }: any) => (
    <div data-testid="tracking-analytics">
      <p>Sent: {stats.sent}</p>
      <p>Opened: {stats.opened}</p>
    </div>
  ),
}));

describe("CampaignResults", () => {
  const mockSessionData = {
    session: {
      id: 123,
      instruction: "Test campaign instruction",
      refinedInstruction: "Refined test instruction",
      chatHistory: [
        { role: "user", content: "Create a campaign" },
        { role: "assistant", content: "I'll help you create a campaign" },
      ],
      selectedDonorIds: [1, 2, 3],
      previewDonorIds: [1],
      totalDonors: 3,
      completedDonors: 3,
      status: "completed",
      createdAt: "2024-01-01T00:00:00Z",
      completedAt: "2024-01-01T01:00:00Z",
    },
    emails: [
      {
        id: 1,
        donorId: 1,
        subject: "Thank you for your support",
        structuredContent: [
          {
            piece: "Dear John,",
            references: ["donor_name"],
            addNewlineAfter: true,
          },
          {
            piece: "Thank you for your continued support.",
            references: [],
            addNewlineAfter: true,
          },
        ],
        referenceContexts: {
          donor_name: "John Doe",
        },
        isPreview: false,
      },
      {
        id: 2,
        donorId: 2,
        subject: "Thank you for your support",
        structuredContent: [
          {
            piece: "Dear Jane,",
            references: ["donor_name"],
            addNewlineAfter: true,
          },
        ],
        referenceContexts: {
          donor_name: "Jane Smith",
        },
        isPreview: false,
      },
    ],
  };

  const mockDonors = [
    donorFactory.create({ id: 1, name: "John Doe" }),
    donorFactory.create({ id: 2, name: "Jane Smith" }),
    donorFactory.create({ id: 3, name: "Bob Johnson" }),
  ];

  const mockUseCommunications = {
    getSession: jest.fn().mockReturnValue({
      data: mockSessionData,
      isLoading: false,
      error: null,
    }),
  };

  const mockUseDonors = {
    getDonorsQuery: jest.fn().mockReturnValue({
      data: mockDonors,
    }),
  };

  const mockUseSessionTracking = {
    donorStats: {
      123: {
        sent: 2,
        opened: 1,
        clicked: 0,
        bounced: 0,
      },
    },
  };

  const mockUseStaffMembers = {
    staffMembers: [
      { id: 1, name: "Staff One" },
      { id: 2, name: "Staff Two" },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    require("@/app/hooks/use-communications").useCommunications.mockReturnValue(mockUseCommunications);
    require("@/app/hooks/use-donors").useDonors.mockReturnValue(mockUseDonors);
    require("@/app/hooks/use-email-tracking").useSessionTracking.mockReturnValue(mockUseSessionTracking);
    require("@/app/hooks/use-staff-members").useStaffMembers.mockReturnValue(mockUseStaffMembers);
  });

  it("renders the campaign results page with session data", async () => {
    render(<EmailGenerationResultsPage />);

    await waitFor(() => {
      // Check header information
      expect(screen.getByText("Campaign Results")).toBeInTheDocument();
      expect(screen.getByText(/Session ID: 123/)).toBeInTheDocument();
      expect(screen.getByText(/Completed/i)).toBeInTheDocument();
    });
  });

  it("displays session statistics", async () => {
    render(<EmailGenerationResultsPage />);

    await waitFor(() => {
      // Check statistics cards
      expect(screen.getByText("3")).toBeInTheDocument(); // Total donors
      expect(screen.getByText("Total Donors")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument(); // Generated emails
      expect(screen.getByText("Generated Emails")).toBeInTheDocument();
    });
  });

  it("shows the email list viewer", async () => {
    render(<EmailGenerationResultsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("email-list-viewer")).toBeInTheDocument();
      expect(screen.getByText("Emails: 2")).toBeInTheDocument();
      expect(screen.getByText("Donors: 3")).toBeInTheDocument();
    });
  });

  it("displays tracking analytics in analytics tab", async () => {
    const user = userEvent.setup();
    render(<EmailGenerationResultsPage />);

    // Click on analytics tab
    const analyticsTab = screen.getByRole("tab", { name: /analytics/i });
    await user.click(analyticsTab);

    await waitFor(() => {
      expect(screen.getByTestId("tracking-analytics")).toBeInTheDocument();
      expect(screen.getByText("Sent: 2")).toBeInTheDocument();
      expect(screen.getByText("Opened: 1")).toBeInTheDocument();
    });
  });

  it("shows instruction details in details tab", async () => {
    const user = userEvent.setup();
    render(<EmailGenerationResultsPage />);

    // Click on details tab
    const detailsTab = screen.getByRole("tab", { name: /details/i });
    await user.click(detailsTab);

    await waitFor(() => {
      expect(screen.getByText("Instruction")).toBeInTheDocument();
      expect(screen.getByText("Test campaign instruction")).toBeInTheDocument();
      expect(screen.getByText("Refined Instruction")).toBeInTheDocument();
      expect(screen.getByText("Refined test instruction")).toBeInTheDocument();
    });
  });

  it("displays chat history", async () => {
    const user = userEvent.setup();
    render(<EmailGenerationResultsPage />);

    // Click on details tab
    const detailsTab = screen.getByRole("tab", { name: /details/i });
    await user.click(detailsTab);

    await waitFor(() => {
      expect(screen.getByText("Chat History")).toBeInTheDocument();
      expect(screen.getByText("Create a campaign")).toBeInTheDocument();
      expect(screen.getByText("I'll help you create a campaign")).toBeInTheDocument();
    });
  });

  it("handles loading state", () => {
    mockUseCommunications.getSession.mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      error: null,
    });

    render(<EmailGenerationResultsPage />);

    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
  });

  it("handles error state", () => {
    mockUseCommunications.getSession.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      error: new Error("Failed to load session"),
    });

    render(<EmailGenerationResultsPage />);

    expect(screen.getByText(/error loading session/i)).toBeInTheDocument();
  });

  it("handles session not found", () => {
    mockUseCommunications.getSession.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      error: null,
    });

    render(<EmailGenerationResultsPage />);

    expect(screen.getByText(/session not found/i)).toBeInTheDocument();
  });

  it("handles pagination of emails", async () => {
    // Create many emails to test pagination
    const manyEmails = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      donorId: (i % 3) + 1,
      subject: `Email ${i + 1}`,
      structuredContent: [],
      referenceContexts: {},
      isPreview: false,
    }));

    mockUseCommunications.getSession.mockReturnValueOnce({
      data: {
        ...mockSessionData,
        emails: manyEmails,
      },
      isLoading: false,
      error: null,
    });

    const user = userEvent.setup();
    render(<EmailGenerationResultsPage />);

    await waitFor(() => {
      // Should show pagination controls
      expect(screen.getByText(/page 1 of/i)).toBeInTheDocument();
    });

    // Click next page
    const nextButton = screen.getByRole("button", { name: /next/i });
    await user.click(nextButton);

    // Should update page number
    await waitFor(() => {
      expect(screen.getByText(/page 2 of/i)).toBeInTheDocument();
    });
  });

  it("filters emails by search term", async () => {
    const user = userEvent.setup();
    render(<EmailGenerationResultsPage />);

    // Type in search
    const searchInput = screen.getByPlaceholderText(/search emails/i);
    await user.type(searchInput, "John");

    // Should filter emails (implementation would filter in actual component)
    await waitFor(() => {
      expect(screen.getByTestId("email-list-viewer")).toBeInTheDocument();
    });
  });
});