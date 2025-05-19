"use client";

import React, { useState, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { createColumns } from "./columns";
import { useCommunications } from "@/app/hooks/use-communications";
import { Skeleton } from "@/components/ui/skeleton";
import { useSearchParams } from "next/navigation";
import { CommunicationChannel, CommunicationThreadWithDetails } from "@/app/lib/data/communications";
import { CommunicationDialog } from "./CommunicationDialog";
import { CommunicationFilters } from "./CommunicationFilters";

const DEFAULT_PAGE_SIZE = 20;

function CommunicationsContent() {
  const searchParams = useSearchParams();

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selectedThread, setSelectedThread] = useState<CommunicationThreadWithDetails | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Get filter values from URL params
  const staffId = searchParams.get("staffId");
  const donorId = searchParams.get("donorId");
  const channel = searchParams.get("channel");

  const { listThreads } = useCommunications();

  // Fetch threads based on current page, page size, and filters
  const {
    data: listThreadsResponse,
    isLoading,
    error,
  } = listThreads({
    limit: pageSize,
    offset: (currentPage - 1) * pageSize,
    staffId: staffId && staffId !== "all" ? Number(staffId) : undefined,
    donorId: donorId && donorId !== "all" ? Number(donorId) : undefined,
    channel: channel && channel !== "all" ? (channel as CommunicationChannel) : undefined,
    includeStaff: true,
    includeDonors: true,
    includeLatestMessage: true,
  });

  // Reset to first page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [staffId, donorId, channel]);

  const { threads, totalCount } = React.useMemo(() => {
    return {
      threads: listThreadsResponse?.threads
        ? listThreadsResponse.threads.map((thread) => ({
            ...thread,
            createdAt: new Date(thread.createdAt),
            updatedAt: new Date(thread.updatedAt),
            donors: thread.donors?.map((donor) => ({
              ...donor,
              donor: donor.donor
                ? {
                    ...donor.donor,
                    createdAt: new Date(donor.donor.createdAt),
                    updatedAt: new Date(donor.donor.updatedAt),
                    predictedActions: donor.donor.predictedActions !== undefined ? donor.donor.predictedActions : null,
                  }
                : undefined,
            })),
            staff: thread.staff?.map((staff) => ({
              ...staff,
              staff: staff.staff
                ? {
                    ...staff.staff,
                    createdAt: new Date(staff.staff.createdAt),
                    updatedAt: new Date(staff.staff.updatedAt),
                  }
                : undefined,
            })),
            content: thread.content?.map((msg) => ({
              ...msg,
              datetime: new Date(msg.datetime),
              createdAt: new Date(msg.createdAt),
              updatedAt: new Date(msg.updatedAt),
            })),
          }))
        : [],
      totalCount: listThreadsResponse?.totalCount || 0,
    };
  }, [listThreadsResponse]);

  const handleViewThread = (thread: CommunicationThreadWithDetails) => {
    setSelectedThread(thread);
    setDialogOpen(true);
  };

  const columns = React.useMemo(() => createColumns({ onViewThread: handleViewThread }), []);

  if (error) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-red-500">Error loading communication threads: {error.message}</div>
      </div>
    );
  }

  const pageCount = Math.ceil(totalCount / pageSize);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <>
      <title>Communications</title>
      <div className="container mx-auto py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Communications</h1>
          <Link href="/app/communications/new">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Thread
            </Button>
          </Link>
        </div>

        <CommunicationFilters
          pageSize={pageSize}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setCurrentPage(1);
          }}
        />

        {isLoading && !listThreadsResponse ? (
          <div className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={threads}
            totalItems={totalCount}
            pageSize={pageSize}
            pageCount={pageCount}
            currentPage={currentPage}
            onPageChange={handlePageChange}
          />
        )}

        <CommunicationDialog thread={selectedThread} open={dialogOpen} onOpenChange={setDialogOpen} />
      </div>
    </>
  );
}

export default function CommunicationsPage() {
  return (
    <Suspense fallback={<div className="container mx-auto py-6">Loading...</div>}>
      <CommunicationsContent />
    </Suspense>
  );
}
