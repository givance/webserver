import { templatesRouter } from "@/app/api/trpc/routers/templates";
import {
  createTestContext,
  createProtectedTestContext,
  expectTRPCError,
} from "@/__tests__/utils/trpc-router-test-utils";
import { db } from "@/app/lib/db";
import { logger } from "@/app/lib/logger";

// Mock dependencies
jest.mock("@/app/lib/db");
jest.mock("@/app/lib/logger");

describe("templatesRouter", () => {
  const mockDb = db as jest.Mocked<typeof db>;
  const mockLogger = logger as jest.Mocked<typeof logger>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock logger methods
    mockLogger.info = jest.fn();
    mockLogger.error = jest.fn();
  });

  const mockTemplate = {
    id: 1,
    organizationId: "org-1",
    name: "Test Template",
    description: "Test Description",
    prompt: "This is a test prompt for generating emails",
    isActive: true,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  };

  const mockDbMethods = () => {
    const mockSelect = jest.fn();
    const mockFrom = jest.fn();
    const mockWhere = jest.fn();
    const mockLimit = jest.fn();
    const mockOrderBy = jest.fn();
    const mockReturning = jest.fn();
    const mockSet = jest.fn();
    const mockValues = jest.fn();

    // Set up chaining
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit, orderBy: mockOrderBy });
    mockLimit.mockResolvedValue([mockTemplate]);
    mockOrderBy.mockResolvedValue([mockTemplate]);
    mockReturning.mockResolvedValue([mockTemplate]);
    mockValues.mockReturnValue({ returning: mockReturning });
    mockSet.mockReturnValue({ where: mockWhere });

    return {
      select: mockSelect,
      from: mockFrom,
      where: mockWhere,
      limit: mockLimit,
      orderBy: mockOrderBy,
      returning: mockReturning,
      set: mockSet,
      values: mockValues,
      // Chain methods
      insert: jest.fn().mockReturnValue({ values: mockValues }),
      update: jest.fn().mockReturnValue({ set: mockSet }),
      delete: jest.fn().mockReturnValue({ where: mockWhere }),
    };
  };

  describe("create", () => {
    const createInput = {
      name: "New Template",
      description: "New template description",
      prompt: "Generate an email for {{donorName}} about {{projectName}}",
      isActive: true,
    };

    it("should create a new template", async () => {
      const ctx = createProtectedTestContext();
      const caller = templatesRouter.createCaller(ctx);

      const dbMethods = mockDbMethods();
      mockDb.insert = dbMethods.insert;
      dbMethods.values.mockReturnValue({ returning: dbMethods.returning });

      const result = await caller.create(createInput);

      expect(result).toEqual(mockTemplate);
      expect(mockDb.insert).toHaveBeenCalledWith(expect.any(Object)); // templates table
      expect(dbMethods.values).toHaveBeenCalledWith({
        organizationId: "org-1",
        name: "New Template",
        description: "New template description",
        prompt: "Generate an email for {{donorName}} about {{projectName}}",
        isActive: true,
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Created template 1 for organization org-1")
      );
    });

    it("should use default isActive value", async () => {
      const ctx = createProtectedTestContext();
      const caller = templatesRouter.createCaller(ctx);

      const dbMethods = mockDbMethods();
      mockDb.insert = dbMethods.insert;
      dbMethods.values.mockReturnValue({ returning: dbMethods.returning });

      const inputWithoutActive = {
        name: "Template",
        prompt: "Test prompt",
      };

      await caller.create(inputWithoutActive);

      expect(dbMethods.values).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: true,
        })
      );
    });

    it("should throw UNAUTHORIZED if user is not authenticated", async () => {
      const ctx = createTestContext({ auth: { user: null } });
      const caller = templatesRouter.createCaller(ctx);

      await expectTRPCError(caller.create(createInput), "UNAUTHORIZED");
    });

    it("should validate required fields", async () => {
      const ctx = createProtectedTestContext();
      const caller = templatesRouter.createCaller(ctx);

      // Empty name
      await expect(
        caller.create({ ...createInput, name: "" })
      ).rejects.toThrow();

      // Empty prompt
      await expect(
        caller.create({ ...createInput, prompt: "" })
      ).rejects.toThrow();

      // Name too long
      await expect(
        caller.create({ ...createInput, name: "a".repeat(256) })
      ).rejects.toThrow();
    });

    it("should handle database errors", async () => {
      const ctx = createProtectedTestContext();
      const caller = templatesRouter.createCaller(ctx);

      mockDb.insert = jest.fn().mockImplementation(() => {
        throw new Error("Database connection failed");
      });

      await expectTRPCError(
        caller.create(createInput),
        "INTERNAL_SERVER_ERROR",
        "Unable to create the template"
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to create template")
      );
    });
  });

  describe("update", () => {
    const updateInput = {
      id: 1,
      name: "Updated Template",
      description: "Updated description",
      prompt: "Updated prompt content",
      isActive: false,
    };

    it("should update an existing template", async () => {
      const ctx = createProtectedTestContext();
      const caller = templatesRouter.createCaller(ctx);

      const dbMethods = mockDbMethods();
      mockDb.select = dbMethods.select;
      mockDb.update = dbMethods.update;

      // Mock select for authorization check
      dbMethods.limit.mockResolvedValueOnce([{
        id: 1,
        organizationId: "org-1",
      }]);

      // Mock update
      const mockWhereUpdate = jest.fn();
      mockWhereUpdate.mockReturnValue({
        returning: jest.fn().mockResolvedValue([{
          ...mockTemplate,
          ...updateInput,
          updatedAt: new Date("2024-01-15"),
        }])
      });
      dbMethods.set.mockReturnValue({ 
        where: mockWhereUpdate
      });

      const result = await caller.update(updateInput);

      expect(result.name).toBe("Updated Template");
      expect(result.isActive).toBe(false);
      expect(mockDb.update).toHaveBeenCalledWith(expect.any(Object)); // templates table
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Updated template 1 for organization org-1")
      );
    });

    it("should throw NOT_FOUND if template doesn't exist", async () => {
      const ctx = createProtectedTestContext();
      const caller = templatesRouter.createCaller(ctx);

      const dbMethods = mockDbMethods();
      mockDb.select = dbMethods.select;
      dbMethods.limit.mockResolvedValueOnce([]); // No template found

      await expectTRPCError(
        caller.update(updateInput),
        "NOT_FOUND",
        "The template you're trying to update doesn't exist"
      );
    });

    it("should throw FORBIDDEN if template belongs to different organization", async () => {
      const ctx = createProtectedTestContext();
      const caller = templatesRouter.createCaller(ctx);

      const dbMethods = mockDbMethods();
      mockDb.select = dbMethods.select;
      dbMethods.limit.mockResolvedValueOnce([{
        id: 1,
        organizationId: "org-2", // Different organization
      }]);

      await expectTRPCError(
        caller.update(updateInput),
        "FORBIDDEN",
        "You can only update templates from your own organization"
      );
    });

    it("should update timestamp", async () => {
      const ctx = createProtectedTestContext();
      const caller = templatesRouter.createCaller(ctx);

      const dbMethods = mockDbMethods();
      mockDb.select = dbMethods.select;
      mockDb.update = dbMethods.update;

      dbMethods.limit.mockResolvedValueOnce([{
        id: 1,
        organizationId: "org-1",
      }]);

      const mockSetFn = jest.fn().mockReturnValue({ 
        where: jest.fn().mockReturnValue({ 
          returning: jest.fn().mockResolvedValue([mockTemplate])
        })
      });
      dbMethods.update.mockReturnValue({ set: mockSetFn });

      await caller.update(updateInput);

      expect(mockSetFn).toHaveBeenCalledWith(
        expect.objectContaining({
          updatedAt: expect.any(Date),
        })
      );
    });
  });

  describe("delete", () => {
    it("should delete a template", async () => {
      const ctx = createProtectedTestContext();
      const caller = templatesRouter.createCaller(ctx);

      const dbMethods = mockDbMethods();
      mockDb.select = dbMethods.select;
      mockDb.delete = dbMethods.delete;

      // Mock select for authorization check
      dbMethods.limit.mockResolvedValueOnce([{
        id: 1,
        organizationId: "org-1",
      }]);

      // Mock delete - the where method needs to resolve properly
      mockDb.delete = jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined)
      });

      const result = await caller.delete({ id: 1 });

      expect(result).toEqual({ id: 1 });
      expect(mockDb.delete).toHaveBeenCalledWith(expect.any(Object)); // templates table
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Deleted template 1 for organization org-1")
      );
    });

    it("should throw NOT_FOUND if template doesn't exist", async () => {
      const ctx = createProtectedTestContext();
      const caller = templatesRouter.createCaller(ctx);

      const dbMethods = mockDbMethods();
      mockDb.select = dbMethods.select;
      dbMethods.limit.mockResolvedValueOnce([]); // No template found

      await expectTRPCError(
        caller.delete({ id: 999 }),
        "NOT_FOUND",
        "The template you're trying to update doesn't exist"
      );
    });

    it("should throw FORBIDDEN if template belongs to different organization", async () => {
      const ctx = createProtectedTestContext();
      const caller = templatesRouter.createCaller(ctx);

      const dbMethods = mockDbMethods();
      mockDb.select = dbMethods.select;
      dbMethods.limit.mockResolvedValueOnce([{
        id: 1,
        organizationId: "org-2", // Different organization
      }]);

      await expectTRPCError(
        caller.delete({ id: 1 }),
        "FORBIDDEN",
        "You can only delete templates from your own organization"
      );
    });
  });

  describe("get", () => {
    it("should fetch a template by ID", async () => {
      const ctx = createProtectedTestContext();
      const caller = templatesRouter.createCaller(ctx);

      const dbMethods = mockDbMethods();
      mockDb.select = dbMethods.select;
      dbMethods.limit.mockResolvedValueOnce([mockTemplate]);

      const result = await caller.get({ id: 1 });

      expect(result).toEqual(mockTemplate);
      expect(dbMethods.where).toHaveBeenCalled(); // Should filter by id and organizationId
    });

    it("should throw NOT_FOUND if template doesn't exist", async () => {
      const ctx = createProtectedTestContext();
      const caller = templatesRouter.createCaller(ctx);

      const dbMethods = mockDbMethods();
      mockDb.select = dbMethods.select;
      dbMethods.limit.mockResolvedValueOnce([]);

      await expectTRPCError(
        caller.get({ id: 999 }),
        "NOT_FOUND",
        "The template you're trying to update doesn't exist"
      );
    });

    it("should only return templates from user's organization", async () => {
      const ctx = createProtectedTestContext({
        user: { organizationId: "org-2" },
      });
      const caller = templatesRouter.createCaller(ctx);

      const dbMethods = mockDbMethods();
      mockDb.select = dbMethods.select;
      dbMethods.limit.mockResolvedValueOnce([]); // No template found for org-2

      await expectTRPCError(
        caller.get({ id: 1 }),
        "NOT_FOUND"
      );
    });
  });

  describe("list", () => {
    const mockTemplatesList = [
      mockTemplate,
      {
        ...mockTemplate,
        id: 2,
        name: "Another Template",
        isActive: false,
      },
      {
        ...mockTemplate,
        id: 3,
        name: "Third Template",
        isActive: true,
      },
    ];

    it("should list active templates by default", async () => {
      const ctx = createProtectedTestContext();
      const caller = templatesRouter.createCaller(ctx);

      const dbMethods = mockDbMethods();
      mockDb.select = dbMethods.select;
      
      const activeTemplates = mockTemplatesList.filter(t => t.isActive);
      // Fix the chaining for list operation
      dbMethods.where.mockReturnValue({ orderBy: dbMethods.orderBy });
      dbMethods.orderBy.mockResolvedValueOnce(activeTemplates);

      const result = await caller.list({});

      expect(result).toHaveLength(2);
      expect(result.every(t => t.isActive)).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Listed 2 templates for organization org-1")
      );
    });

    it("should include inactive templates when requested", async () => {
      const ctx = createProtectedTestContext();
      const caller = templatesRouter.createCaller(ctx);

      const dbMethods = mockDbMethods();
      mockDb.select = dbMethods.select;
      dbMethods.where.mockReturnValue({ orderBy: dbMethods.orderBy });
      dbMethods.orderBy.mockResolvedValueOnce(mockTemplatesList);

      const result = await caller.list({ includeInactive: true });

      expect(result).toHaveLength(3);
      expect(result.some(t => !t.isActive)).toBe(true);
    });

    it("should order by creation date descending", async () => {
      const ctx = createProtectedTestContext();
      const caller = templatesRouter.createCaller(ctx);

      const dbMethods = mockDbMethods();
      mockDb.select = dbMethods.select;
      
      const orderedTemplates = [...mockTemplatesList].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      );
      dbMethods.where.mockReturnValue({ orderBy: dbMethods.orderBy });
      dbMethods.orderBy.mockResolvedValueOnce(orderedTemplates);

      await caller.list({});

      expect(dbMethods.orderBy).toHaveBeenCalled();
    });

    it("should only return templates from user's organization", async () => {
      const org1Ctx = createProtectedTestContext({
        user: { organizationId: "org-1" },
      });
      const org2Ctx = createProtectedTestContext({
        user: { organizationId: "org-2" },
      });

      const org1Caller = templatesRouter.createCaller(org1Ctx);
      const org2Caller = templatesRouter.createCaller(org2Ctx);

      const dbMethods1 = mockDbMethods();
      const dbMethods2 = mockDbMethods();
      
      // Set up first org methods
      dbMethods1.select.mockReturnValue({ from: dbMethods1.from });
      dbMethods1.from.mockReturnValue({ where: dbMethods1.where });
      dbMethods1.where.mockReturnValue({ orderBy: dbMethods1.orderBy });
      dbMethods1.orderBy.mockResolvedValueOnce([mockTemplate]);

      // Set up second org methods
      dbMethods2.select.mockReturnValue({ from: dbMethods2.from });
      dbMethods2.from.mockReturnValue({ where: dbMethods2.where });
      dbMethods2.where.mockReturnValue({ orderBy: dbMethods2.orderBy });
      dbMethods2.orderBy.mockResolvedValueOnce([]);

      mockDb.select = jest.fn()
        .mockReturnValueOnce(dbMethods1.select())
        .mockReturnValueOnce(dbMethods2.select());

      const org1Result = await org1Caller.list({});
      const org2Result = await org2Caller.list({});

      expect(org1Result).toHaveLength(1);
      expect(org2Result).toHaveLength(0);
    });

    it("should handle database errors", async () => {
      const ctx = createProtectedTestContext();
      const caller = templatesRouter.createCaller(ctx);

      mockDb.select = jest.fn().mockImplementation(() => {
        throw new Error("Database query failed");
      });

      await expectTRPCError(
        caller.list({}),
        "INTERNAL_SERVER_ERROR",
        "Failed to list templates"
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to list templates")
      );
    });
  });

  describe("error handling", () => {
    it("should properly rethrow TRPCErrors", async () => {
      const ctx = createProtectedTestContext();
      const caller = templatesRouter.createCaller(ctx);

      const dbMethods = mockDbMethods();
      mockDb.select = dbMethods.select;
      
      // Simulate a TRPCError being thrown
      dbMethods.limit.mockImplementation(() => {
        throw new Error("Generic error");
      });

      await expectTRPCError(
        caller.get({ id: 1 }),
        "INTERNAL_SERVER_ERROR",
        "Unable to retrieve the template"
      );
    });
  });
});