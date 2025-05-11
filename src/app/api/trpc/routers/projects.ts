import { z } from "zod";
import { router, orgProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import {
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  listProjects,
  type Project,
  type NewProject,
} from "@/app/lib/data/projects";

// Input validation schemas
const projectIdSchema = z.object({
  id: z.number(),
});

const createProjectSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  active: z.boolean().default(true),
  goal: z.number().optional(),
  organizationId: z.string(),
  tags: z.array(z.string()).optional(),
});

const updateProjectSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  description: z.string().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  active: z.boolean().optional(),
  goal: z.number().optional(),
  tags: z.array(z.string()).optional(),
});

const listProjectsSchema = z.object({
  active: z.boolean().optional(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
  orderBy: z.enum(["name", "createdAt"]).optional(),
  orderDirection: z.enum(["asc", "desc"]).optional(),
});

export const projectsRouter = router({
  getById: orgProcedure.input(projectIdSchema).query(async ({ input }) => {
    const project = await getProjectById(input.id);
    if (!project) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Project not found",
      });
    }
    return project;
  }),

  create: orgProcedure.input(createProjectSchema).mutation(async ({ input, ctx }) => {
    try {
      return await createProject({
        ...input,
        organizationId: ctx.orgId!,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("already exists")) {
        throw new TRPCError({
          code: "CONFLICT",
          message: error.message,
        });
      }
      throw error;
    }
  }),

  update: orgProcedure.input(updateProjectSchema).mutation(async ({ input }) => {
    const { id, ...updateData } = input;
    const updated = await updateProject(id, updateData);
    if (!updated) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Project not found",
      });
    }
    return updated;
  }),

  delete: orgProcedure.input(projectIdSchema).mutation(async ({ input }) => {
    try {
      await deleteProject(input.id);
    } catch (error) {
      if (error instanceof Error && error.message.includes("linked to other records")) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Cannot delete project as it is linked to other records",
        });
      }
      throw error;
    }
  }),

  list: orgProcedure.input(listProjectsSchema).query(async ({ input, ctx }) => {
    return await listProjects(input, ctx.orgId!);
  }),
});
