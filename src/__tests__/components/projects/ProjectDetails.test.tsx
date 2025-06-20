import React from "react";
import { render, screen, waitFor } from "@/__tests__/utils/test-utils";
import userEvent from "@testing-library/user-event";
import ProjectDetailsPage from "@/app/(app)/projects/[id]/page";
import { projectFactory } from "@/__tests__/mocks/data";

// Mock the hooks
jest.mock("@/app/hooks/use-projects");

// Mock useParams to return the project ID
jest.mock("next/navigation", () => {
  const actual = jest.requireActual("next/navigation");
  return {
    ...actual,
    useParams: () => ({ id: "123" }),
  };
});

// Get the mocked router from setup
const mockRouter = require("next/navigation").useRouter();

// Mock the components
jest.mock("@/app/(app)/projects/_components/project-form", () => ({
  ProjectForm: ({ initialData, onSubmit, onCancel }: any) => (
    <form data-testid="project-form" onSubmit={(e) => {
      e.preventDefault();
      onSubmit({
        name: "Updated Project",
        description: "Updated description",
        active: true,
      });
    }}>
      <input defaultValue={initialData?.name} />
      <button type="submit">Save</button>
      <button type="button" onClick={onCancel}>Cancel</button>
    </form>
  ),
}));

jest.mock("@/app/(app)/projects/_components/project-donations", () => ({
  ProjectDonations: ({ projectId }: { projectId: number }) => (
    <div data-testid="project-donations">
      <p>Donations for project {projectId}</p>
    </div>
  ),
}));

// Mock window.confirm
global.confirm = jest.fn();

describe("ProjectDetails", () => {
  const mockProject = projectFactory.create({
    id: 123,
    name: "Annual Fundraiser",
    description: "Our annual fundraising campaign",
    active: true,
  });

  const mockUseProjects = {
    getProjectById: jest.fn().mockReturnValue({
      data: mockProject,
      isLoading: false,
      error: null,
    }),
    updateProject: jest.fn(),
    deleteProject: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRouter.push.mockClear();
    (global.confirm as jest.Mock).mockReturnValue(true);
    require("@/app/hooks/use-projects").useProjects.mockReturnValue(mockUseProjects);
  });

  it("renders project details", async () => {
    render(<ProjectDetailsPage />);

    await waitFor(() => {
      expect(screen.getByText("Annual Fundraiser")).toBeInTheDocument();
    });

    // Should show edit and delete buttons
    expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });

  it("shows project information in view mode", async () => {
    render(<ProjectDetailsPage />);

    await waitFor(() => {
      // Check project details are displayed
      expect(screen.getByText("Annual Fundraiser")).toBeInTheDocument();
      expect(screen.getByText("Our annual fundraising campaign")).toBeInTheDocument();
      expect(screen.getByText(/active/i)).toBeInTheDocument();
    });
  });

  it("displays project donations component", async () => {
    render(<ProjectDetailsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("project-donations")).toBeInTheDocument();
      expect(screen.getByText("Donations for project 123")).toBeInTheDocument();
    });
  });

  it("switches to edit mode when edit button is clicked", async () => {
    const user = userEvent.setup();
    render(<ProjectDetailsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
    });

    const editButton = screen.getByRole("button", { name: /edit/i });
    await user.click(editButton);

    // Should show the project form
    expect(screen.getByTestId("project-form")).toBeInTheDocument();
  });

  it("handles project update", async () => {
    const user = userEvent.setup();
    mockUseProjects.updateProject.mockResolvedValueOnce({ id: 123 });

    render(<ProjectDetailsPage />);

    // Click edit
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
    });
    
    const editButton = screen.getByRole("button", { name: /edit/i });
    await user.click(editButton);

    // Submit form
    const saveButton = screen.getByRole("button", { name: /save/i });
    await user.click(saveButton);

    // Verify update was called
    await waitFor(() => {
      expect(mockUseProjects.updateProject).toHaveBeenCalledWith({
        id: 123,
        name: "Updated Project",
        description: "Updated description",
        active: true,
      });
    });
  });

  it("cancels edit mode", async () => {
    const user = userEvent.setup();
    render(<ProjectDetailsPage />);

    // Enter edit mode
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
    });
    
    const editButton = screen.getByRole("button", { name: /edit/i });
    await user.click(editButton);

    // Cancel edit
    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    await user.click(cancelButton);

    // Should return to view mode
    await waitFor(() => {
      expect(screen.queryByTestId("project-form")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
    });
  });

  it("handles project deletion with confirmation", async () => {
    const user = userEvent.setup();
    mockUseProjects.deleteProject.mockResolvedValueOnce(true);

    render(<ProjectDetailsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
    });

    const deleteButton = screen.getByRole("button", { name: /delete/i });
    await user.click(deleteButton);

    // Verify confirmation was shown
    expect(global.confirm).toHaveBeenCalledWith("Are you sure you want to delete this project?");

    // Verify delete was called
    await waitFor(() => {
      expect(mockUseProjects.deleteProject).toHaveBeenCalledWith(123);
      expect(mockRouter.push).toHaveBeenCalledWith("/projects");
    });
  });

  it("cancels deletion when user declines confirmation", async () => {
    const user = userEvent.setup();
    (global.confirm as jest.Mock).mockReturnValueOnce(false);

    render(<ProjectDetailsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
    });

    const deleteButton = screen.getByRole("button", { name: /delete/i });
    await user.click(deleteButton);

    // Delete should not be called
    expect(mockUseProjects.deleteProject).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("displays loading state", () => {
    mockUseProjects.getProjectById.mockReturnValueOnce({
      data: null,
      isLoading: true,
      error: null,
    });

    render(<ProjectDetailsPage />);

    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
  });

  it("displays not found state", async () => {
    mockUseProjects.getProjectById.mockReturnValueOnce({
      data: null,
      isLoading: false,
      error: null,
    });

    render(<ProjectDetailsPage />);

    await waitFor(() => {
      expect(screen.getByText("Project not found")).toBeInTheDocument();
      expect(screen.getByText(/doesn't exist or you don't have permission/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /back to projects/i })).toBeInTheDocument();
    });
  });

  it("navigates back to projects list from not found state", async () => {
    const user = userEvent.setup();
    mockUseProjects.getProjectById.mockReturnValueOnce({
      data: null,
      isLoading: false,
      error: null,
    });

    render(<ProjectDetailsPage />);

    const backButton = await screen.findByRole("button", { name: /back to projects/i });
    await user.click(backButton);

    expect(mockRouter.push).toHaveBeenCalledWith("/projects");
  });

  it("handles update error", async () => {
    const user = userEvent.setup();
    mockUseProjects.updateProject.mockResolvedValueOnce(null);

    render(<ProjectDetailsPage />);

    // Enter edit mode
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
    });
    
    const editButton = screen.getByRole("button", { name: /edit/i });
    await user.click(editButton);

    // Submit form
    const saveButton = screen.getByRole("button", { name: /save/i });
    await user.click(saveButton);

    // Should stay in edit mode on error
    await waitFor(() => {
      expect(screen.getByTestId("project-form")).toBeInTheDocument();
    });
  });

  it("handles delete error", async () => {
    const user = userEvent.setup();
    mockUseProjects.deleteProject.mockResolvedValueOnce(false);

    render(<ProjectDetailsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
    });

    const deleteButton = screen.getByRole("button", { name: /delete/i });
    await user.click(deleteButton);

    // Should not navigate on error
    await waitFor(() => {
      expect(mockRouter.push).not.toHaveBeenCalled();
    });
  });
});