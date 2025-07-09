import {
  TodoService,
  type CreateTodoInput,
  type UpdateTodoInput,
} from '@/app/lib/services/todo-service';
import { db } from '@/app/lib/db';
import { getDonorById } from '@/app/lib/data/donors';
import type { PredictedAction } from '@/app/lib/analysis/types';

// Mock dependencies
jest.mock('@/app/lib/db');
jest.mock('@/app/lib/data/donors');

// Create mock implementations
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockSelect = jest.fn();
const mockLeftJoin = jest.fn();
const mockWhere = jest.fn();
const mockOrderBy = jest.fn();
const mockReturning = jest.fn();

// Setup mock chain
const setupMockChain = () => {
  mockInsert.mockReturnValue({
    values: jest.fn().mockReturnValue({
      returning: mockReturning,
    }),
  });

  mockUpdate.mockReturnValue({
    set: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        returning: mockReturning,
      }),
    }),
  });

  mockDelete.mockReturnValue({
    where: jest.fn().mockReturnValue({
      returning: mockReturning,
    }),
  });

  mockSelect.mockReturnValue({
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        orderBy: mockOrderBy,
      }),
      leftJoin: mockLeftJoin,
    }),
  });

  mockLeftJoin.mockReturnValue({
    where: jest.fn().mockReturnValue({
      orderBy: mockOrderBy,
    }),
  });

  mockOrderBy.mockReturnValue([]);
};

describe('TodoService', () => {
  let todoService: TodoService;

  beforeEach(() => {
    todoService = new TodoService();
    jest.clearAllMocks();
    setupMockChain();

    // Setup db mocks
    (db as any).insert = mockInsert;
    (db as any).update = mockUpdate;
    (db as any).delete = mockDelete;
    (db as any).select = mockSelect;
  });

  describe('createTodo', () => {
    it('should create a todo with default values', async () => {
      const input: CreateTodoInput = {
        title: 'Test Todo',
        description: 'Test Description',
        type: 'TASK',
        organizationId: 'org123',
      };

      const expectedTodo = { id: 1, ...input, status: 'PENDING', priority: 'MEDIUM' };
      mockReturning.mockResolvedValue([expectedTodo]);

      const result = await todoService.createTodo(input);

      expect(mockInsert).toHaveBeenCalled();
      expect(result).toEqual(expectedTodo);
    });

    it('should use provided priority', async () => {
      const input: CreateTodoInput = {
        title: 'High Priority Todo',
        description: 'Important task',
        type: 'URGENT',
        priority: 'HIGH',
        organizationId: 'org123',
      };

      const expectedTodo = { id: 2, ...input, status: 'PENDING' };
      mockReturning.mockResolvedValue([expectedTodo]);

      const result = await todoService.createTodo(input);

      expect(result.priority).toBe('HIGH');
    });

    it('should handle optional fields', async () => {
      const input: CreateTodoInput = {
        title: 'Todo with dates',
        description: 'Test',
        type: 'TASK',
        organizationId: 'org123',
        dueDate: new Date('2024-12-31'),
        scheduledDate: new Date('2024-12-01'),
        donorId: 123,
        staffId: 456,
      };

      mockReturning.mockResolvedValue([{ id: 3, ...input }]);

      const result = await todoService.createTodo(input);

      expect(result.dueDate).toEqual(input.dueDate);
      expect(result.scheduledDate).toEqual(input.scheduledDate);
      expect(result.donorId).toBe(123);
      expect(result.staffId).toBe(456);
    });
  });

  describe('createTodosFromPredictedActions', () => {
    it('should create todos from predicted actions', async () => {
      const donorId = 100;
      const organizationId = 'org123';
      const staffId = 50;

      const mockDonor = {
        id: donorId,
        assignedToStaffId: staffId,
      };

      (getDonorById as jest.Mock).mockResolvedValue(mockDonor);

      const predictedActions: PredictedAction[] = [
        {
          type: 'FOLLOW_UP',
          description: 'Follow up with donor',
          scheduledDate: '2024-01-15',
          explanation: 'Based on donation pattern',
          instruction: 'Send thank you email',
        },
        {
          type: 'MEETING',
          description: 'Schedule meeting',
        },
      ];

      const expectedTodos = predictedActions.map((action, index) => ({
        id: index + 1,
        title: action.type,
        description: action.description,
        type: 'PREDICTED_ACTION',
        status: 'PENDING',
        priority: 'MEDIUM',
        donorId,
        staffId,
        organizationId,
        scheduledDate: action.scheduledDate ? new Date(action.scheduledDate) : undefined,
        explanation: action.explanation,
        instruction: action.instruction,
      }));

      mockReturning.mockResolvedValue(expectedTodos);

      const result = await todoService.createTodosFromPredictedActions(
        donorId,
        organizationId,
        predictedActions
      );

      expect(getDonorById).toHaveBeenCalledWith(donorId, organizationId);
      expect(mockInsert).toHaveBeenCalled();
      expect(result).toHaveLength(2);
      expect(result[0].staffId).toBe(staffId);
    });

    it('should throw error if donor not found', async () => {
      (getDonorById as jest.Mock).mockResolvedValue(null);

      await expect(todoService.createTodosFromPredictedActions(999, 'org123', [])).rejects.toThrow(
        'Donor 999 not found'
      );
    });
  });

  describe('updateTodo', () => {
    it('should update a todo', async () => {
      const todoId = 1;
      const input: UpdateTodoInput = {
        title: 'Updated Title',
        status: 'COMPLETED',
        completedDate: new Date('2024-01-01'),
      };

      const updatedTodo = { id: todoId, ...input, updatedAt: expect.any(Date) };
      mockReturning.mockResolvedValue([updatedTodo]);

      const result = await todoService.updateTodo(todoId, input);

      expect(mockUpdate).toHaveBeenCalled();
      expect(result).toEqual(updatedTodo);
    });

    it('should remove organizationId from update data', async () => {
      const todoId = 1;
      const input: UpdateTodoInput = {
        title: 'Updated',
        organizationId: 'should-be-removed',
      };

      mockReturning.mockResolvedValue([{ id: todoId }]);

      await todoService.updateTodo(todoId, input);

      // Check that the set method was called without organizationId
      const setCall = (mockUpdate().set as jest.Mock).mock.calls[0][0];
      expect(setCall).not.toHaveProperty('organizationId');
    });
  });

  describe('deleteTodo', () => {
    it('should delete a todo', async () => {
      const todoId = 1;
      const deletedTodo = { id: todoId, title: 'Deleted Todo' };
      mockReturning.mockResolvedValue([deletedTodo]);

      const result = await todoService.deleteTodo(todoId);

      expect(mockDelete).toHaveBeenCalled();
      expect(result).toEqual(deletedTodo);
    });
  });

  describe('getTodosByOrganization', () => {
    it('should get todos by organization', async () => {
      const organizationId = 'org123';
      const todos = [
        { id: 1, title: 'Todo 1', organizationId },
        { id: 2, title: 'Todo 2', organizationId },
      ];

      mockOrderBy.mockResolvedValue(todos);

      const result = await todoService.getTodosByOrganization(organizationId);

      expect(mockSelect).toHaveBeenCalled();
      expect(result).toEqual(todos);
    });

    it('should filter by options', async () => {
      const organizationId = 'org123';
      const options = {
        type: 'TASK',
        status: 'PENDING',
        donorId: 100,
        staffId: 50,
      };

      mockOrderBy.mockResolvedValue([]);

      await todoService.getTodosByOrganization(organizationId, options);

      expect(mockSelect).toHaveBeenCalled();
    });
  });

  describe('getTodosByDonor', () => {
    it('should get todos by donor', async () => {
      const donorId = 100;
      const todos = [
        { id: 1, title: 'Donor Todo 1', donorId },
        { id: 2, title: 'Donor Todo 2', donorId },
      ];

      mockOrderBy.mockResolvedValue(todos);

      const result = await todoService.getTodosByDonor(donorId);

      expect(result).toEqual(todos);
    });
  });

  describe('getTodosByStaff', () => {
    it('should get todos by staff', async () => {
      const staffId = 50;
      const todos = [
        { id: 1, title: 'Staff Todo 1', staffId },
        { id: 2, title: 'Staff Todo 2', staffId },
      ];

      mockOrderBy.mockResolvedValue(todos);

      const result = await todoService.getTodosByStaff(staffId);

      expect(result).toEqual(todos);
    });
  });

  describe('getTodosGroupedByType', () => {
    it('should group todos by type', async () => {
      const organizationId = 'org123';
      const todos = [
        {
          id: 1,
          type: 'TASK',
          title: 'Task 1',
          donorFirstName: 'John',
          donorLastName: 'Doe',
        },
        {
          id: 2,
          type: 'TASK',
          title: 'Task 2',
          donorFirstName: 'Jane',
          donorLastName: 'Smith',
        },
        {
          id: 3,
          type: 'MEETING',
          title: 'Meeting 1',
          donorFirstName: null,
          donorLastName: null,
        },
      ];

      mockOrderBy.mockResolvedValue(todos);

      const result = await todoService.getTodosGroupedByType(organizationId);

      expect(result).toHaveProperty('TASK');
      expect(result).toHaveProperty('MEETING');
      expect(result.TASK).toHaveLength(2);
      expect(result.MEETING).toHaveLength(1);
      expect(result.TASK[0].donorName).toBe('John Doe');
      expect(result.MEETING[0].donorName).toBeNull();
    });

    it('should exclude specified statuses', async () => {
      const organizationId = 'org123';
      const statusesToExclude = ['COMPLETED', 'CANCELLED'];

      mockOrderBy.mockResolvedValue([]);

      await todoService.getTodosGroupedByType(organizationId, statusesToExclude);

      expect(mockSelect).toHaveBeenCalled();
    });
  });
});
