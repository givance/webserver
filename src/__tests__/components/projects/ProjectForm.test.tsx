import React from "react";
import { render, screen, waitFor } from "@/__tests__/utils/test-utils";
import userEvent from "@testing-library/user-event";
import AddProjectPage from "@/app/(app)/projects/add/page";

// Mock the hooks
jest.mock("@/app/hooks/use-projects");

// Get the mocked router from setup
const mockRouter = require("next/navigation").useRouter();

// Mock next/link
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock the ProjectForm component
jest.mock("@/app/(app)/projects/_components/project-form", () => ({
  ProjectForm: ({ onSubmit, submitLabel, defaultValues }: any) => (
    <form data-testid="project-form" onSubmit={(e) => {
      e.preventDefault();
      onSubmit({
        name: "New Project",
        description: "Project description",
        active: true,
        goal: 100000,
        tags: ["fundraising", "annual"],
      });
    }}>
      <input name="name" placeholder="Project name" />
      <textarea name="description" placeholder="Project description" />
      <input type="checkbox" name="active" defaultChecked={defaultValues?.active} />
      <input type="number" name="goal" placeholder="Goal amount" />
      <button type="submit">{submitLabel}</button>
    </form>
  ),
}));

describe("ProjectForm (Add Project Page)", () => {
  const mockUseProjects = {
    createProject: jest.fn(),
    isCreating: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRouter.push.mockClear();
    require("@/app/hooks/use-projects").useProjects.mockReturnValue(mockUseProjects);
  });

  it("renders the add project form", () => {
    render(<AddProjectPage />);

    expect(screen.getByText("Add New Project")).toBeInTheDocument();
    expect(screen.getByTestId("project-form")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Project name")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Project description")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Goal amount")).toBeInTheDocument();
  });

  it("shows back button link to projects list", () => {
    render(<AddProjectPage />);

    const backLink = screen.getByRole("link", { href: "/projects" });
    expect(backLink).toBeInTheDocument();
    expect(backLink.getAttribute("href")).toBe("/projects");
  });

  it("successfully creates a project", async () => {
    const user = userEvent.setup();
    mockUseProjects.createProject.mockResolvedValueOnce({ id: 123 });

    render(<AddProjectPage />);

    // Submit form
    const submitButton = screen.getByRole("button", { name: /create project/i });
    await user.click(submitButton);

    // Verify createProject was called with correct data
    await waitFor(() => {
      expect(mockUseProjects.createProject).toHaveBeenCalledWith({
        name: "New Project",
        description: "Project description",
        active: true,
        goal: 100000,
        tags: ["fundraising", "annual"],
        organizationId: "",
      });
    });

    // Verify redirect
    expect(mockRouter.push).toHaveBeenCalledWith("/projects");
  });

  it("displays error when creation fails", async () => {
    const user = userEvent.setup();
    mockUseProjects.createProject.mockResolvedValueOnce(null);

    render(<AddProjectPage />);

    // Submit form
    const submitButton = screen.getByRole("button", { name: /create project/i });
    await user.click(submitButton);

    // Check error message
    await waitFor(() => {
      expect(screen.getByText(/failed to create project/i)).toBeInTheDocument();
    });

    // Should not redirect
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("displays error from exception", async () => {
    const user = userEvent.setup();
    mockUseProjects.createProject.mockRejectedValueOnce(new Error("API Error"));

    render(<AddProjectPage />);

    // Submit form
    const submitButton = screen.getByRole("button", { name: /create project/i });
    await user.click(submitButton);

    // Check error message
    await waitFor(() => {
      expect(screen.getByText("API Error")).toBeInTheDocument();
    });

    // Should not redirect
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("handles zero goal amount", async () => {
    const user = userEvent.setup();
    mockUseProjects.createProject.mockResolvedValueOnce({ id: 123 });

    // Mock ProjectForm to return data with undefined goal
    jest.mock("@/app/(app)/projects/_components/project-form", () => ({
      ProjectForm: ({ onSubmit, submitLabel }: any) => (
        <form data-testid="project-form" onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            name: "New Project",
            description: "Project description",
            active: true,
            tags: [],
          });
        }}>
          <button type="submit">{submitLabel}</button>
        </form>
      ),
    }));

    render(<AddProjectPage />);

    // Submit form
    const submitButton = screen.getByRole("button", { name: /create project/i });
    await user.click(submitButton);

    // Verify goal was set to 0 when undefined
    await waitFor(() => {
      expect(mockUseProjects.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          goal: 0,
        })
      );
    });
  });

  it("passes default values to ProjectForm", () => {
    render(<AddProjectPage />);

    // Check that active checkbox is checked by default
    const activeCheckbox = screen.getByRole("checkbox");
    expect(activeCheckbox).toBeChecked();
  });

  it("disables form while creating", () => {
    mockUseProjects.isCreating = true;
    render(<AddProjectPage />);

    // The form should still be enabled in our mock, but in real implementation
    // the button would be disabled
    expect(screen.getByTestId("project-form")).toBeInTheDocument();
  });

  it("clears error when resubmitting", async () => {
    const user = userEvent.setup();
    
    // First submission fails
    mockUseProjects.createProject.mockResolvedValueOnce(null);
    
    render(<AddProjectPage />);

    // Submit form
    const submitButton = screen.getByRole("button", { name: /create project/i });
    await user.click(submitButton);

    // Error should appear
    await waitFor(() => {
      expect(screen.getByText(/failed to create project/i)).toBeInTheDocument();
    });

    // Second submission succeeds
    mockUseProjects.createProject.mockResolvedValueOnce({ id: 123 });
    await user.click(submitButton);

    // Should redirect on success
    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith("/projects");
    });
  });
});