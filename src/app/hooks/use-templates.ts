"use client";

import { trpc } from "@/app/lib/trpc/client";

/**
 * Hook for managing templates through the tRPC API
 * Provides methods for creating, updating, deleting, and fetching templates
 */
export function useTemplates() {
  const utils = trpc.useUtils();

  // Query hooks
  const listTemplates = trpc.templates.list.useQuery;
  const getTemplate = trpc.templates.get.useQuery;

  // Mutation hooks
  const createTemplateMutation = trpc.templates.create.useMutation({
    onSuccess: () => {
      utils.templates.list.invalidate();
    },
  });

  const updateTemplateMutation = trpc.templates.update.useMutation({
    onSuccess: () => {
      utils.templates.list.invalidate();
      utils.templates.get.invalidate();
      // Invalidate campaign sessions since templates may be used in campaigns
      utils.communications.campaigns.listCampaigns.invalidate();
    },
  });

  const deleteTemplateMutation = trpc.templates.delete.useMutation({
    onSuccess: () => {
      utils.templates.list.invalidate();
      // Invalidate campaign sessions since templates may be used in campaigns
      utils.communications.campaigns.listCampaigns.invalidate();
    },
  });

  /**
   * Create a new template
   * @param input The template data to create
   * @returns The created template or null if creation failed
   */
  const createTemplate = async (input: { name: string; description?: string; prompt: string; isActive?: boolean }) => {
    try {
      return await createTemplateMutation.mutateAsync(input);
    } catch (error) {
      console.error("Failed to create template:", error);
      return null;
    }
  };

  /**
   * Update an existing template
   * @param input The template data to update
   * @returns The updated template or null if update failed
   */
  const updateTemplate = async (input: {
    id: number;
    name: string;
    description?: string;
    prompt: string;
    isActive: boolean;
  }) => {
    try {
      return await updateTemplateMutation.mutateAsync(input);
    } catch (error) {
      console.error("Failed to update template:", error);
      return null;
    }
  };

  /**
   * Delete a template
   * @param id The template ID to delete
   * @returns Success result or null if deletion failed
   */
  const deleteTemplate = async (id: number) => {
    try {
      return await deleteTemplateMutation.mutateAsync({ id });
    } catch (error) {
      console.error("Failed to delete template:", error);
      return null;
    }
  };

  return {
    // Query functions
    listTemplates,
    getTemplate,

    // Mutation functions
    createTemplate,
    updateTemplate,
    deleteTemplate,

    // Loading states
    isCreatingTemplate: createTemplateMutation.isPending,
    isUpdatingTemplate: updateTemplateMutation.isPending,
    isDeletingTemplate: deleteTemplateMutation.isPending,

    // Mutation results
    createTemplateResult: createTemplateMutation.data,
    updateTemplateResult: updateTemplateMutation.data,
    deleteTemplateResult: deleteTemplateMutation.data,
  };
}
