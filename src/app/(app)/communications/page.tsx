"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import Link from "next/link";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { createColumns } from "./columns";
import { useCommunications } from "@/app/hooks/use-communications";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "use-debounce";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSearchParams, useRouter } from "next/navigation";
import { CommunicationChannel, CommunicationThreadWithDetails } from "@/app/lib/data/communications";
import { CommunicationDialog } from "./CommunicationDialog";

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export default function CommunicationsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(DEFAULT_PAGE_SIZE);
  const [searchTermInput, setSearchTermInput] = useState("");
  const [debouncedSearchTerm] = useDebounce(searchTermInput, 500);

  // Get filter values from URL params
  const staffId = searchParams.get("staffId") ? Number(searchParams.get("staffId")) : undefined;
  const donorId = searchParams.get("donorId") ? Number(searchParams.get("donorId")) : undefined;
  const channel = searchParams.get("channel") ? (searchParams.get("channel") as CommunicationChannel) : undefined;

  const { listCommunicationThreads } = useCommunications();

  const [selectedThread, setSelectedThread] = useState<CommunicationThreadWithDetails | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Fetch threads based on current page, page size, and filters
  const {
    data: listThreadsResponse,
    isLoading,
    error,
  } = listCommunicationThreads({
    limit: pageSize,
    offset: (currentPage - 1) * pageSize,
    staffId,
    donorId,
    channel,
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
      threads: listThreadsResponse?.threads || [],
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

  // Clear filters
  const clearFilters = () => {
    router.push("/app/communications");
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

        <div className="flex items-center gap-4 mb-4 flex-wrap">
          {/* Show active filters */}
          {(staffId || donorId || channel) && (
            <div className="flex items-center gap-2 w-full mb-4">
              <span className="text-sm text-muted-foreground">Active filters:</span>
              {staffId && (
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Staff: {threads[0]?.staff?.find((s) => s.staffId === staffId)?.staff?.firstName}{" "}
                  {threads[0]?.staff?.find((s) => s.staffId === staffId)?.staff?.lastName} ×
                </Button>
              )}
              {donorId && (
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Donor: {threads[0]?.donors?.find((d) => d.donorId === donorId)?.donor?.firstName}{" "}
                  {threads[0]?.donors?.find((d) => d.donorId === donorId)?.donor?.lastName} ×
                </Button>
              )}
              {channel && (
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Channel: {channel} ×
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
