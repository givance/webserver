export interface Todo {
  id: number;
  title: string;
  description: string;
  type: string;
  status: string;
  priority: string;
  dueDate: string | null;
  scheduledDate: string | null;
  completedDate: string | null;
  donorId: number | null;
  staffId: number | null;
  organizationId: string;
  explanation: string | null;
  createdAt: string;
  updatedAt: string;
  donorName: string | null;
}
