import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { getProjectById, createProject, updateProject, deleteProject, listProjects } from "@/app/lib/data/projects";

// Input validation schemas
const projectIdSchema = z.object({
  id: z.number(),
});

const createProjectSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  active: z.boolean().default(true),
  goal: z.number().optional(),
  tags: z.array(z.string()).optional(),
  organizationId: z.string(),
  external: z.boolean().default(false),
});

const updateProjectSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  description: z.string().optional(),
  active: z.boolean().optional(),
  goal: z.number().optional(),
  tags: z.array(z.string()).optional(),
  external: z.boolean().optional(),
});

const listProjectsSchema = z.object({
  active: z.boolean().optional(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
  orderBy: z.enum(["name", "createdAt"]).optional(),
  orderDirection: z.enum(["asc", "desc"]).optional(),
  searchTerm: z.string().optional(),
});

// Define a Zod schema for the Project model
const projectSchema = z.object({
  id: z.number(),
  organizationId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  active: z.boolean(),
  goal: z.number().nullable(),
  tags: z.array(z.string()).nullable(), // Based on text("tags").array()
  external: z.boolean(),
  createdAt: z.date(), // Timestamps will be Date objects
  updatedAt: z.date(),
});

// Define the output schema for the list procedure to include totalCount
const listProjectsOutputSchema = z.object({
  projects: z.array(projectSchema), // Use the specific project schema
  totalCount: z.number(),
});

export const projectsRouter = router({
  getById: protectedProcedure.input(projectIdSchema).query(async ({ input }) => {
    const project = await getProjectById(input.id);
    if (!project) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "The project you're looking for doesn't exist or has been deleted",
      });
    }
    return project;
  }),

  create: protectedProcedure.input(createProjectSchema).mutation(async ({ input, ctx }) => {
    try {
      return await createProject({
        ...input,
        organizationId: ctx.auth.user.organizationId,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("already exists")) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A project with the name "${input.name}" already exists. Please choose a different name.`,
        });
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to create project. Please try again.",
      });
    }
  }),

  update: protectedProcedure.input(updateProjectSchema).mutation(async ({ input }) => {
    const { id, ...updateData } = input;
    const updated = await updateProject(id, updateData);
    if (!updated) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Unable to update. The project doesn't exist or has been deleted.",
      });
    }
    return updated;
  }),

  delete: protectedProcedure.input(projectIdSchema).mutation(async ({ input }) => {
    try {
      await deleteProject(input.id);
    } catch (error) {
      if (error instanceof Error && error.message.includes("linked to other records")) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This project cannot be deleted because it has associated donations or other records. Please remove those associations first.",
        });
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to delete the project. Please try again.",
      });
    }
  }),

  list: protectedProcedure
    .input(listProjectsSchema)
    // Explicitly type the output of the query based on the new schema
    .output(listProjectsOutputSchema)
    .query(async ({ input, ctx }) => {
      // The listProjects function now returns an object with projects and totalCount
      const result = await listProjects(input, ctx.auth.user.organizationId);
      return result; // This matches the listProjectsOutputSchema
    }),
});
