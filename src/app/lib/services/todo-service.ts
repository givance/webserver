import type { PredictedAction } from '@/app/lib/analysis/types';
import type { Todo } from '@/app/types/todo';
import { getDonorById } from '@/app/lib/data/donors';
import {
  createTodo as createTodoData,
  bulkCreateTodos,
  updateTodo as updateTodoData,
  deleteTodo as deleteTodoData,
  getTodosByOrganization as getTodosByOrganizationData,
  getTodosByDonor as getTodosByDonorData,
  getTodosByStaff as getTodosByStaffData,
  getTodosGroupedByType as getTodosGroupedByTypeData,
} from '@/app/lib/data/todos';

export interface CreateTodoInput {
  title: string;
  description: string;
  type: string;
  priority?: string;
  dueDate?: Date;
  scheduledDate?: Date;
  donorId?: number;
  staffId?: number | null;
  organizationId: string;
  explanation?: string;
}

export interface UpdateTodoInput extends Partial<CreateTodoInput> {
  status?: string;
  completedDate?: Date | null;
}

export interface TodoWithDonor extends Todo {
  donorName: string | null;
}

export class TodoService {
  async createTodo(input: CreateTodoInput) {
    return await createTodoData({
      ...input,
      status: 'PENDING',
      priority: input.priority || 'MEDIUM',
    });
  }

  async createTodosFromPredictedActions(
    donorId: number,
    organizationId: string,
    predictedActions: PredictedAction[]
  ) {
    // First get the donor to find their assigned staff member
    const donor = await getDonorById(donorId, organizationId);
    if (!donor) {
      throw new Error(`Donor ${donorId} not found`);
    }

    const todoInputs = predictedActions.map((action) => ({
      title: action.type,
      description: action.description,
      type: 'PREDICTED_ACTION',
      status: 'PENDING',
      priority: 'MEDIUM',
      donorId,
      staffId: donor.assignedToStaffId, // Assign to the donor's assigned staff member
      organizationId,
      scheduledDate: action.scheduledDate ? new Date(action.scheduledDate) : undefined,
      explanation: action.explanation,
    }));

    return await bulkCreateTodos(todoInputs);
  }

  async updateTodo(id: number, input: UpdateTodoInput) {
    const updateData = { ...input };
    delete (updateData as any).organizationId;

    return await updateTodoData(id, updateData);
  }

  async deleteTodo(id: number) {
    return await deleteTodoData(id);
  }

  async getTodosByOrganization(
    organizationId: string,
    options?: {
      type?: string;
      status?: string;
      donorId?: number;
      staffId?: number;
    }
  ) {
    return await getTodosByOrganizationData(organizationId, options);
  }

  async getTodosByDonor(donorId: number) {
    return await getTodosByDonorData(donorId);
  }

  async getTodosByStaff(staffId: number) {
    return await getTodosByStaffData(staffId);
  }

  async getTodosGroupedByType(organizationId: string, statusesToExclude?: string[]) {
    const allTodos = await getTodosGroupedByTypeData(organizationId, statusesToExclude);

    // Group todos by type
    return allTodos.reduce(
      (groups, todo) => {
        const type = todo.type;
        if (!groups[type]) {
          groups[type] = [];
        }
        groups[type].push({
          ...todo,
          donorName:
            todo.donorFirstName && todo.donorLastName
              ? `${todo.donorFirstName} ${todo.donorLastName}`
              : null,
        });
        return groups;
      },
      {} as Record<string, TodoWithDonor[]>
    );
  }
}
