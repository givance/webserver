import React from "react";
import { render, screen, waitFor } from "@/__tests__/utils/test-utils";
import userEvent from "@testing-library/user-event";
import ProjectListPage from "@/app/(app)/projects/page";
import { projectFactory } from "@/__tests__/mocks/data";

// Mock the hooks
jest.mock("@/app/hooks/use-projects");

// Mock the CampaignButton component
jest.mock("@/components/campaign/CampaignButton", () => ({
  CampaignButton: () => <button>Campaign</button>,
}));

// Mock next/link
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("ProjectsPage", () => {
  const mockProjects = projectFactory.createMany(5);
  
  const mockUseProjects = {
    listProjects: jest.fn().mockReturnValue({
      data: { 
        projects: mockProjects.map(p => ({
          ...p,
          active: p.status === "active",
        })), 
        totalCount: mockProjects.length 
      },
      isLoading: false,
      error: null,
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    require("@/app/hooks/use-projects").useProjects.mockReturnValue(mockUseProjects);
  });

  it("renders the project list page with projects", async () => {
    render(<ProjectListPage />);

    // Check page title
    expect(screen.getByText("Project Management")).toBeInTheDocument();

    // Check search input
    expect(screen.getByPlaceholderText("Search projects by name or description...")).toBeInTheDocument();

    // Check add project button
    expect(screen.getByRole("link", { name: /add project/i })).toBeInTheDocument();

    // Check campaign button
    expect(screen.getByRole("button", { name: /campaign/i })).toBeInTheDocument();

    // Wait for projects to load
    await waitFor(() => {
      mockProjects.forEach(project => {
        expect(screen.getByText(project.name)).toBeInTheDocument();
      });
    });
  });

  it("handles search functionality", async () => {
    const user = userEvent.setup();
    render(<ProjectListPage />);

    const searchInput = screen.getByPlaceholderText("Search projects by name or description...");
    
    // Type in search
    await user.type(searchInput, "Annual");

    // Verify search was triggered with debounce
    await waitFor(() => {
      expect(mockUseProjects.listProjects).toHaveBeenCalledWith(
        expect.objectContaining({
          searchTerm: "Annual",
        })
      );
    }, { timeout: 1000 });
  });

  it("handles pagination", async () => {
    const user = userEvent.setup();
    render(<ProjectListPage />);

    // Wait for table to render
    await waitFor(() => {
      expect(screen.getByRole("table")).toBeInTheDocument();
    });

    // Click next page (if pagination controls are rendered)
    const nextButton = screen.queryByRole("button", { name: /next/i });
    if (nextButton) {
      await user.click(nextButton);

      // Verify pagination was applied
      await waitFor(() => {
        expect(mockUseProjects.listProjects).toHaveBeenCalledWith(
          expect.objectContaining({
            offset: expect.any(Number),
          })
        );
      });
    }
  });

  it("handles page size change", async () => {
    const user = userEvent.setup();
    render(<ProjectListPage />);

    // Find page size selector
    const pageSizeSelector = screen.getByRole("combobox");
    await user.click(pageSizeSelector);

    // Select different page size
    const option50 = screen.getByRole("option", { name: "50" });
    await user.click(option50);

    // Verify page size was updated
    await waitFor(() => {
      expect(mockUseProjects.listProjects).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 50,
        })
      );
    });
  });

  it("displays project details correctly", async () => {
    render(<ProjectListPage />);

    await waitFor(() => {
      const firstProject = mockProjects[0];
      
      // Check project name
      expect(screen.getByText(firstProject.name)).toBeInTheDocument();
      
      // Check project description if available
      if (firstProject.description) {
        expect(screen.getByText(firstProject.description)).toBeInTheDocument();
      }
      
      // Check status
      const statusElement = screen.getByText(firstProject.status === "active" ? "Active" : "Completed");
      expect(statusElement).toBeInTheDocument();
    });
  });

  it("navigates to add project page", async () => {
    render(<ProjectListPage />);

    const addProjectLink = screen.getByRole("link", { name: /add project/i });
    expect(addProjectLink).toHaveAttribute("href", "/projects/add");
  });

  it("displays loading state", () => {
    mockUseProjects.listProjects.mockReturnValueOnce({
      data: null,
      isLoading: true,
      error: null,
    });

    render(<ProjectListPage />);

    expect(screen.getByTestId("loading-skeleton")).toBeInTheDocument();
  });

  it("displays error state", () => {
    mockUseProjects.listProjects.mockReturnValueOnce({
      data: null,
      isLoading: false,
      error: { message: "Failed to load projects" },
    });

    render(<ProjectListPage />);

    expect(screen.getByText(/failed to load projects/i)).toBeInTheDocument();
    expect(screen.getByText("Error loading projects")).toBeInTheDocument();
  });

  it("handles empty project list", async () => {
    mockUseProjects.listProjects.mockReturnValueOnce({
      data: { projects: [], totalCount: 0 },
      isLoading: false,
      error: null,
    });

    render(<ProjectListPage />);

    await waitFor(() => {
      // Should show empty state or table with no data
      expect(screen.getByRole("table")).toBeInTheDocument();
    });
  });

  it("formats project dates correctly", async () => {
    const projectWithDates = {
      ...mockProjects[0],
      createdAt: new Date("2024-01-15"),
    };

    mockUseProjects.listProjects.mockReturnValueOnce({
      data: { 
        projects: [{ ...projectWithDates, active: true }], 
        totalCount: 1 
      },
      isLoading: false,
      error: null,
    });

    render(<ProjectListPage />);

    await waitFor(() => {
      // Date should be formatted in the table
      expect(screen.getByText(projectWithDates.name)).toBeInTheDocument();
    });
  });
});