import React from "react";
import { render, screen, waitFor, within } from "@/__tests__/utils/test-utils";
import userEvent from "@testing-library/user-event";
import DonorListPage from "@/app/(app)/donors/page";
import { donorFactory } from "@/__tests__/mocks/data";
import { trpc } from "@/app/lib/trpc/client";

// Mock the hooks
jest.mock("@/app/hooks/use-donors");
jest.mock("@/app/hooks/use-staff-members");
jest.mock("@/app/hooks/use-lists");
jest.mock("@/app/hooks/use-bulk-donor-research");

// Mock next/link
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("DonorsPage", () => {
  const mockDonors = donorFactory.createMany(5);
  
  const mockUseDonors = {
    listDonors: jest.fn().mockReturnValue({
      data: { donors: mockDonors, totalCount: mockDonors.length },
      isLoading: false,
      error: null,
    }),
    getMultipleDonorStats: jest.fn().mockReturnValue({
      data: mockDonors.reduce((acc, donor) => ({
        ...acc,
        [donor.id]: { totalDonated: 10000, donationCount: 5 }
      }), {}),
    }),
    updateDonorStaff: jest.fn(),
    bulkDeleteDonors: jest.fn(),
    getAllDonorIds: jest.fn().mockReturnValue({ data: [] }),
    isBulkDeleting: false,
  };

  const mockUseStaffMembers = {
    staffMembers: [
      { id: 1, name: "John Staff" },
      { id: 2, name: "Jane Staff" },
    ],
  };

  const mockUseLists = {
    listDonorLists: jest.fn().mockReturnValue({
      data: [
        { id: 1, name: "Major Donors" },
        { id: 2, name: "Monthly Donors" },
      ],
    }),
    createList: jest.fn(),
    addDonorsToList: jest.fn(),
    isCreating: false,
    isAddingDonors: false,
  };

  const mockUseBulkDonorResearch = {
    startBulkResearch: jest.fn(),
    researchStatistics: null,
    isStartingResearch: false,
    isLoadingStatistics: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up mocks
    require("@/app/hooks/use-donors").useDonors.mockReturnValue(mockUseDonors);
    require("@/app/hooks/use-staff-members").useStaffMembers.mockReturnValue(mockUseStaffMembers);
    require("@/app/hooks/use-lists").useLists.mockReturnValue(mockUseLists);
    require("@/app/hooks/use-bulk-donor-research").useBulkDonorResearch.mockReturnValue(mockUseBulkDonorResearch);
  });

  it("renders the donor list page with donors", async () => {
    render(<DonorListPage />);

    // Check page title
    expect(screen.getByText("Donors")).toBeInTheDocument();

    // Check search input
    expect(screen.getByPlaceholderText("Search donors...")).toBeInTheDocument();

    // Check add donor button
    expect(screen.getByRole("link", { name: /add donor/i })).toBeInTheDocument();

    // Wait for donors to load
    await waitFor(() => {
      mockDonors.forEach(donor => {
        expect(screen.getByText(donor.name)).toBeInTheDocument();
      });
    });
  });

  it("handles search functionality", async () => {
    const user = userEvent.setup();
    render(<DonorListPage />);

    const searchInput = screen.getByPlaceholderText("Search donors...");
    
    // Type in search
    await user.type(searchInput, "John");

    // Verify search was triggered with debounce
    await waitFor(() => {
      expect(mockUseDonors.listDonors).toHaveBeenCalledWith(
        expect.objectContaining({
          searchTerm: "John",
        })
      );
    }, { timeout: 1000 });
  });

  it("handles filter by list", async () => {
    const user = userEvent.setup();
    render(<DonorListPage />);

    // Open filter dropdown
    const listFilter = screen.getByRole("combobox", { name: /filter by list/i });
    await user.click(listFilter);

    // Select a list
    const majorDonorsList = screen.getByRole("option", { name: "Major Donors" });
    await user.click(majorDonorsList);

    // Verify filter was applied
    await waitFor(() => {
      expect(mockUseDonors.listDonors).toHaveBeenCalledWith(
        expect.objectContaining({
          listId: 1,
        })
      );
    });
  });

  it("handles filter by staff member", async () => {
    const user = userEvent.setup();
    render(<DonorListPage />);

    // Open staff filter dropdown
    const staffFilter = screen.getByRole("combobox", { name: /filter by staff/i });
    await user.click(staffFilter);

    // Select a staff member
    const johnStaff = screen.getByRole("option", { name: "John Staff" });
    await user.click(johnStaff);

    // Verify filter was applied
    await waitFor(() => {
      expect(mockUseDonors.listDonors).toHaveBeenCalledWith(
        expect.objectContaining({
          assignedToStaffId: 1,
        })
      );
    });
  });

  it("handles researched donors filter", async () => {
    const user = userEvent.setup();
    render(<DonorListPage />);

    // Click the researched checkbox
    const researchedCheckbox = screen.getByRole("checkbox", { name: /only show researched donors/i });
    await user.click(researchedCheckbox);

    // Verify filter was applied
    await waitFor(() => {
      expect(mockUseDonors.listDonors).toHaveBeenCalledWith(
        expect.objectContaining({
          onlyResearched: true,
        })
      );
    });
  });

  it("handles sorting changes", async () => {
    const user = userEvent.setup();
    render(<DonorListPage />);

    // Wait for table to render
    await waitFor(() => {
      expect(screen.getByRole("table")).toBeInTheDocument();
    });

    // Click on email column header to sort
    const emailHeader = screen.getByRole("columnheader", { name: /email/i });
    await user.click(emailHeader);

    // Verify sorting was applied
    await waitFor(() => {
      expect(mockUseDonors.listDonors).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: "email",
          orderDirection: "asc",
        })
      );
    });
  });

  it("handles row selection", async () => {
    const user = userEvent.setup();
    render(<DonorListPage />);

    // Wait for table to render
    await waitFor(() => {
      expect(screen.getByRole("table")).toBeInTheDocument();
    });

    // Select first donor
    const firstCheckbox = screen.getAllByRole("checkbox")[1]; // First is the select all
    await user.click(firstCheckbox);

    // Verify bulk action buttons appear
    await waitFor(() => {
      expect(screen.getByText(/1 selected/i)).toBeInTheDocument();
    });
  });

  it("handles creating a list from selected donors", async () => {
    const user = userEvent.setup();
    mockUseLists.createList.mockResolvedValueOnce({ id: 3 });
    mockUseLists.addDonorsToList.mockResolvedValueOnce({});

    render(<DonorListPage />);

    // Wait for table and select donors
    await waitFor(() => {
      expect(screen.getByRole("table")).toBeInTheDocument();
    });

    const firstCheckbox = screen.getAllByRole("checkbox")[1];
    await user.click(firstCheckbox);

    // Click create list button
    const createListButton = screen.getByRole("button", { name: /create list/i });
    await user.click(createListButton);

    // Fill in list name in dialog
    const listNameInput = screen.getByPlaceholderText(/enter list name/i);
    await user.type(listNameInput, "New Test List");

    // Submit
    const createButton = screen.getByRole("button", { name: /create/i });
    await user.click(createButton);

    // Verify list creation
    await waitFor(() => {
      expect(mockUseLists.createList).toHaveBeenCalledWith({
        name: "New Test List",
      });
    });
  });

  it("handles pagination", async () => {
    const user = userEvent.setup();
    render(<DonorListPage />);

    // Wait for pagination controls
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
    });

    // Click next page
    const nextButton = screen.getByRole("button", { name: /next/i });
    await user.click(nextButton);

    // Verify pagination was applied
    await waitFor(() => {
      expect(mockUseDonors.listDonors).toHaveBeenCalledWith(
        expect.objectContaining({
          offset: expect.any(Number),
        })
      );
    });
  });

  it("displays loading state", () => {
    mockUseDonors.listDonors.mockReturnValueOnce({
      data: null,
      isLoading: true,
      error: null,
    });

    render(<DonorListPage />);

    expect(screen.getByTestId("loading-skeleton")).toBeInTheDocument();
  });

  it("displays error state", () => {
    mockUseDonors.listDonors.mockReturnValueOnce({
      data: null,
      isLoading: false,
      error: new Error("Failed to load donors"),
    });

    render(<DonorListPage />);

    expect(screen.getByText(/failed to load donors/i)).toBeInTheDocument();
  });
});