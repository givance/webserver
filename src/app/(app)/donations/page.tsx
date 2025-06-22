"use client";

import React, { useState, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import Link from "next/link";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { columns } from "./columns";
import { useDonations } from "@/app/hooks/use-donations";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "use-debounce";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSearchParams, useRouter } from "next/navigation";
import { formatDonorName } from "@/app/lib/utils/donor-name-formatter";

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

function DonationsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(DEFAULT_PAGE_SIZE);
  const [searchTermInput, setSearchTermInput] = useState("");
  const [debouncedSearchTerm] = useDebounce(searchTermInput, 500);

  // Get filter values from URL params
  const donorId = searchParams.get("donorId") ? Number(searchParams.get("donorId")) : undefined;
  const projectId = searchParams.get("projectId") ? Number(searchParams.get("projectId")) : undefined;

  const { list: listDonations } = useDonations();

  // Fetch donations based on current page, page size, and filters
  const {
    data: listDonationsResponse,
    isLoading,
    error,
  } = listDonations({
    limit: pageSize,
    offset: (currentPage - 1) * pageSize,
    donorId,
    projectId,
    includeDonor: true,
    includeProject: true,
  });

  // Reset to first page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [donorId, projectId]);

  const { donations, totalCount } = React.useMemo(() => {
    return {
      donations: listDonationsResponse?.donations
        ? listDonationsResponse.donations.map((donation) => ({
            ...donation,
            date: new Date(donation.date),
            createdAt: new Date(donation.createdAt),
            updatedAt: new Date(donation.updatedAt),
            donor: donation.donor
              ? {
                  ...donation.donor,
                  createdAt: new Date(donation.donor.createdAt),
                  updatedAt: new Date(donation.donor.updatedAt),
                  predictedActions:
                    donation.donor.predictedActions !== undefined ? donation.donor.predictedActions : null,
                }
              : undefined,
            project: donation.project
              ? {
                  ...donation.project,
                  createdAt: new Date(donation.project.createdAt),
                  updatedAt: new Date(donation.project.updatedAt),
                }
              : undefined,
          }))
        : [],
      totalCount: listDonationsResponse?.totalCount || 0,
    };
  }, [listDonationsResponse]);

  if (error) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-red-500">Error loading donations: {error.message}</div>
      </div>
    );
  }

  const pageCount = Math.ceil(totalCount / pageSize);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Clear filters
  const clearFilters = () => {
    router.push("/donations");
  };

  return (
    <>
      <title>Donations</title>
      <div className="container mx-auto py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Donations</h1>
          <Link href="/donations/add">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Donation
            </Button>
          </Link>
        </div>

        <div className="flex items-center gap-4 mb-4 flex-wrap">
          {/* Show active filters */}
          {(donorId || projectId) && (
            <div className="flex items-center gap-2 w-full mb-4">
              <span className="text-sm text-muted-foreground">Active filters:</span>
              {donorId && donations[0]?.donor && (
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Donor: {donations[0].donor.firstName} {donations[0].donor.lastName} ×
                </Button>
              )}
              {projectId && (
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Project: {donations[0]?.project?.name} ×
                </Button>
              )}
            </div>
          )}

          <Select
            value={pageSize.toString()}
            onValueChange={(value) => {
              setPageSize(Number(value) as typeof pageSize);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select page size" />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={size.toString()}>
                  {size} items per page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading && !listDonationsResponse ? (
          <div className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={donations}
            totalItems={totalCount}
            pageSize={pageSize}
            pageCount={pageCount}
            currentPage={currentPage}
            onPageChange={handlePageChange}
            onPageSizeChange={(size) => {
              setPageSize(size as typeof pageSize);
              setCurrentPage(1);
            }}
          />
        )}
      </div>
    </>
  );
}

export default function DonationsPage() {
  return (
    <Suspense fallback={<div className="container mx-auto py-6">Loading...</div>}>
      <DonationsContent />
    </Suspense>
  );
}
