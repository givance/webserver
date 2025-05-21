import { z } from "zod";
import { router, protectedProcedure } from "@/app/api/trpc/trpc";
import { TodoService } from "@/app/lib/services/todo-service";
import { logger } from "@/app/lib/logger";

const todoService = new TodoService();

// Helper to preprocess date strings into Date objects or keep them as undefined/null
const preprocessDate = (arg: unknown) => {
  if (typeof arg === "string" || arg instanceof Date) return new Date(arg);
  if (arg === null || arg === undefined) return arg;
  return undefined; // Or throw an error if unexpected type
};

export const todoRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        title: z.string(),
        description: z.string(),
        type: z.string(),
        priority: z.string().optional(),
        dueDate: z.preprocess(preprocessDate, z.date().optional()),
        scheduledDate: z.preprocess(preprocessDate, z.date().optional()),
        donorId: z.number().optional(),
        staffId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { user } = ctx.auth;
      if (!user?.organizationId) {
        throw new Error("User must belong to an organization");
      }

      logger.info(`Creating new todo "${input.title}" for organization ${user.organizationId}`);
      return await todoService.createTodo({
        ...input,
        organizationId: user.organizationId,
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().optional(),
        description: z.string().optional(),
        type: z.string().optional(),
        priority: z.string().optional(),
        status: z.string().optional(),
        dueDate: z.preprocess(preprocessDate, z.date().optional()),
        scheduledDate: z.preprocess(preprocessDate, z.date().optional()),
        completedDate: z.preprocess(preprocessDate, z.date().optional().nullable()),
        staffId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;
      logger.info(`Updating todo ${id}`);
      return await todoService.updateTodo(id, updateData);
    }),

  updateMany: protectedProcedure
    .input(
      z.object({
        ids: z.array(z.number()),
        data: z.object({
          title: z.string().optional(),
          description: z.string().optional(),
          type: z.string().optional(),
          priority: z.string().optional(),
          status: z.string().optional(),
          dueDate: z.preprocess(preprocessDate, z.date().optional()),
          scheduledDate: z.preprocess(preprocessDate, z.date().optional()),
          completedDate: z.preprocess(preprocessDate, z.date().optional().nullable()),
          staffId: z.number().optional().nullable(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { ids, data } = input;
      const { user } = ctx.auth;
      if (!user?.organizationId) {
        throw new Error("User must belong to an organization to update todos.");
      }

      logger.info(
        `Bulk updating ${ids.length} todos for organization ${user.organizationId} with data: ${JSON.stringify(data)}`
      );

      const serviceUpdateData: any = { ...data };

      if (data.completedDate === null) {
        serviceUpdateData.completedDate = undefined;
      }
      if (data.staffId === null) {
        serviceUpdateData.staffId = undefined;
      }

      const updatePromises = ids.map((id) => todoService.updateTodo(id, serviceUpdateData));
      const results = await Promise.all(updatePromises);

      logger.info(`Successfully bulk updated ${results.filter((r) => r).length} todos.`);
      return { count: results.filter((r) => r).length };
    }),

  delete: protectedProcedure
    .input(
      z.object({
        id: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      logger.info(`Deleting todo ${input.id}`);
      return await todoService.deleteTodo(input.id);
    }),

  getByOrganization: protectedProcedure
    .input(
      z.object({
        type: z.string().optional(),
        status: z.string().optional(),
        donorId: z.number().optional(),
        staffId: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { user } = ctx.auth;
      if (!user?.organizationId) {
        throw new Error("User must belong to an organization");
      }

      logger.info(`Fetching todos for organization ${user.organizationId}`);
      return await todoService.getTodosByOrganization(user.organizationId, input);
    }),

  getGroupedByType: protectedProcedure.query(async ({ ctx }) => {
    const { user } = ctx.auth;
    if (!user?.organizationId) {
      throw new Error("User must belong to an organization");
    }

    logger.info(`Fetching grouped todos for organization ${user.organizationId}`);
    return await todoService.getTodosGroupedByType(user.organizationId);
  }),

  getByDonor: protectedProcedure
    .input(
      z.object({
        donorId: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      logger.info(`Fetching todos for donor ${input.donorId}`);
      return await todoService.getTodosByDonor(input.donorId);
    }),

  getByStaff: protectedProcedure
    .input(
      z.object({
        staffId: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      logger.info(`Fetching todos for staff ${input.staffId}`);
      return await todoService.getTodosByStaff(input.staffId);
    }),
});
