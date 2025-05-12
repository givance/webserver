"use client";

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { columns, type Communication } from "./columns";
import { useCommunications } from "@/app/hooks/use-communications";
import { Skeleton } from "@/components/ui/skeleton";

export default function CommunicationListPage() {
  const { listThreads } = useCommunications();
  const {
    data: threads,
    isLoading,
    error,
  } = listThreads({
    includeStaff: true,
    includeDonors: true,
    includeLatestMessage: true,
  });

  if (error) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-red-500">Error loading communications: {error.message}</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Communication Management</h1>
        <Link href="/communications/add">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Communication
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
        <DataTable
          columns={columns}
          data={threads || []}
          searchKey="subject"
          searchPlaceholder="Search communications..."
        />
      )}
    </div>
  );
}
