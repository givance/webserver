"use client";

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { columns, type Donation } from "./columns";
import { useDonations } from "@/app/hooks/use-donations";
import { Skeleton } from "@/components/ui/skeleton";

export default function DonationListPage({ searchParams }: { searchParams: { donor?: string; project?: string } }) {
  const context = searchParams.donor
    ? `for donor ${searchParams.donor}`
    : searchParams.project
    ? `for project ${searchParams.project}`
    : "all";

  const { listDonations } = useDonations();
  const {
    data: donations,
    isLoading,
    error,
  } = listDonations({
    donorId: searchParams.donor ? parseInt(searchParams.donor) : undefined,
    projectId: searchParams.project ? parseInt(searchParams.project) : undefined,
  });

  if (error) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-red-500">Error loading donations: {error.message}</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Donations {context}</h1>
        <Link
          href={`/donations/add${
            searchParams.donor
              ? `?donor=${searchParams.donor}`
              : searchParams.project
              ? `?project=${searchParams.project}`
              : ""
          }`}
        >
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Donation
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
          data={donations || []}
          searchKey="donorName"
          searchPlaceholder="Search by donor name..."
        />
      )}
    </div>
  );
}
