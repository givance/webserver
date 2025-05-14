"use client";

import { trpc } from "../lib/trpc/client";
import type { inferProcedureInput, inferProcedureOutput } from "@trpc/server";
import type { AppRouter } from "@/app/api/trpc/routers/_app";

export type Project = {
  id: number;
  name: string;
  description: string | undefined;
  active: boolean;
  goal: number | undefined;
  tags: string[] | undefined;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateProjectInput = Pick<Project, "name" | "description" | "active" | "goal" | "tags" | "organizationId">;
export type UpdateProjectInput = Partial<CreateProjectInput> & { id: number };

/**
 * Hook for managing projects through the tRPC API
 * Provides methods for creating, reading, updating, and deleting projects
 */
export function useProjects() {
  const utils = trpc.useUtils();

  // Query hooks
  const listProjects = trpc.projects.list.useQuery;
  const getProjectById = trpc.projects.getById.useQuery;

  // Mutation hooks
  const createMutation = trpc.projects.create.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate();
    },
  });

  const updateMutation = trpc.projects.update.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate();
    },
  });

  const deleteMutation = trpc.projects.delete.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate();
    },
  });

  /**
   * Create a new project
   * @param input The project data to create
   * @returns The created project or null if creation failed
   */
  const createProject = async (input: CreateProjectInput) => {
    try {
      return await createMutation.mutateAsync(input);
    } catch (error) {
      console.error("Failed to create project:", error);
      return null;
    }
  };

  /**
   * Update an existing project
   * @param input The project data to update
   * @returns The updated project or null if update failed
   */
  const updateProject = async (input: UpdateProjectInput) => {
    try {
      return await updateMutation.mutateAsync(input);
    } catch (error) {
      console.error("Failed to update project:", error);
      return null;
    }
  };

  /**
   * Delete a project by ID
   * @param id The ID of the project to delete
   * @returns true if deletion was successful, false otherwise
   */
  const deleteProject = async (id: number) => {
    try {
      await deleteMutation.mutateAsync({ id });
      return true;
    } catch (error) {
      console.error("Failed to delete project:", error);
      return false;
    }
  };

  return {
    // Query functions
    listProjects,
    getProjectById,

    // Mutation functions
    createProject,
    updateProject,
    deleteProject,

    // Loading states
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,

    // Mutation results
    createResult: createMutation.data,
    updateResult: updateMutation.data,
  };
}
