"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import Link from "next/link";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { columns, type Project } from "./columns";
import { useProjects } from "@/app/hooks/use-projects";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "use-debounce";

const PAGE_SIZE = 10;

export default function ProjectListPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTermInput, setSearchTermInput] = useState("");
  const [debouncedSearchTerm] = useDebounce(searchTermInput, 500);

  const { listProjects } = useProjects();

  // Fetch projects based on current page, page size, and debounced search term
  const {
    data: listProjectsResponse,
    isLoading,
    error,
  } = listProjects({
    limit: PAGE_SIZE,
    offset: (currentPage - 1) * PAGE_SIZE,
    searchTerm: debouncedSearchTerm,
  });

  // Reset to first page when search term changes
  useEffect(() => {
    if (debouncedSearchTerm) {
      setCurrentPage(1);
    }
  }, [debouncedSearchTerm]);

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
    return (
      <div className="container mx-auto py-6">
        <div className="text-red-500">Error loading projects: {error.message}</div>
      </div>
    );
  }

  const pageCount = Math.ceil(totalCount / PAGE_SIZE);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <>
      <title>Project Management</title>
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

        <div className="mb-4">
          <Input
            placeholder="Search projects by name or description..."
            value={searchTermInput}
            onChange={(e) => setSearchTermInput(e.target.value)}
            className="max-w-sm"
          />
        </div>

        {isLoading && !listProjectsResponse ? ( // Show skeleton only on initial load
          <div className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={projects}
            searchPlaceholder="Search projects..."
            totalItems={totalCount}
            pageSize={PAGE_SIZE}
            pageCount={pageCount}
            currentPage={currentPage}
            onPageChange={handlePageChange}
          />
        )}
      </div>
    </>
  );
}
