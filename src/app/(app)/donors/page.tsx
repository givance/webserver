"use client";

import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { columns, type Donor } from "./columns";
import { useDonors } from "@/app/hooks/use-donors";
import { Skeleton } from "@/components/ui/skeleton";

const PAGE_SIZE = 10;

export default function DonorListPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const { listDonors } = useDonors();

  const {
    data: listDonorsResponse,
    isLoading,
    error,
  } = listDonors({
    limit: PAGE_SIZE,
    offset: (currentPage - 1) * PAGE_SIZE,
  });

  if (error) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-red-500">Error loading donors: {error.message}</div>
      </div>
    );
  }

  const { donors, totalCount } = useMemo(() => {
    // The API now returns { donors: [], totalCount: number }
    // The actual donor items are in listDonorsResponse.donors
    const donorItems: Donor[] =
      listDonorsResponse?.donors?.map((apiDonor) => ({
        id: apiDonor.id.toString(),
        name: `${apiDonor.firstName} ${apiDonor.lastName}`,
        email: apiDonor.email,
        phone: apiDonor.phone || "",
        totalDonated: 0, // Placeholder - This would ideally come from an aggregate query
        lastDonation: apiDonor.createdAt ? new Date(apiDonor.createdAt).toISOString() : new Date().toISOString(), // Using createdAt as a fallback, ensure it's a string
        status: "active", // Placeholder - Assuming all donors are active by default or map from apiDonor if available
      })) || [];
    return { donors: donorItems, totalCount: listDonorsResponse?.totalCount || 0 };
  }, [listDonorsResponse]);

  const pageCount = Math.ceil(totalCount / PAGE_SIZE);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

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

      {isLoading && !listDonorsResponse ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={donors}
          searchKey="name"
          searchPlaceholder="Search donors..."
          // Pagination props
          totalItems={totalCount}
          pageSize={PAGE_SIZE}
          pageCount={pageCount}
          currentPage={currentPage}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  );
}
