"use client";

import { ErrorDisplay } from "@/app/components/ErrorDisplay";
import { LoadingSkeleton } from "@/app/components/LoadingSkeleton";
import { PageSizeSelector } from "@/app/components/PageSizeSelector";
import { useDonors } from "@/app/hooks/use-donors";
import { usePagination } from "@/app/hooks/use-pagination";
import { useSearch } from "@/app/hooks/use-search";
import { useStaffMembers } from "@/app/hooks/use-staff-members";
import { formatDonorName } from "@/app/lib/utils/donor-name-formatter";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo } from "react";
import type { Donor } from "./columns";
import { getColumns } from "./columns";

export default function DonorListPage() {
  const { searchTerm, debouncedSearchTerm, setSearchTerm } = useSearch();
  const { currentPage, pageSize, setCurrentPage, setPageSize, getOffset, getPageCount } = usePagination({
    resetOnDependency: debouncedSearchTerm,
  });

  const { listDonors, getMultipleDonorStats, updateDonorStaff } = useDonors();
  const { staffMembers } = useStaffMembers();

  const {
    data: listDonorsResponse,
    isLoading,
    error,
  } = listDonors({
    limit: pageSize,
    offset: getOffset(),
    searchTerm: debouncedSearchTerm,
    orderBy: "firstName",
    orderDirection: "asc",
  });

  // Get donation stats for all donors in the current page
  const donorIds = useMemo(() => listDonorsResponse?.donors?.map((d) => d.id) || [], [listDonorsResponse]);
  const { data: donorStats } = getMultipleDonorStats(donorIds);

  // Use useMemo to avoid re-calculating on every render unless dependencies change
  const { donors, totalCount } = useMemo(() => {
    // The API now returns { donors: [], totalCount: number }
    // The actual donor items are in listDonorsResponse.donors
    const donorItems: Donor[] =
      listDonorsResponse?.donors?.map((apiDonor) => {
        const stats = donorStats?.[apiDonor.id];
        const totalDonated = stats?.totalDonated || 0;

        return {
          id: apiDonor.id.toString(),
          name: formatDonorName(apiDonor),
          email: apiDonor.email,
          phone: apiDonor.phone || "",
          totalDonated,
          lastDonation: stats?.lastDonationDate ? new Date(stats.lastDonationDate).toISOString() : apiDonor.createdAt,
          status: "active" as const,
          currentStageName: apiDonor.currentStageName || null,
          classificationReasoning: apiDonor.classificationReasoning || null,
          predictedActions: [],
          assignedToStaffId: apiDonor.assignedToStaffId?.toString() || null,
          highPotentialDonor: (apiDonor as any).highPotentialDonor || false, // NEW: High potential donor flag
          displayName: apiDonor.displayName,
          hisTitle: apiDonor.hisTitle,
          hisFirstName: apiDonor.hisFirstName,
          hisInitial: apiDonor.hisInitial,
          hisLastName: apiDonor.hisLastName,
          herTitle: apiDonor.herTitle,
          herFirstName: apiDonor.herFirstName,
          herInitial: apiDonor.herInitial,
          herLastName: apiDonor.herLastName,
          isCouple: apiDonor.isCouple,
          firstName: apiDonor.firstName,
          lastName: apiDonor.lastName,
        };
      }) || [];
    return { donors: donorItems, totalCount: listDonorsResponse?.totalCount || 0 };
  }, [listDonorsResponse, donorStats]);

  const handleUpdateDonorStaff = useCallback(
    async (donorId: string, staffId: string | null) => {
      await updateDonorStaff(donorId, staffId);
    },
    [updateDonorStaff]
  );

  const columnsConfig = useMemo(
    () =>
      getColumns(
        () => {},
        () => false,
        staffMembers,
        handleUpdateDonorStaff
      ),
    [staffMembers, handleUpdateDonorStaff]
  );

  if (error) {
    return <ErrorDisplay error={error.message || "Unknown error"} title="Error loading donors" />;
  }

  const pageCount = getPageCount(totalCount);

  return (
    <div className="py-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold">Donor Management</h1>
        <Link href="/donors/add">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Donor
          </Button>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4">
        <Input
          placeholder="Search donors by name, email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full sm:max-w-sm"
        />
        <PageSizeSelector pageSize={pageSize} onPageSizeChange={setPageSize} />
      </div>

      {isLoading && !listDonorsResponse ? (
        <LoadingSkeleton />
      ) : (
        <DataTable
          columns={columnsConfig}
          data={donors}
          searchPlaceholder="Search donors..."
          totalItems={totalCount}
          pageSize={pageSize}
          pageCount={pageCount}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
        />
      )}
    </div>
  );
}
