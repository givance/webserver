import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@/app/lib/db";
import { templates } from "@/app/lib/db/schema";
import { router, protectedProcedure } from "../trpc";
import { logger } from "@/app/lib/logger";

// Validation schemas
const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  prompt: z.string().min(1),
  isActive: z.boolean().default(true),
});

const updateTemplateSchema = z.object({
  id: z.number(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  prompt: z.string().min(1),
  isActive: z.boolean(),
});

const deleteTemplateSchema = z.object({
  id: z.number(),
});

const getTemplateSchema = z.object({
  id: z.number(),
});

const listTemplatesSchema = z.object({
  includeInactive: z.boolean().default(false),
});

export const templatesRouter = router({
  /**
   * Creates a new template
   */
  create: protectedProcedure.input(createTemplateSchema).mutation(async ({ ctx, input }) => {
    try {
      const [template] = await db
        .insert(templates)
        .values({
          organizationId: ctx.auth.user.organizationId,
          name: input.name,
          description: input.description,
          prompt: input.prompt,
          isActive: input.isActive,
        })
        .returning();

      logger.info(`Created template ${template.id} for organization ${ctx.auth.user.organizationId}`);
      return template;
    } catch (error) {
      logger.error(`Failed to create template: ${error instanceof Error ? error.message : String(error)}`);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to create template",
      });
    }
  }),

  /**
   * Updates an existing template
   */
  update: protectedProcedure.input(updateTemplateSchema).mutation(async ({ ctx, input }) => {
    try {
      // First verify the template exists and belongs to the user's organization
      const [existingTemplate] = await db
        .select({ id: templates.id, organizationId: templates.organizationId })
        .from(templates)
        .where(eq(templates.id, input.id))
        .limit(1);

      if (!existingTemplate) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found",
        });
      }

      if (existingTemplate.organizationId !== ctx.auth.user.organizationId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to update this template",
        });
      }

      const [updatedTemplate] = await db
        .update(templates)
        .set({
          name: input.name,
          description: input.description,
          prompt: input.prompt,
          isActive: input.isActive,
          updatedAt: new Date(),
        })
        .where(eq(templates.id, input.id))
        .returning();

      logger.info(`Updated template ${input.id} for organization ${ctx.auth.user.organizationId}`);
      return updatedTemplate;
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(`Failed to update template: ${error instanceof Error ? error.message : String(error)}`);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to update template",
      });
    }
  }),

  /**
   * Deletes a template
   */
  delete: protectedProcedure.input(deleteTemplateSchema).mutation(async ({ ctx, input }) => {
    try {
      // First verify the template exists and belongs to the user's organization
      const [existingTemplate] = await db
        .select({ id: templates.id, organizationId: templates.organizationId })
        .from(templates)
        .where(eq(templates.id, input.id))
        .limit(1);

      if (!existingTemplate) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found",
        });
      }

      if (existingTemplate.organizationId !== ctx.auth.user.organizationId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to delete this template",
        });
      }

      await db.delete(templates).where(eq(templates.id, input.id));

      logger.info(`Deleted template ${input.id} for organization ${ctx.auth.user.organizationId}`);
      return { id: input.id };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(`Failed to delete template: ${error instanceof Error ? error.message : String(error)}`);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to delete template",
      });
    }
  }),

  /**
   * Gets a specific template by ID
   */
  get: protectedProcedure.input(getTemplateSchema).query(async ({ ctx, input }) => {
    try {
      const [template] = await db
        .select()
        .from(templates)
        .where(and(eq(templates.id, input.id), eq(templates.organizationId, ctx.auth.user.organizationId)))
        .limit(1);

      if (!template) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found",
        });
      }

      return template;
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(`Failed to get template: ${error instanceof Error ? error.message : String(error)}`);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get template",
      });
    }
  }),

  /**
   * Lists all templates for the organization
   */
  list: protectedProcedure.input(listTemplatesSchema).query(async ({ ctx, input }) => {
    try {
      const whereConditions = [eq(templates.organizationId, ctx.auth.user.organizationId)];

      if (!input.includeInactive) {
        whereConditions.push(eq(templates.isActive, true));
      }

      const templatesList = await db
        .select()
        .from(templates)
        .where(whereConditions.length > 1 ? and(...whereConditions) : whereConditions[0])
        .orderBy(desc(templates.createdAt));

      logger.info(`Listed ${templatesList.length} templates for organization ${ctx.auth.user.organizationId}`);
      return templatesList;
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(`Failed to list templates: ${error instanceof Error ? error.message : String(error)}`);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to list templates",
      });
    }
  }),
});
