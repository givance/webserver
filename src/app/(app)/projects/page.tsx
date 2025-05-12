"use client";

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { columns, type Project } from "./columns";
import { useProjects } from "@/app/hooks/use-projects";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProjectListPage() {
  const { listProjects } = useProjects();
  const { data: projectsData, isLoading, error } = listProjects({});

  if (error) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-red-500">Error loading projects: {error.message}</div>
      </div>
    );
  }

  // Transform project data to match the Project type
  const projects: Project[] =
    projectsData?.map((project) => ({
      id: project.id.toString(),
      name: project.name,
      description: project.description || "",
      status: project.active ? "active" : "completed", // Assuming 'active' field determines status
      goalAmount: 0, // This would ideally come from a project aggregate query
      raisedAmount: 0, // This would ideally come from a project aggregate query
      startDate: project.createdAt, // Using createdAt as a fallback
      endDate: new Date().toISOString(), // Placeholder - should be replaced with actual end date
    })) || [];

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Project Management</h1>
        <Link href="/projects/add">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Project
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <DataTable columns={columns} data={projects} searchKey="name" searchPlaceholder="Search projects..." />
      )}
    </div>
  );
}
