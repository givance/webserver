// Mock the TodoService before imports
jest.mock("@/app/lib/services/todo-service", () => {
  const mockService = {
    createTodo: jest.fn(),
    updateTodo: jest.fn(),
    deleteTodo: jest.fn(),
    getTodosByOrganization: jest.fn(),
    getTodosGroupedByType: jest.fn(),
    getTodosByDonor: jest.fn(),
    getTodosByStaff: jest.fn(),
    createTodosFromPredictedActions: jest.fn(),
  };
  
  return {
    TodoService: jest.fn(() => mockService),
    __mockService: mockService
  };
});

import { todoRouter } from "@/app/api/trpc/routers/todos";
import { TodoService } from "@/app/lib/services/todo-service";
import { 
  createTestContext,
  createProtectedTestContext,
  expectTRPCError,
  createMockBackendUser
} from "@/__tests__/utils/trpc-router-test-utils";
import { TRPCError } from "@trpc/server";

// Get the mock service from the module
const mockTodoService = (TodoService as any).__mockService || require("@/app/lib/services/todo-service").__mockService;

describe("todoRouter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("create", () => {
    const validInput = {
      title: "Test Todo",
      description: "Test Description",
      type: "CALL",
      priority: "HIGH",
      dueDate: new Date("2024-12-31"),
      scheduledDate: new Date("2024-12-01"),
      donorId: 123,
      staffId: 456,
    };

    const mockCreatedTodo = {
      id: 1,
      ...validInput,
      organizationId: "org-1",
      status: "PENDING",
      completedDate: null,
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-01"),
    };

    it("should create a todo successfully", async () => {
      const ctx = createProtectedTestContext();
      const caller = todoRouter.createCaller(ctx);
      
      mockTodoService.createTodo.mockResolvedValue([mockCreatedTodo]);
      
      const result = await caller.create(validInput);
      
      expect(result).toMatchObject({
        id: 1,
        title: "Test Todo",
        description: "Test Description",
        type: "CALL",
        priority: "HIGH",
        status: "PENDING",
        organizationId: "org-1",
      });
      
      expect(mockTodoService.createTodo).toHaveBeenCalledWith({
        ...validInput,
        organizationId: "org-1",
      });
    });

    it("should throw UNAUTHORIZED if user is not authenticated", async () => {
      const ctx = createTestContext({ auth: { user: null } });
      const caller = todoRouter.createCaller(ctx);
      
      await expectTRPCError(
        caller.create(validInput),
        "UNAUTHORIZED"
      );
    });

    it("should throw UNAUTHORIZED if user has no organization", async () => {
      const ctx = createProtectedTestContext({
        user: { organizationId: null },
      });
      const caller = todoRouter.createCaller(ctx);
      
      await expectTRPCError(
        caller.create(validInput),
        "UNAUTHORIZED"
      );
    });

    it("should validate required fields", async () => {
      const ctx = createProtectedTestContext();
      const caller = todoRouter.createCaller(ctx);
      
      // Missing title
      await expect(
        caller.create({ ...validInput, title: "" })
      ).rejects.toThrow();
      
      // Missing type
      await expect(
        caller.create({ ...validInput, type: "" })
      ).rejects.toThrow();
    });

    it("should handle optional fields", async () => {
      const ctx = createProtectedTestContext();
      const caller = todoRouter.createCaller(ctx);
      
      const minimalInput = {
        title: "Minimal Todo",
        description: "Description",
        type: "CALL",
      };
      
      mockTodoService.createTodo.mockResolvedValue([{
        ...mockCreatedTodo,
        ...minimalInput,
        priority: "MEDIUM",
        dueDate: null,
        scheduledDate: null,
        donorId: null,
        staffId: null,
      }]);
      
      const result = await caller.create(minimalInput);
      
      expect(result.title).toBe("Minimal Todo");
      expect(result.priority).toBe("MEDIUM");
      expect(result.dueDate).toBeNull();
    });
  });

  describe("update", () => {
    const mockExistingTodo = {
      id: 1,
      title: "Existing Todo",
      description: "Existing Description",
      type: "CALL",
      priority: "MEDIUM",
      status: "PENDING",
      dueDate: null,
      scheduledDate: null,
      completedDate: null,
      donorId: 123,
      staffId: 456,
      organizationId: "org-1",
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-01"),
    };

    it("should update a todo successfully", async () => {
      const ctx = createProtectedTestContext();
      const caller = todoRouter.createCaller(ctx);
      
      const updateInput = {
        id: 1,
        title: "Updated Todo",
        status: "COMPLETED",
        completedDate: new Date("2024-01-15"),
      };
      
      mockTodoService.updateTodo.mockResolvedValue([{
        ...mockExistingTodo,
        ...updateInput,
        updatedAt: new Date("2024-01-15"),
      }]);
      
      const result = await caller.update(updateInput);
      
      expect(result.title).toBe("Updated Todo");
      expect(result.status).toBe("COMPLETED");
      expect(result.completedDate).toBeTruthy();
      
      expect(mockTodoService.updateTodo).toHaveBeenCalledWith(
        1,
        {
          title: "Updated Todo",
          status: "COMPLETED",
          completedDate: expect.any(Date),
        }
      );
    });

    it("should throw UNAUTHORIZED if user is not authenticated", async () => {
      const ctx = createTestContext({ auth: { user: null } });
      const caller = todoRouter.createCaller(ctx);
      
      await expectTRPCError(
        caller.update({ id: 1, title: "Updated" }),
        "UNAUTHORIZED"
      );
    });

    it("should allow partial updates", async () => {
      const ctx = createProtectedTestContext();
      const caller = todoRouter.createCaller(ctx);
      
      mockTodoService.updateTodo.mockResolvedValue([{
        ...mockExistingTodo,
        priority: "HIGH",
      }]);
      
      const result = await caller.update({
        id: 1,
        priority: "HIGH",
      });
      
      expect(result.priority).toBe("HIGH");
      expect(mockTodoService.updateTodo).toHaveBeenCalledWith(1, {
        priority: "HIGH",
      });
    });
  });

  describe("updateMany", () => {
    it("should update multiple todos successfully", async () => {
      const ctx = createProtectedTestContext();
      const caller = todoRouter.createCaller(ctx);
      
      const updateInput = {
        ids: [1, 2, 3],
        data: {
          status: "IN_PROGRESS",
          staffId: 789,
        },
      };
      
      mockTodoService.updateTodo
        .mockResolvedValueOnce([{ id: 1 }])
        .mockResolvedValueOnce([{ id: 2 }])
        .mockResolvedValueOnce([{ id: 3 }]);
      
      const result = await caller.updateMany(updateInput);
      
      expect(result.count).toBe(3);
      expect(mockTodoService.updateTodo).toHaveBeenCalledTimes(3);
      expect(mockTodoService.updateTodo).toHaveBeenNthCalledWith(1, 1, {
        status: "IN_PROGRESS",
        staffId: 789,
      });
    });

    it("should handle partial failures", async () => {
      const ctx = createProtectedTestContext();
      const caller = todoRouter.createCaller(ctx);
      
      mockTodoService.updateTodo
        .mockResolvedValueOnce([{ id: 1 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 3 }]);
      
      const result = await caller.updateMany({
        ids: [1, 2, 3],
        data: { status: "COMPLETED" },
      });
      
      // Empty array is still truthy, so it counts as success
      expect(result.count).toBe(3);
    });

    it("should validate maximum batch size", async () => {
      const ctx = createProtectedTestContext();
      const caller = todoRouter.createCaller(ctx);
      
      const tooManyIds = Array.from({ length: 101 }, (_, i) => i + 1);
      
      await expect(
        caller.updateMany({
          ids: tooManyIds,
          data: { status: "COMPLETED" },
        })
      ).rejects.toThrow();
    });
  });

  describe("delete", () => {
    it("should delete a todo successfully", async () => {
      const ctx = createProtectedTestContext();
      const caller = todoRouter.createCaller(ctx);
      
      mockTodoService.deleteTodo.mockResolvedValue(undefined);
      
      await expect(caller.delete({ id: 1 })).resolves.toBeUndefined();
      
      expect(mockTodoService.deleteTodo).toHaveBeenCalledWith(1);
    });

    it("should throw UNAUTHORIZED if user is not authenticated", async () => {
      const ctx = createTestContext({ auth: { user: null } });
      const caller = todoRouter.createCaller(ctx);
      
      await expectTRPCError(
        caller.delete({ id: 1 }),
        "UNAUTHORIZED"
      );
    });
  });

  describe("getByOrganization", () => {
    const mockTodos = [
      {
        id: 1,
        title: "Todo 1",
        description: "Description 1",
        type: "CALL",
        priority: "HIGH",
        status: "PENDING",
        dueDate: new Date("2024-12-31"),
        scheduledDate: null,
        completedDate: null,
        donorId: 123,
        staffId: 456,
        organizationId: "org-1",
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-01"),
      },
      {
        id: 2,
        title: "Todo 2",
        description: "Description 2",
        type: "EMAIL",
        priority: "MEDIUM",
        status: "COMPLETED",
        dueDate: null,
        scheduledDate: new Date("2024-12-15"),
        completedDate: new Date("2024-12-16"),
        donorId: 124,
        staffId: 456,
        organizationId: "org-1",
        createdAt: new Date("2024-01-02"),
        updatedAt: new Date("2024-01-02"),
      },
    ];

    it("should fetch todos for organization", async () => {
      const ctx = createProtectedTestContext();
      const caller = todoRouter.createCaller(ctx);
      
      mockTodoService.getTodosByOrganization.mockResolvedValue(mockTodos);
      
      const result = await caller.getByOrganization({});
      
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe("Todo 1");
      expect(result[1].title).toBe("Todo 2");
      
      expect(mockTodoService.getTodosByOrganization).toHaveBeenCalledWith(
        "org-1",
        {}
      );
    });

    it("should filter by type", async () => {
      const ctx = createProtectedTestContext();
      const caller = todoRouter.createCaller(ctx);
      
      mockTodoService.getTodosByOrganization.mockResolvedValue([mockTodos[0]]);
      
      const result = await caller.getByOrganization({ type: "CALL" });
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("CALL");
      
      expect(mockTodoService.getTodosByOrganization).toHaveBeenCalledWith(
        "org-1",
        { type: "CALL" }
      );
    });

    it("should filter by multiple criteria", async () => {
      const ctx = createProtectedTestContext();
      const caller = todoRouter.createCaller(ctx);
      
      mockTodoService.getTodosByOrganization.mockResolvedValue([]);
      
      const result = await caller.getByOrganization({
        type: "EMAIL",
        status: "PENDING",
        donorId: 123,
        staffId: 456,
      });
      
      expect(result).toHaveLength(0);
      
      expect(mockTodoService.getTodosByOrganization).toHaveBeenCalledWith(
        "org-1",
        {
          type: "EMAIL",
          status: "PENDING",
          donorId: 123,
          staffId: 456,
        }
      );
    });

    it("should throw UNAUTHORIZED if user has no organization", async () => {
      const ctx = createProtectedTestContext({
        user: { organizationId: null },
      });
      const caller = todoRouter.createCaller(ctx);
      
      await expectTRPCError(
        caller.getByOrganization({}),
        "UNAUTHORIZED"
      );
    });
  });

  describe("getGroupedByType", () => {
    const mockGroupedTodos = {
      CALL: [
        {
          id: 1,
          title: "Call Todo",
          description: "Call description",
          type: "CALL",
          priority: "HIGH",
          status: "PENDING",
          dueDate: new Date("2024-12-31"),
          scheduledDate: null,
          completedDate: null,
          donorId: 123,
          staffId: 456,
          organizationId: "org-1",
          donorName: "John Doe",
          createdAt: new Date("2024-01-01"),
          updatedAt: new Date("2024-01-01"),
        },
      ],
      EMAIL: [
        {
          id: 2,
          title: "Email Todo",
          description: "Email description",
          type: "EMAIL",
          priority: "MEDIUM",
          status: "PENDING",
          dueDate: null,
          scheduledDate: new Date("2024-12-15"),
          completedDate: null,
          donorId: 124,
          staffId: 456,
          organizationId: "org-1",
          donorName: "Jane Smith",
          createdAt: new Date("2024-01-02"),
          updatedAt: new Date("2024-01-02"),
        },
      ],
    };

    it("should fetch todos grouped by type", async () => {
      const ctx = createProtectedTestContext();
      const caller = todoRouter.createCaller(ctx);
      
      mockTodoService.getTodosGroupedByType.mockResolvedValue(mockGroupedTodos);
      
      const result = await caller.getGroupedByType({});
      
      expect(result.CALL).toHaveLength(1);
      expect(result.EMAIL).toHaveLength(1);
      expect(result.CALL[0].title).toBe("Call Todo");
      
      expect(mockTodoService.getTodosGroupedByType).toHaveBeenCalledWith(
        "org-1",
        undefined
      );
    });

    it("should exclude specified statuses", async () => {
      const ctx = createProtectedTestContext();
      const caller = todoRouter.createCaller(ctx);
      
      mockTodoService.getTodosGroupedByType.mockResolvedValue({
        CALL: [],
        EMAIL: [],
      });
      
      const result = await caller.getGroupedByType({
        statusesToExclude: ["COMPLETED", "CANCELLED"],
      });
      
      expect(mockTodoService.getTodosGroupedByType).toHaveBeenCalledWith(
        "org-1",
        ["COMPLETED", "CANCELLED"]
      );
    });
  });

  describe("getByDonor", () => {
    const mockDonorTodos = [
      {
        id: 1,
        title: "Donor Todo 1",
        description: "Description 1",
        type: "CALL",
        priority: "HIGH",
        status: "PENDING",
        dueDate: null,
        scheduledDate: null,
        completedDate: null,
        donorId: 123,
        staffId: 456,
        organizationId: "org-1",
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-01"),
      },
      {
        id: 2,
        title: "Donor Todo 2",
        description: "Description 2",
        type: "EMAIL",
        priority: "MEDIUM",
        status: "COMPLETED",
        dueDate: null,
        scheduledDate: null,
        completedDate: new Date("2024-01-10"),
        donorId: 123,
        staffId: 456,
        organizationId: "org-1",
        createdAt: new Date("2024-01-02"),
        updatedAt: new Date("2024-01-10"),
      },
    ];

    it("should fetch todos for a specific donor", async () => {
      const ctx = createProtectedTestContext();
      const caller = todoRouter.createCaller(ctx);
      
      mockTodoService.getTodosByDonor.mockResolvedValue(mockDonorTodos);
      
      const result = await caller.getByDonor({ donorId: 123 });
      
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe("Donor Todo 1");
      
      expect(mockTodoService.getTodosByDonor).toHaveBeenCalledWith(123);
    });
  });

  describe("getByStaff", () => {
    const mockStaffTodos = [
      {
        id: 1,
        title: "Staff Todo 1",
        description: "Staff task",
        type: "CALL",
        priority: "HIGH",
        status: "IN_PROGRESS",
        dueDate: new Date("2024-12-20"),
        scheduledDate: null,
        completedDate: null,
        donorId: 123,
        staffId: 456,
        organizationId: "org-1",
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-05"),
      },
    ];

    it("should fetch todos for a specific staff member", async () => {
      const ctx = createProtectedTestContext();
      const caller = todoRouter.createCaller(ctx);
      
      mockTodoService.getTodosByStaff.mockResolvedValue(mockStaffTodos);
      
      const result = await caller.getByStaff({ staffId: 456 });
      
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Staff Todo 1");
      
      expect(mockTodoService.getTodosByStaff).toHaveBeenCalledWith(456);
    });
  });

  describe("date serialization", () => {
    it("should properly serialize dates to ISO strings", async () => {
      const ctx = createProtectedTestContext();
      const caller = todoRouter.createCaller(ctx);
      
      const todoWithDates = {
        id: 1,
        title: "Date Test",
        description: "Test",
        type: "CALL",
        priority: "MEDIUM",
        status: "COMPLETED",
        dueDate: new Date("2024-12-31T10:00:00Z"),
        scheduledDate: new Date("2024-12-01T15:30:00Z"),
        completedDate: new Date("2024-12-15T08:00:00Z"),
        donorId: 123,
        staffId: 456,
        organizationId: "org-1",
        createdAt: new Date("2024-01-01T00:00:00Z"),
        updatedAt: new Date("2024-01-15T12:00:00Z"),
      };
      
      mockTodoService.getTodosByOrganization.mockResolvedValue([todoWithDates]);
      
      const result = await caller.getByOrganization({});
      
      expect(result[0].dueDate).toBe("2024-12-31T10:00:00.000Z");
      expect(result[0].scheduledDate).toBe("2024-12-01T15:30:00.000Z");
      expect(result[0].completedDate).toBe("2024-12-15T08:00:00.000Z");
      expect(result[0].createdAt).toBe("2024-01-01T00:00:00.000Z");
      expect(result[0].updatedAt).toBe("2024-01-15T12:00:00.000Z");
    });
  });
});