import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { 
  getProjectById, 
  createProject, 
  updateProject, 
  deleteProject, 
  listProjects 
} from "@/app/lib/data/projects";
import { 
  createTRPCError,
  handleAsync,
  notFoundError,
  conflictError,
  ERROR_MESSAGES
} from "@/app/lib/utils/trpc-errors";
import {
  idSchema,
  nameSchema,
  descriptionSchema,
  paginationSchema,
  orderingSchema,
  projectSchemas,
} from "@/app/lib/validation/schemas";

// Schema definitions
const projectResponseSchema = z.object({
  id: idSchema,
  organizationId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  active: z.boolean(),
  goal: z.number().nullable(),
  tags: z.array(z.string()).nullable(),
  external: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const listProjectsInputSchema = z.object({
  active: z.boolean().optional(),
  searchTerm: z.string().optional(),
  ...paginationSchema.shape,
  ...orderingSchema.shape,
  orderBy: z.enum(["name", "createdAt"]).optional(),
});

const listProjectsResponseSchema = z.object({
  projects: z.array(projectResponseSchema),
  totalCount: z.number(),
});

export const projectsRouter = router({
  /**
   * Get a project by ID
   * 
   * @param id - Project ID
   * 
   * @returns The requested project
   * 
   * @throws {TRPCError} NOT_FOUND if project doesn't exist
   */
  getById: protectedProcedure
    .input(z.object({ id: idSchema }))
    .output(projectResponseSchema)
    .query(async ({ input }) => {
      const project = await handleAsync(
        async () => getProjectById(input.id),
        {
          errorMessage: ERROR_MESSAGES.OPERATION_FAILED("fetch project"),
          logMetadata: { projectId: input.id }
        }
      );

      if (!project) {
        throw notFoundError("Project");
      }

      return project;
    }),

  /**
   * Create a new project
   * 
   * @param name - Project name (required)
   * @param description - Project description
   * @param active - Whether the project is active
   * @param goal - Fundraising goal amount
   * @param tags - Array of tags for categorization
   * 
   * @returns The created project
   * 
   * @throws {TRPCError} CONFLICT if project name already exists
   * @throws {TRPCError} INTERNAL_SERVER_ERROR if creation fails
   */
  create: protectedProcedure
    .input(projectSchemas.create)
    .output(projectResponseSchema)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.auth.user?.organizationId) {
        throw createTRPCError({
          code: "UNAUTHORIZED",
          message: ERROR_MESSAGES.UNAUTHORIZED,
        });
      }

      try {
        return await createProject({
          ...input,
          organizationId: ctx.auth.user.organizationId,
          external: false,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes("already exists")) {
          throw createTRPCError({
            code: "CONFLICT",
            message: `A project with the name "${input.name}" already exists. Please choose a different name.`,
            logLevel: "info",
            metadata: { projectName: input.name }
          });
        }
        
        throw createTRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: ERROR_MESSAGES.OPERATION_FAILED("create project"),
          cause: error,
          metadata: { userId: ctx.auth.user.id }
        });
      }
    }),

  /**
   * Update an existing project
   * 
   * @param id - Project ID to update
   * @param name - New project name
   * @param description - New description
   * @param active - New active status
   * @param goal - New fundraising goal
   * @param tags - New tags
   * 
   * @returns The updated project
   * 
   * @throws {TRPCError} NOT_FOUND if project doesn't exist
   * @throws {TRPCError} CONFLICT if new name already exists
   */
  update: protectedProcedure
    .input(z.object({
      id: idSchema,
      ...projectSchemas.update.shape,
    }))
    .output(projectResponseSchema)
    .mutation(async ({ input }) => {
      const { id, ...updateData } = input;
      
      const updated = await handleAsync(
        async () => updateProject(id, updateData),
        {
          errorMessage: ERROR_MESSAGES.OPERATION_FAILED("update project"),
          logMetadata: { projectId: id, updates: Object.keys(updateData) }
        }
      );

      if (!updated) {
        throw notFoundError("Project");
      }

      return updated;
    }),

  /**
   * Delete a project
   * 
   * @param id - Project ID to delete
   * 
   * @throws {TRPCError} NOT_FOUND if project doesn't exist
   * @throws {TRPCError} CONFLICT if project has associated records
   */
  delete: protectedProcedure
    .input(z.object({ id: idSchema }))
    .output(z.void())
    .mutation(async ({ input }) => {
      try {
        await deleteProject(input.id);
      } catch (error) {
        if (error instanceof Error && error.message.includes("linked to other records")) {
          throw createTRPCError({
            code: "CONFLICT",
            message: "This project cannot be deleted because it has associated donations or other records. Please remove those associations first.",
            logLevel: "info",
            metadata: { projectId: input.id }
          });
        }
        
        throw createTRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: ERROR_MESSAGES.OPERATION_FAILED("delete project"),
          cause: error,
          metadata: { projectId: input.id }
        });
      }
    }),

  /**
   * List projects with filtering and pagination
   * 
   * @param active - Filter by active status
   * @param searchTerm - Search projects by name
   * @param limit - Maximum number of results
   * @param offset - Number of results to skip
   * @param orderBy - Field to order by
   * @param orderDirection - Sort direction (asc/desc)
   * 
   * @returns Object containing projects array and total count
   * 
   * @throws {TRPCError} UNAUTHORIZED if user has no organization
   */
  list: protectedProcedure
    .input(listProjectsInputSchema)
    .output(listProjectsResponseSchema)
    .query(async ({ input, ctx }) => {
      if (!ctx.auth.user?.organizationId) {
        throw createTRPCError({
          code: "UNAUTHORIZED",
          message: ERROR_MESSAGES.UNAUTHORIZED,
        });
      }

      return await handleAsync(
        async () => listProjects(input, ctx.auth.user!.organizationId),
        {
          errorMessage: ERROR_MESSAGES.OPERATION_FAILED("list projects"),
          logMetadata: { 
            organizationId: ctx.auth.user.organizationId,
            filters: input 
          }
        }
      );
    }),
});