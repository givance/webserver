"use client";

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { columns, type Donor } from "./columns";
import { useDonors } from "@/app/hooks/use-donors";
import { Skeleton } from "@/components/ui/skeleton";

export default function DonorListPage() {
  const { listDonors } = useDonors();
  const { data: donors, isLoading, error } = listDonors({});

  if (error) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-red-500">Error loading donors: {error.message}</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Donor Management</h1>
        <Link href="/donors/add">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Donor
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
        <DataTable columns={columns} data={donors || []} searchKey="name" searchPlaceholder="Search donors..." />
      )}
    </div>
  );
}
