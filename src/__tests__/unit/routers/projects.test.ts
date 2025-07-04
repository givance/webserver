import { projectsRouter } from "@/app/api/trpc/routers/projects";
import {
  createTestContext,
  createProtectedTestContext,
  expectTRPCError,
} from "@/__tests__/utils/trpc-router-test-utils";
import * as projectsData from "@/app/lib/data/projects";

// Mock the data layer
jest.mock("@/app/lib/data/projects");

describe("projectsRouter", () => {
  const mockProjectsData = projectsData as jest.Mocked<typeof projectsData>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockProject = {
    id: 1,
    organizationId: "org-1",
    name: "Test Project",
    description: "Test Description",
    notes: "Test Notes",
    active: true,
    goal: 100000,
    tags: ["fundraising", "annual"],
    external: false,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  };

  describe("getById", () => {
    it("should fetch a project by ID", async () => {
      const ctx = createProtectedTestContext();
      const caller = projectsRouter.createCaller(ctx);

      mockProjectsData.getProjectById.mockResolvedValue(mockProject);

      const result = await caller.getById({ id: 1 });

      expect(result).toEqual(mockProject);
      expect(mockProjectsData.getProjectById).toHaveBeenCalledWith(1);
    });

    it("should throw NOT_FOUND if project doesn't exist", async () => {
      const ctx = createProtectedTestContext();
      const caller = projectsRouter.createCaller(ctx);

      mockProjectsData.getProjectById.mockResolvedValue(null);

      await expectTRPCError(
        caller.getById({ id: 999 }),
        "NOT_FOUND",
        "Project not found"
      );
    });

    it("should throw UNAUTHORIZED if user is not authenticated", async () => {
      const ctx = createTestContext({ auth: { user: null } });
      const caller = projectsRouter.createCaller(ctx);

      await expectTRPCError(caller.getById({ id: 1 }), "UNAUTHORIZED");
    });
  });

  describe("create", () => {
    const createInput = {
      name: "New Project",
      description: "New project description",
      goal: 50000,
      tags: ["campaign", "2024"],
      active: true,
    };

    it("should create a new project", async () => {
      const ctx = createProtectedTestContext();
      const caller = projectsRouter.createCaller(ctx);

      const expectedProject = {
        ...mockProject,
        ...createInput,
        id: 2,
        organizationId: "org-1",
      };

      mockProjectsData.createProject.mockResolvedValue(expectedProject);

      const result = await caller.create(createInput);

      expect(result).toEqual(expectedProject);
      expect(mockProjectsData.createProject).toHaveBeenCalledWith({
        ...createInput,
        organizationId: "org-1",
        external: false,
      });
    });

    it("should throw CONFLICT if project name already exists", async () => {
      const ctx = createProtectedTestContext();
      const caller = projectsRouter.createCaller(ctx);

      mockProjectsData.createProject.mockRejectedValue(
        new Error("Project name already exists")
      );

      await expectTRPCError(
        caller.create(createInput),
        "CONFLICT",
        'A project with the name "New Project" already exists'
      );
    });

    it("should throw UNAUTHORIZED if user has no organization", async () => {
      const ctx = createProtectedTestContext({
        user: { organizationId: null },
      });
      const caller = projectsRouter.createCaller(ctx);

      await expectTRPCError(caller.create(createInput), "UNAUTHORIZED");
    });

    it("should handle optional fields", async () => {
      const ctx = createProtectedTestContext();
      const caller = projectsRouter.createCaller(ctx);

      const minimalInput = {
        name: "Minimal Project",
      };

      const expectedProject = {
        ...mockProject,
        name: "Minimal Project",
        description: null,
        goal: null,
        tags: null,
      };

      mockProjectsData.createProject.mockResolvedValue(expectedProject);

      const result = await caller.create(minimalInput);

      expect(result.name).toBe("Minimal Project");
      expect(mockProjectsData.createProject).toHaveBeenCalledWith({
        name: "Minimal Project",
        organizationId: "org-1",
        external: false,
      });
    });

    it("should validate input fields", async () => {
      const ctx = createProtectedTestContext();
      const caller = projectsRouter.createCaller(ctx);

      // Empty name
      await expect(caller.create({ name: "" })).rejects.toThrow();

      // Name too long
      await expect(
        caller.create({ name: "a".repeat(256) })
      ).rejects.toThrow();

      // Invalid goal (negative)
      await expect(
        caller.create({ name: "Project", goal: -1000 })
      ).rejects.toThrow();
    });
  });

  describe("update", () => {
    const updateInput = {
      id: 1,
      name: "Updated Project",
      description: "Updated description",
      active: false,
    };

    it("should update an existing project", async () => {
      const ctx = createProtectedTestContext();
      const caller = projectsRouter.createCaller(ctx);

      const updatedProject = {
        ...mockProject,
        ...updateInput,
        updatedAt: new Date("2024-01-15"),
      };

      mockProjectsData.updateProject.mockResolvedValue(updatedProject);

      const result = await caller.update(updateInput);

      expect(result).toEqual(updatedProject);
      expect(mockProjectsData.updateProject).toHaveBeenCalledWith(1, {
        name: "Updated Project",
        description: "Updated description",
        active: false,
      });
    });

    it("should throw NOT_FOUND if project doesn't exist", async () => {
      const ctx = createProtectedTestContext();
      const caller = projectsRouter.createCaller(ctx);

      mockProjectsData.updateProject.mockResolvedValue(null);

      await expectTRPCError(
        caller.update(updateInput),
        "NOT_FOUND",
        "Project not found"
      );
    });

    it("should allow partial updates", async () => {
      const ctx = createProtectedTestContext();
      const caller = projectsRouter.createCaller(ctx);

      const partialUpdate = {
        id: 1,
        active: false,
      };

      mockProjectsData.updateProject.mockResolvedValue({
        ...mockProject,
        active: false,
      });

      const result = await caller.update(partialUpdate);

      expect(result.active).toBe(false);
      expect(mockProjectsData.updateProject).toHaveBeenCalledWith(1, {
        active: false,
      });
    });

    it("should handle null values", async () => {
      const ctx = createProtectedTestContext();
      const caller = projectsRouter.createCaller(ctx);

      const updateWithNull = {
        id: 1,
        goal: null,
      };

      mockProjectsData.updateProject.mockResolvedValue({
        ...mockProject,
        goal: null,
      });

      const result = await caller.update(updateWithNull);

      expect(result.goal).toBeNull();
    });
  });

  describe("delete", () => {
    it("should delete a project", async () => {
      const ctx = createProtectedTestContext();
      const caller = projectsRouter.createCaller(ctx);

      mockProjectsData.deleteProject.mockResolvedValue(undefined);

      await expect(caller.delete({ id: 1 })).resolves.toBeUndefined();

      expect(mockProjectsData.deleteProject).toHaveBeenCalledWith(1);
    });

    it("should throw CONFLICT if project has associated records", async () => {
      const ctx = createProtectedTestContext();
      const caller = projectsRouter.createCaller(ctx);

      mockProjectsData.deleteProject.mockRejectedValue(
        new Error("Project is linked to other records")
      );

      await expectTRPCError(
        caller.delete({ id: 1 }),
        "CONFLICT",
        "This project cannot be deleted because it has associated donations"
      );
    });

    it("should handle general deletion errors", async () => {
      const ctx = createProtectedTestContext();
      const caller = projectsRouter.createCaller(ctx);

      mockProjectsData.deleteProject.mockRejectedValue(
        new Error("Database error")
      );

      await expectTRPCError(
        caller.delete({ id: 1 }),
        "INTERNAL_SERVER_ERROR"
      );
    });
  });

  describe("list", () => {
    const mockProjectsList = {
      projects: [
        mockProject,
        {
          ...mockProject,
          id: 2,
          name: "Another Project",
          active: false,
        },
      ],
      totalCount: 2,
    };

    it("should list projects with default parameters", async () => {
      const ctx = createProtectedTestContext();
      const caller = projectsRouter.createCaller(ctx);

      mockProjectsData.listProjects.mockResolvedValue(mockProjectsList);

      const result = await caller.list({});

      expect(result).toEqual(mockProjectsList);
      expect(mockProjectsData.listProjects).toHaveBeenCalledWith(
        {},
        "org-1"
      );
    });

    it("should filter by active status", async () => {
      const ctx = createProtectedTestContext();
      const caller = projectsRouter.createCaller(ctx);

      const activeOnlyList = {
        projects: [mockProject],
        totalCount: 1,
      };

      mockProjectsData.listProjects.mockResolvedValue(activeOnlyList);

      const result = await caller.list({ active: true });

      expect(result.projects).toHaveLength(1);
      expect(result.projects[0].active).toBe(true);
      expect(mockProjectsData.listProjects).toHaveBeenCalledWith(
        { active: true },
        "org-1"
      );
    });

    it("should support search term", async () => {
      const ctx = createProtectedTestContext();
      const caller = projectsRouter.createCaller(ctx);

      mockProjectsData.listProjects.mockResolvedValue({
        projects: [mockProject],
        totalCount: 1,
      });

      const result = await caller.list({ searchTerm: "Test" });

      expect(result.projects[0].name).toContain("Test");
      expect(mockProjectsData.listProjects).toHaveBeenCalledWith(
        { searchTerm: "Test" },
        "org-1"
      );
    });

    it("should support pagination", async () => {
      const ctx = createProtectedTestContext();
      const caller = projectsRouter.createCaller(ctx);

      mockProjectsData.listProjects.mockResolvedValue({
        projects: [mockProject],
        totalCount: 10,
      });

      const result = await caller.list({
        limit: 5,
        offset: 5,
      });

      expect(mockProjectsData.listProjects).toHaveBeenCalledWith(
        { limit: 5, offset: 5 },
        "org-1"
      );
    });

    it("should support ordering", async () => {
      const ctx = createProtectedTestContext();
      const caller = projectsRouter.createCaller(ctx);

      mockProjectsData.listProjects.mockResolvedValue(mockProjectsList);

      await caller.list({
        orderBy: "name",
        orderDirection: "desc",
      });

      expect(mockProjectsData.listProjects).toHaveBeenCalledWith(
        { orderBy: "name", orderDirection: "desc" },
        "org-1"
      );
    });

    it("should throw UNAUTHORIZED if user has no organization", async () => {
      const ctx = createProtectedTestContext({
        user: { organizationId: null },
      });
      const caller = projectsRouter.createCaller(ctx);

      await expectTRPCError(caller.list({}), "UNAUTHORIZED");
    });

    it("should handle complex filters", async () => {
      const ctx = createProtectedTestContext();
      const caller = projectsRouter.createCaller(ctx);

      mockProjectsData.listProjects.mockResolvedValue({
        projects: [],
        totalCount: 0,
      });

      const complexInput = {
        active: true,
        searchTerm: "Annual",
        limit: 10,
        offset: 0,
        orderBy: "createdAt" as const,
        orderDirection: "desc" as const,
      };

      await caller.list(complexInput);

      expect(mockProjectsData.listProjects).toHaveBeenCalledWith(
        complexInput,
        "org-1"
      );
    });
  });

  describe("organization isolation", () => {
    it("should only access projects from user's organization", async () => {
      const org1Ctx = createProtectedTestContext({
        user: { organizationId: "org-1" },
      });
      const org2Ctx = createProtectedTestContext({
        user: { organizationId: "org-2" },
      });

      const org1Caller = projectsRouter.createCaller(org1Ctx);
      const org2Caller = projectsRouter.createCaller(org2Ctx);

      // Set up different responses for different organizations
      mockProjectsData.listProjects
        .mockResolvedValueOnce({
          projects: [{ ...mockProject, organizationId: "org-1" }],
          totalCount: 1,
        })
        .mockResolvedValueOnce({
          projects: [{ ...mockProject, id: 99, organizationId: "org-2" }],
          totalCount: 1,
        });

      const org1Result = await org1Caller.list({});
      const org2Result = await org2Caller.list({});

      expect(org1Result.projects[0].organizationId).toBe("org-1");
      expect(org2Result.projects[0].organizationId).toBe("org-2");
      expect(org1Result.projects[0].id).not.toBe(org2Result.projects[0].id);
    });
  });
});