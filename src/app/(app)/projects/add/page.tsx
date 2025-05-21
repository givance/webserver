"use client";

import { useRouter } from "next/navigation";
import { useProjects } from "@/app/hooks/use-projects";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import type { Metadata } from "next";
import { ProjectForm, type ProjectFormValues } from "../_components/project-form"; // Import ProjectForm and its types

export const metadata: Metadata = {
  title: "Add New Project",
};

export default function AddProjectPage() {
  const { createProject, isCreating } = useProjects();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  /**
   * Handles form submission
   * Creates a new project and redirects to project list on success
   * @param data Form values from the ProjectForm component
   */
  const onSubmit = async (data: ProjectFormValues) => {
    setError(null);
    try {
      // Map ProjectFormValues to the input expected by createProject
      // Note: startDate and endDate fields are not part of ProjectFormValues
      // and thus won't be sent from this form using the current ProjectForm.
      // The `goal` field from ProjectFormValues is optional; ensure it's 0 if undefined,
      // or handle as per API requirements.
      const projectInputForApi = {
        name: data.name,
        description: data.description,
        active: data.active,
        goal: data.goal ?? 0,
        tags: data.tags,
        organizationId: "", // Explicitly add organizationId
      };

      const result = await createProject(projectInputForApi);

      if (result) {
        toast.success("Project created successfully");
        router.push("/projects");
      } else {
        // This path might not be hit if createProject throws on failure.
        // Error handling in useProjects hook might already show a toast.
        setError("Failed to create project. The result from createProject was falsy.");
        toast.error("Failed to create project.");
      }
    } catch (err: any) {
      const message = err.message || "An unexpected error occurred while creating the project.";
      setError(message);
      // Avoid double toasting if useProjects hook already handles it.
      // toast.error(message);
      console.error("Error creating project:", err);
    }
  };

  return (
    <>
      {/* <title>Add New Project</title> */}
      <div className="container mx-auto py-6">
        <div className="flex items-center mb-6">
          <Link href="/projects" className="mr-4">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Add New Project</h1>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 p-4 mb-4 rounded">{error}</div>}

        <div className="bg-white p-6 shadow rounded-lg max-w-2xl">
          <ProjectForm
            onSubmit={onSubmit}
            submitLabel="Create Project"
            // defaultValues can be passed if needed, e.g., for active: true
            defaultValues={{
              active: true,
              tags: [],
              // Other fields will use their defaults from ProjectForm's schema
            }}
          />
          {/* The submit button is now part of ProjectForm, but if you need an external one: */}
          {/* <div className="flex justify-end mt-6">
            <Button type="button" onClick={() => form.handleSubmit(onSubmit)()} disabled={isCreating || form.formState.isSubmitting}>
              {isCreating || form.formState.isSubmitting ? "Creating..." : "Create Project"}
            </Button>
          </div> */}
        </div>
      </div>
    </>
  );
}
