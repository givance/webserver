"use client";

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { columns, type Staff } from "./columns";
import { useStaff } from "@/app/hooks/use-staff";
import { Skeleton } from "@/components/ui/skeleton";

export default function StaffListPage() {
  const { listStaff } = useStaff();
  const { data: staff, isLoading, error } = listStaff({});

  if (error) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-red-500">Error loading staff: {error.message}</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Staff Management</h1>
        <Link href="/staff/add">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Staff
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
        <DataTable columns={columns} data={staff || []} searchKey="name" searchPlaceholder="Search staff..." />
      )}
    </div>
  );
}
