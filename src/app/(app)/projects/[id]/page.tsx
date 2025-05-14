"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useProjects } from "@/app/hooks/use-projects";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ProjectForm } from "../_components/project-form";
import { ProjectDonations } from "../_components/project-donations";

export default function ProjectDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = parseInt(params.id as string);
  const { getProjectById, updateProject, deleteProject } = useProjects();
  const [isEditing, setIsEditing] = useState(false);

  // Query for project data
  const { data: project, isLoading, error } = getProjectById({ id: projectId });

  useEffect(() => {
    if (error) {
      toast.error("Failed to load project");
    }
  }, [error]);

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this project?")) {
      return;
    }

    const success = await deleteProject(projectId);
    if (success) {
      toast.success("Project deleted successfully");
      router.push("/projects");
    } else {
      toast.error("Failed to delete project");
    }
  };

  const handleUpdate = async (formData: any) => {
    try {
      const result = await updateProject({
        id: projectId,
        ...formData,
      });

      if (result) {
        toast.success("Project updated successfully");
        setIsEditing(false);
      } else {
        toast.error("Failed to update project");
      }
    } catch (err) {
      console.error("Error updating project:", err);
      toast.error("An unexpected error occurred");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-[200px]" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-[150px]" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center">
        <h2 className="text-2xl font-bold">Project not found</h2>
        <p className="mt-2 text-muted-foreground">
          The project you&apos;re looking for doesn&apos;t exist or you don&apos;t have permission to view it.
        </p>
        <Button className="mt-4" onClick={() => router.push("/projects")}>
          Back to Projects
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{project.name}</h1>
        <div className="space-x-2">
          <Button variant="outline" onClick={() => setIsEditing(!isEditing)}>
            {isEditing ? "Cancel" : "Edit"}
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            Delete
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{isEditing ? "Edit Project" : "Project Details"}</CardTitle>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <ProjectForm
              defaultValues={{
                name: project.name,
                description: project.description || undefined,
                active: project.active,
                goal: project.goal || undefined,
                tags: project.tags || [],
              }}
              onSubmit={handleUpdate}
              submitLabel="Update Project"
            />
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="font-medium">Description</h3>
                <p className="text-muted-foreground">{project.description || "No description provided"}</p>
              </div>
              <div>
                <h3 className="font-medium">Status</h3>
                <p className="text-muted-foreground">{project.active ? "Active" : "Inactive"}</p>
              </div>
              {project.goal && (
                <div>
                  <h3 className="font-medium">Goal</h3>
                  <p className="text-muted-foreground">${project.goal.toLocaleString()}</p>
                </div>
              )}
              {project.tags && project.tags.length > 0 && (
                <div>
                  <h3 className="font-medium">Tags</h3>
                  <div className="flex flex-wrap gap-2">
                    {project.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-primary/10 px-2 py-1 text-sm text-primary">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {!isEditing && <ProjectDonations projectId={projectId} />}
    </div>
  );
}
