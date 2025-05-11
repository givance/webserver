import { db } from "../db";
import { projects } from "../db/schema";
import { eq, sql, desc, asc, SQL, AnyColumn, and } from "drizzle-orm";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

export type Project = InferSelectModel<typeof projects>;
export type NewProject = InferInsertModel<typeof projects>;

/**
 * Retrieves a project by its ID.
 * @param id - The ID of the project to retrieve.
 * @returns The project object if found, otherwise undefined.
 */
export async function getProjectById(id: number): Promise<Project | undefined> {
  try {
    const result = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    return result[0];
  } catch (error) {
    console.error("Failed to retrieve project by ID:", error);
    throw new Error("Could not retrieve project.");
  }
}

/**
 * Creates a new project.
 * @param projectData - The data for the new project.
 * @returns The newly created project object.
 */
export async function createProject(projectData: Omit<NewProject, "id" | "createdAt" | "updatedAt">): Promise<Project> {
  try {
    const result = await db.insert(projects).values(projectData).returning();
    return result[0];
  } catch (error) {
    console.error("Failed to create project:", error);
    throw new Error("Could not create project.");
  }
}

/**
 * Updates an existing project.
 * @param id - The ID of the project to update.
 * @param projectData - The data to update for the project.
 * @returns The updated project object.
 */
export async function updateProject(
  id: number,
  projectData: Partial<Omit<NewProject, "id" | "createdAt" | "updatedAt">>
): Promise<Project | undefined> {
  try {
    const result = await db
      .update(projects)
      .set({ ...projectData, updatedAt: sql`now()` })
      .where(eq(projects.id, id))
      .returning();
    return result[0];
  } catch (error) {
    console.error("Failed to update project:", error);
    throw new Error("Could not update project.");
  }
}

/**
 * Deletes a project by its ID.
 * @param id - The ID of the project to delete.
 */
export async function deleteProject(id: number): Promise<void> {
  try {
    await db.delete(projects).where(eq(projects.id, id));
  } catch (error) {
    // Consider handling foreign key constraint errors if projects are linked elsewhere
    console.error("Failed to delete project:", error);
    throw new Error("Could not delete project.");
  }
}

/**
 * Lists projects with optional filtering and sorting.
 * @param options - Options for filtering (e.g., active status) and pagination.
 * @param organizationId - The ID of the organization to filter projects by.
 * @returns An array of project objects.
 */
export async function listProjects(
  options: {
    active?: boolean;
    limit?: number;
    offset?: number;
    orderBy?: keyof Pick<Project, "name" | "createdAt">;
    orderDirection?: "asc" | "desc";
  } = {},
  organizationId: string
): Promise<Project[]> {
  try {
    const { active, limit = 10, offset = 0, orderBy, orderDirection = "asc" } = options;

    let queryBuilder = db.select().from(projects);

    const conditions: SQL[] = [eq(projects.organizationId, organizationId)];
    if (active !== undefined) {
      conditions.push(eq(projects.active, active));
    }

    queryBuilder = queryBuilder.where(and(...conditions)) as typeof queryBuilder;

    if (orderBy) {
      const columnMap: { [key in typeof orderBy]: AnyColumn } = {
        name: projects.name,
        createdAt: projects.createdAt,
      };
      const selectedColumn = columnMap[orderBy];
      if (selectedColumn) {
        const direction = orderDirection === "asc" ? asc : desc;
        queryBuilder = queryBuilder.orderBy(direction(selectedColumn)) as typeof queryBuilder;
      }
    }

    return await queryBuilder.limit(limit).offset(offset);
  } catch (error) {
    console.error("Failed to list projects:", error);
    throw new Error("Could not list projects.");
  }
}
