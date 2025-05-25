"use client";

import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import Link from "next/link";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { columns, type Project } from "./columns";
import { useProjects } from "@/app/hooks/use-projects";
import { usePagination } from "@/app/hooks/use-pagination";
import { useSearch } from "@/app/hooks/use-search";
import { LoadingSkeleton } from "@/app/components/LoadingSkeleton";
import { ErrorDisplay } from "@/app/components/ErrorDisplay";
import { PageSizeSelector } from "@/app/components/PageSizeSelector";
import { CommunicateButton } from "@/components/communicate/CommunicateButton";

export default function ProjectListPage() {
  const { searchTerm, debouncedSearchTerm, setSearchTerm } = useSearch();
  const { currentPage, pageSize, setCurrentPage, setPageSize, getOffset, getPageCount } = usePagination({
    resetOnDependency: debouncedSearchTerm,
  });

  const { listProjects } = useProjects();

  // Fetch projects based on current page, page size, and debounced search term
  const {
    data: listProjectsResponse,
    isLoading,
    error,
  } = listProjects({
    limit: pageSize,
    offset: getOffset(),
    searchTerm: debouncedSearchTerm,
  });

  // Use useMemo to avoid re-calculating on every render unless dependencies change
  const { projects, totalCount } = useMemo(() => {
    const projectItems: Project[] =
      listProjectsResponse?.projects?.map((apiProject) => ({
        id: apiProject.id.toString(),
        name: apiProject.name,
        description: apiProject.description || "",
        status: apiProject.active ? "active" : "completed",
        goalAmount: 0, // Placeholder - ensure this is handled if real data is available
        raisedAmount: 0, // Placeholder - ensure this is handled if real data is available
        startDate: apiProject.createdAt ? new Date(apiProject.createdAt).toISOString() : new Date().toISOString(),
        endDate: new Date().toISOString(), // Placeholder - should be replaced with actual end date if available
      })) || [];
    return { projects: projectItems, totalCount: listProjectsResponse?.totalCount || 0 };
  }, [listProjectsResponse]);

  if (error) {
    return <ErrorDisplay error={error.message || "Unknown error"} title="Error loading projects" />;
  }

  const pageCount = getPageCount(totalCount);

  return (
    <>
      <title>Project Management</title>
      <div className="container mx-auto py-6">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold">Project Management</h1>
            <CommunicateButton />
          </div>
          <Link href="/projects/add">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Project
            </Button>
          </Link>
        </div>

        <div className="flex items-center gap-4 mb-4">
          <Input
            placeholder="Search projects by name or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />
          <PageSizeSelector pageSize={pageSize} onPageSizeChange={setPageSize} />
        </div>

        {isLoading && !listProjectsResponse ? (
          <LoadingSkeleton />
        ) : (
          <DataTable
            columns={columns}
            data={projects}
            searchPlaceholder="Search projects..."
            totalItems={totalCount}
            pageSize={pageSize}
            pageCount={pageCount}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
          />
        )}
      </div>
    </>
  );
}
