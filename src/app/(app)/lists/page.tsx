"use client";

import { useLists } from "@/app/hooks/use-lists";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { usePagination } from "@/app/hooks/use-pagination";
import { useSearch } from "@/app/hooks/use-search";
import { LoadingSkeleton } from "@/app/components/LoadingSkeleton";
import { ErrorDisplay } from "@/app/components/ErrorDisplay";
import { PageSizeSelector } from "@/app/components/PageSizeSelector";
import { getColumns, type DonorListWithMemberCountFrontend } from "./columns";

export default function ListsPage() {
  const { searchTerm, debouncedSearchTerm, setSearchTerm } = useSearch();
  const { currentPage, pageSize, setCurrentPage, setPageSize, getOffset, getPageCount } = usePagination({
    resetOnDependency: debouncedSearchTerm,
  });

  const { listDonorLists } = useLists();

  const {
    data: listDonorListsResponse,
    isLoading,
    error,
  } = listDonorLists({
    limit: pageSize,
    offset: getOffset(),
    searchTerm: debouncedSearchTerm,
    orderBy: "name",
    orderDirection: "asc",
    includeMemberCount: true,
  });

  // Transform data for the table
  const { lists, totalCount } = useMemo(() => {
    const listItems: DonorListWithMemberCountFrontend[] =
      listDonorListsResponse?.lists?.map((list) => ({
        id: list.id,
        organizationId: list.organizationId,
        name: list.name,
        description: list.description,
        isActive: list.isActive,
        createdBy: list.createdBy,
        createdAt: list.createdAt,
        updatedAt: list.updatedAt,
        memberCount: list.memberCount,
      })) || [];
    return { lists: listItems, totalCount: listDonorListsResponse?.totalCount || 0 };
  }, [listDonorListsResponse]);

  const columnsConfig = useMemo(() => getColumns(), []);

  if (error) {
    return <ErrorDisplay error={error.message || "Unknown error"} title="Error loading lists" />;
  }

  const pageCount = getPageCount(totalCount);

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Donor Lists</h1>
          <p className="text-muted-foreground">
            Manage your donor lists and organize donors for targeted communications.
          </p>
        </div>
        <Link href="/lists/add">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Create List
          </Button>
        </Link>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Input
            placeholder="Search lists by name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />
          <PageSizeSelector pageSize={pageSize} onPageSizeChange={setPageSize} />
        </div>

        {isLoading ? (
          <LoadingSkeleton />
        ) : (
          <DataTable
            columns={columnsConfig}
            data={lists}
            totalItems={totalCount}
            pageSize={pageSize}
            pageCount={pageCount}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
          />
        )}

        <div className="text-sm text-muted-foreground">
          Showing {lists.length} of {totalCount} lists
        </div>
      </div>
    </div>
  );
}
