import { db } from '../db';
import { projects } from '../db/schema';
import { eq, sql, desc, asc, SQL, AnyColumn, and, count, like, or, inArray } from 'drizzle-orm';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { crmSyncService } from '../services/crm-sync.service';

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
    console.error('Failed to retrieve project by ID:', error);
    throw new Error('Could not retrieve project.');
  }
}

/**
 * Retrieves multiple projects by their IDs.
 * @param ids - Array of project IDs to retrieve.
 * @param organizationId - The ID of the organization the projects belong to.
 * @returns Array of project objects.
 */
export async function getProjectsByIds(ids: number[], organizationId: string): Promise<Project[]> {
  try {
    if (ids.length === 0) {
      return [];
    }

    const result = await db
      .select()
      .from(projects)
      .where(and(inArray(projects.id, ids), eq(projects.organizationId, organizationId)));
    return result;
  } catch (error) {
    console.error('Failed to retrieve projects by IDs:', error);
    throw new Error('Could not retrieve projects by IDs.');
  }
}

/**
 * Creates a new project.
 * @param projectData - The data for the new project.
 * @returns The newly created project object.
 */
export async function createProject(
  projectData: Omit<NewProject, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Project> {
  try {
    console.log(
      `[createProject] Starting project creation: name=${projectData.name}, organizationId=${projectData.organizationId}`
    );

    // If project doesn't have external ID, sync to CRM first
    const finalProjectData = { ...projectData } as NewProject;

    if (!finalProjectData.externalId && finalProjectData.organizationId) {
      console.log(`[createProject] Syncing new project to CRM: name=${finalProjectData.name}`);

      const externalId = await crmSyncService.syncProject(finalProjectData.organizationId, {
        name: finalProjectData.name,
        description: finalProjectData.description,
        active: finalProjectData.active ?? true,
        goal: finalProjectData.goal,
        tags: finalProjectData.tags,
      });

      if (externalId) {
        console.log(`[createProject] CRM sync successful, externalId=${externalId}`);
        finalProjectData.externalId = externalId;
      } else {
        console.log(`[createProject] CRM sync returned no external ID`);
      }
    }

    console.log(`[createProject] Inserting project into database: name=${finalProjectData.name}`);
    const result = await db.insert(projects).values(finalProjectData).returning();

    console.log(
      `[createProject] Database insert successful: id=${result[0].id}, externalId=${result[0].externalId || 'none'}`
    );
    return result[0];
  } catch (error) {
    console.error('Failed to create project:', error);
    throw new Error('Could not create project.');
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
  projectData: Partial<Omit<NewProject, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<Project | undefined> {
  try {
    // Always sync to CRM for updates
    const existingProject = await getProjectById(id);

    if (!existingProject) {
      console.log(`[updateProject] Project not found: id=${id}`);
      return undefined;
    }

    console.log(
      `[updateProject] Starting update for project: id=${id}, hasExternalId=${!!existingProject.externalId}`
    );

    // Sync to CRM (create external ID if needed, or update existing)
    if (existingProject.organizationId) {
      console.log(
        `[updateProject] Syncing project to CRM: id=${id}, externalId=${existingProject.externalId || 'none'}`
      );

      const externalId = await crmSyncService.syncProject(existingProject.organizationId, {
        id,
        externalId: existingProject.externalId || undefined,
        name: projectData.name || existingProject.name,
        description:
          projectData.description !== undefined
            ? projectData.description
            : existingProject.description,
        active:
          projectData.active !== undefined ? projectData.active : (existingProject.active ?? true),
        goal: projectData.goal !== undefined ? projectData.goal : existingProject.goal,
        tags: projectData.tags !== undefined ? projectData.tags : existingProject.tags,
      });

      if (externalId) {
        console.log(`[updateProject] CRM sync successful, externalId=${externalId}`);
        projectData.externalId = externalId;
      } else {
        console.log(`[updateProject] CRM sync returned no external ID`);
      }
    }

    console.log(`[updateProject] Updating project in database: id=${id}`);
    const result = await db
      .update(projects)
      .set({ ...projectData, updatedAt: sql`now()` })
      .where(eq(projects.id, id))
      .returning();

    console.log(
      `[updateProject] Database update successful: id=${id}, externalId=${result[0]?.externalId || 'none'}`
    );
    return result[0];
  } catch (error) {
    console.error('Failed to update project:', error);
    throw new Error('Could not update project.');
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
    console.error('Failed to delete project:', error);
    throw new Error('Could not delete project.');
  }
}

/**
 * Lists projects with optional filtering and sorting.
 * @param options - Options for filtering (e.g., active status) and pagination.
 * @param organizationId - The ID of the organization to filter projects by.
 * @returns An object containing an array of project objects and the total count.
 */
export async function listProjects(
  options: {
    active?: boolean;
    searchTerm?: string;
    limit?: number;
    offset?: number;
    orderBy?: keyof Pick<Project, 'name' | 'createdAt'>;
    orderDirection?: 'asc' | 'desc';
  } = {},
  organizationId: string
): Promise<{ projects: Project[]; totalCount: number }> {
  try {
    const { active, searchTerm, limit = 10, offset = 0, orderBy, orderDirection = 'asc' } = options;

    const conditions: SQL[] = [eq(projects.organizationId, organizationId)];
    if (active !== undefined) {
      conditions.push(eq(projects.active, active));
    }

    // Add search conditions
    if (searchTerm) {
      const term = `%${searchTerm.toLowerCase()}%`;
      const searchCondition = sql`(lower(${projects.name}) like ${term} or lower(coalesce(${projects.description}, '')) like ${term})`;
      conditions.push(searchCondition);
    }

    // Query for the total count
    const countQuery = db
      .select({ value: count() })
      .from(projects)
      .where(and(...conditions));

    // Query for the paginated data
    let dataQueryBuilder = db
      .select()
      .from(projects)
      .where(and(...conditions));

    if (orderBy) {
      const columnMap: { [key in typeof orderBy]: AnyColumn } = {
        name: projects.name,
        createdAt: projects.createdAt,
      };
      const selectedColumn = columnMap[orderBy];
      if (selectedColumn) {
        const direction = orderDirection === 'asc' ? asc : desc;
        dataQueryBuilder = dataQueryBuilder.orderBy(
          direction(selectedColumn)
        ) as typeof dataQueryBuilder;
      }
    }

    const [totalResult, projectData] = await Promise.all([
      countQuery,
      dataQueryBuilder.limit(limit).offset(offset),
    ]);

    const totalCount = totalResult[0]?.value || 0;

    return { projects: projectData, totalCount };
  } catch (error) {
    console.error('Failed to list projects:', error);
    throw new Error('Could not list projects.');
  }
}
