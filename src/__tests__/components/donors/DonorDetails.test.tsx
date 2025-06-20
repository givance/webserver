import React from "react";
import { render, screen, waitFor } from "@/__tests__/utils/test-utils";
import userEvent from "@testing-library/user-event";
import DonorProfilePage from "@/app/(app)/donors/[id]/page";
import { donorFactory } from "@/__tests__/mocks/data";

// Mock the hooks
jest.mock("@/app/hooks/use-donors");
jest.mock("@/app/hooks/use-donations");
jest.mock("@/app/hooks/use-communications");
jest.mock("@/app/hooks/use-staff-members");
jest.mock("@/app/hooks/use-donor-journey-stages");
jest.mock("@/app/hooks/use-donor-research");

// Mock useParams to return the donor ID
jest.mock("next/navigation", () => {
  const actual = jest.requireActual("next/navigation");
  return {
    ...actual,
    useParams: () => ({ id: "123" }),
  };
});

// Get the mocked router from setup
const mockRouter = require("next/navigation").useRouter();

// Mock next/link
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("DonorDetails", () => {
  const mockDonor = donorFactory.create({
    id: 123,
    name: "John Doe",
    email: "john@example.com",
    phone: "+1234567890",
    address: "123 Main St",
    city: "New York",
    state: "NY",
    zip: "10001",
    notes: "Important donor notes",
    staffId: 1,
    donorStageId: "stage-1",
  });

  const mockUseDonors = {
    getDonorQuery: jest.fn().mockReturnValue({
      data: mockDonor,
      isLoading: false,
      error: null,
    }),
    updateDonor: jest.fn(),
    getDonorStats: jest.fn().mockReturnValue({
      data: {
        totalDonated: 50000,
        donationCount: 10,
        lastDonationDate: new Date("2024-01-15"),
        averageDonation: 5000,
      },
    }),
  };

  const mockUseDonations = {
    list: jest.fn().mockReturnValue({
      data: {
        donations: [
          {
            id: 1,
            date: new Date("2024-01-15"),
            amount: 10000,
            projectId: 1,
            project: { name: "Annual Campaign" },
            status: "completed",
          },
          {
            id: 2,
            date: new Date("2023-12-01"),
            amount: 5000,
            projectId: 2,
            project: { name: "Building Fund" },
            status: "completed",
          },
        ],
        totalCount: 2,
      },
      isLoading: false,
    }),
  };

  const mockUseCommunications = {
    listThreads: jest.fn().mockReturnValue({
      data: {
        threads: [
          {
            id: 1,
            channel: "email",
            createdAt: new Date("2024-01-10"),
            latestMessage: "Thank you for your donation",
            participants: ["staff1"],
          },
        ],
        totalCount: 1,
      },
      isLoading: false,
    }),
  };

  const mockUseStaffMembers = {
    staffMembers: [
      { id: 1, name: "John Staff" },
      { id: 2, name: "Jane Staff" },
    ],
  };

  const mockUseDonorJourneyStages = {
    donorJourneyStagesQuery: jest.fn().mockReturnValue({
      data: [
        { id: "stage-1", name: "Prospect", color: "blue" },
        { id: "stage-2", name: "Active Donor", color: "green" },
      ],
    }),
  };

  const mockUseDonorResearchData = {
    donorResearchQuery: jest.fn().mockReturnValue({
      data: null,
      isLoading: false,
    }),
    isResearching: false,
    researchDonor: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up mocks
    require("@/app/hooks/use-donors").useDonors.mockReturnValue(mockUseDonors);
    require("@/app/hooks/use-donations").useDonations.mockReturnValue(mockUseDonations);
    require("@/app/hooks/use-communications").useCommunications.mockReturnValue(mockUseCommunications);
    require("@/app/hooks/use-staff-members").useStaffMembers.mockReturnValue(mockUseStaffMembers);
    require("@/app/hooks/use-donor-journey-stages").useDonorJourneyStages.mockReturnValue(mockUseDonorJourneyStages);
    require("@/app/hooks/use-donor-research").useDonorResearchData.mockReturnValue(mockUseDonorResearchData);
  });

  it("renders donor profile with basic information", async () => {
    render(<DonorProfilePage />);

    // Check donor name and contact info
    await waitFor(() => {
      expect(screen.getByText("John Doe")).toBeInTheDocument();
      expect(screen.getByText("john@example.com")).toBeInTheDocument();
      expect(screen.getByText("+1234567890")).toBeInTheDocument();
    });

    // Check address
    expect(screen.getByText("123 Main St")).toBeInTheDocument();
    expect(screen.getByText("New York, NY 10001")).toBeInTheDocument();
  });

  it("displays donor statistics", async () => {
    render(<DonorProfilePage />);

    await waitFor(() => {
      // Total donated
      expect(screen.getByText("$50,000")).toBeInTheDocument();
      expect(screen.getByText("Total Donated")).toBeInTheDocument();

      // Donation count
      expect(screen.getByText("10")).toBeInTheDocument();
      expect(screen.getByText("Donations")).toBeInTheDocument();

      // Average donation
      expect(screen.getByText("$5,000")).toBeInTheDocument();
      expect(screen.getByText("Average")).toBeInTheDocument();
    });
  });

  it("handles inline editing of donor name", async () => {
    const user = userEvent.setup();
    mockUseDonors.updateDonor.mockResolvedValueOnce(true);

    render(<DonorProfilePage />);

    // Wait for donor name to appear
    await waitFor(() => {
      expect(screen.getByText("John Doe")).toBeInTheDocument();
    });

    // Click to edit name
    const nameElement = screen.getByText("John Doe");
    await user.click(nameElement);

    // Type new name
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "Jane Doe");
    await user.keyboard("{Enter}");

    // Verify update was called
    await waitFor(() => {
      expect(mockUseDonors.updateDonor).toHaveBeenCalledWith({
        id: 123,
        name: "Jane Doe",
      });
    });
  });

  it("handles staff assignment change", async () => {
    const user = userEvent.setup();
    mockUseDonors.updateDonor.mockResolvedValueOnce(true);

    render(<DonorProfilePage />);

    // Wait for staff dropdown to appear
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: /assigned to/i })).toBeInTheDocument();
    });

    // Open dropdown and select new staff
    const staffDropdown = screen.getByRole("combobox", { name: /assigned to/i });
    await user.click(staffDropdown);

    const janeStaff = screen.getByRole("option", { name: "Jane Staff" });
    await user.click(janeStaff);

    // Verify update was called
    await waitFor(() => {
      expect(mockUseDonors.updateDonor).toHaveBeenCalledWith({
        id: 123,
        staffId: 2,
      });
    });
  });

  it("handles donor stage change", async () => {
    const user = userEvent.setup();
    mockUseDonors.updateDonor.mockResolvedValueOnce(true);

    render(<DonorProfilePage />);

    // Wait for stage dropdown to appear
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: /donor stage/i })).toBeInTheDocument();
    });

    // Open dropdown and select new stage
    const stageDropdown = screen.getByRole("combobox", { name: /donor stage/i });
    await user.click(stageDropdown);

    const activeStage = screen.getByRole("option", { name: "Active Donor" });
    await user.click(activeStage);

    // Verify update was called
    await waitFor(() => {
      expect(mockUseDonors.updateDonor).toHaveBeenCalledWith({
        id: 123,
        donorStageId: "stage-2",
      });
    });
  });

  it("handles notes editing", async () => {
    const user = userEvent.setup();
    mockUseDonors.updateDonor.mockResolvedValueOnce(true);

    render(<DonorProfilePage />);

    // Wait for notes section
    await waitFor(() => {
      expect(screen.getByText("Important donor notes")).toBeInTheDocument();
    });

    // Click edit button
    const editButton = screen.getByRole("button", { name: /edit notes/i });
    await user.click(editButton);

    // Edit notes
    const textarea = screen.getByRole("textbox");
    await user.clear(textarea);
    await user.type(textarea, "Updated donor notes");

    // Save
    const saveButton = screen.getByRole("button", { name: /save/i });
    await user.click(saveButton);

    // Verify update was called
    await waitFor(() => {
      expect(mockUseDonors.updateDonor).toHaveBeenCalledWith({
        id: 123,
        notes: "Updated donor notes",
      });
    });
  });

  it("displays donations tab with data", async () => {
    render(<DonorProfilePage />);

    // Click donations tab
    const donationsTab = screen.getByRole("tab", { name: /donations/i });
    await userEvent.click(donationsTab);

    // Check donations are displayed
    await waitFor(() => {
      expect(screen.getByText("Annual Campaign")).toBeInTheDocument();
      expect(screen.getByText("$10,000")).toBeInTheDocument();
      expect(screen.getByText("Building Fund")).toBeInTheDocument();
      expect(screen.getByText("$5,000")).toBeInTheDocument();
    });
  });

  it("displays communications tab", async () => {
    render(<DonorProfilePage />);

    // Click communications tab
    const communicationsTab = screen.getByRole("tab", { name: /communications/i });
    await userEvent.click(communicationsTab);

    // Check communications are displayed
    await waitFor(() => {
      expect(screen.getByText("Thank you for your donation")).toBeInTheDocument();
    });
  });

  it("handles donor research", async () => {
    const user = userEvent.setup();
    mockUseDonorResearchData.researchDonor.mockResolvedValueOnce({});

    render(<DonorProfilePage />);

    // Click research tab
    const researchTab = screen.getByRole("tab", { name: /research/i });
    await user.click(researchTab);

    // Click research button
    const researchButton = screen.getByRole("button", { name: /research donor/i });
    await user.click(researchButton);

    // Verify research was triggered
    await waitFor(() => {
      expect(mockUseDonorResearchData.researchDonor).toHaveBeenCalledWith(123);
    });
  });

  it("displays loading state", () => {
    mockUseDonors.getDonorQuery.mockReturnValueOnce({
      data: null,
      isLoading: true,
      error: null,
    });

    render(<DonorProfilePage />);

    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
  });

  it("displays error state", () => {
    mockUseDonors.getDonorQuery.mockReturnValueOnce({
      data: null,
      isLoading: false,
      error: new Error("Failed to load donor"),
    });

    render(<DonorProfilePage />);

    expect(screen.getByText(/failed to load donor/i)).toBeInTheDocument();
  });

  it("handles navigation back to donors list", async () => {
    const user = userEvent.setup();
    mockRouter.back.mockClear();

    render(<DonorProfilePage />);

    const backButton = screen.getByRole("button", { name: /back/i });
    await user.click(backButton);

    expect(mockRouter.back).toHaveBeenCalled();
  });
});