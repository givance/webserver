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
  const { data: projects, isLoading, error } = listProjects({});

  if (error) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-red-500">Error loading projects: {error.message}</div>
      </div>
    );
  }

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
        <DataTable columns={columns} data={projects || []} searchKey="name" searchPlaceholder="Search projects..." />
      )}
    </div>
  );
}
