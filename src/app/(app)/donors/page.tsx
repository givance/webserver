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
import { DataTable } from "@/components/ui/data-table/DataTable";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Plus, Search, Info, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useBulkDonorResearch } from "@/app/hooks/use-bulk-donor-research";
import type { Donor } from "./columns";
import { getColumns } from "./columns";
import { toast } from "sonner";

const isDevelopment = process.env.NODE_ENV === "development";

export default function DonorListPage() {
  const { searchTerm, debouncedSearchTerm, setSearchTerm } = useSearch();

  // Add state for sorting
  const [sortField, setSortField] = useState<"firstName" | "lastName" | "email" | "createdAt" | "totalDonated">(
    "firstName"
  );
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Reset pagination state when sorting or searched term changes
  const { currentPage, pageSize, setCurrentPage, setPageSize, getOffset, getPageCount } = usePagination({
    resetOnDependency: [debouncedSearchTerm, sortField, sortDirection],
  });

  // Add state for the researched donors filter
  const [onlyResearched, setOnlyResearched] = useState(false);

  // Environment-based delete dialog states
  const [isDeleteAllDialogOpen, setIsDeleteAllDialogOpen] = useState(false);
  const [isDeleteListDialogOpen, setIsDeleteListDialogOpen] = useState(false);

  const { listDonors, getMultipleDonorStats, updateDonorStaff, bulkDeleteDonors, getAllDonorIds, isBulkDeleting } =
    useDonors();
  const { staffMembers } = useStaffMembers();
  const { startBulkResearch, researchStatistics, isStartingResearch, isLoadingStatistics } = useBulkDonorResearch();

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [donorCount, setDonorCount] = useState<string>("");

  // Get all donor IDs for bulk operations (called at top level)
  const allDonorIdsQuery = getAllDonorIds();

  const {
    data: listDonorsResponse,
    isLoading,
    error,
  } = listDonors({
    limit: pageSize,
    offset: getOffset(),
    searchTerm: debouncedSearchTerm,
    orderBy: sortField,
    orderDirection: sortDirection,
    onlyResearched, // Add the filter parameter
  });

  // Get donation stats for all donors in the current page
  const donorIds = useMemo(() => listDonorsResponse?.donors?.map((d) => d.id) || [], [listDonorsResponse]);
  const { data: donorStats } = getMultipleDonorStats(donorIds, !isBulkDeleting && donorIds.length > 0);

  // Handler for when the DataTable sorting changes
  const handleSortingChange = useCallback(
    (sorting: { id: string; desc: boolean }[]) => {
      if (sorting.length > 0) {
        const sort = sorting[0];
        let newSortField: typeof sortField = "firstName";

        // Map table column IDs to backend field names
        switch (sort.id) {
          case "name":
            newSortField = "firstName";
            break;
          case "email":
            newSortField = "email";
            break;
          case "totalDonated":
            newSortField = "totalDonated";
            break;
          case "lastDonation":
            newSortField = "createdAt"; // fallback to createdAt for last donation
            break;
          default:
            newSortField = "firstName";
        }

        const newSortDirection = sort.desc ? "desc" : "asc";

        // Only update if sorting actually changed
        if (newSortField !== sortField || newSortDirection !== sortDirection) {
          setSortField(newSortField);
          setSortDirection(newSortDirection);
          // Pagination will reset automatically due to dependency changes
        }
      }
    },
    [sortField, sortDirection]
  );

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
          highPotentialDonorRationale: (apiDonor as any).highPotentialDonorRationale || null, // NEW: Rationale from research
          notes: apiDonor.notes || null, // Add notes field
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

  const handleStartResearch = async () => {
    const count = parseInt(donorCount);
    if (count > 0) {
      // Start research with the specified limit
      await startBulkResearch(undefined, count);
      setIsDialogOpen(false);
      setDonorCount("");
    }
  };

  // Handle delete all donors (dev environment)
  const handleDeleteAll = async () => {
    if (!isDevelopment) return;

    // Use the data from the hook called at top level
    const allDonorIds = allDonorIdsQuery.data || [];

    if (allDonorIds.length === 0) {
      toast.error("No donors found to delete");
      return;
    }

    const result = await bulkDeleteDonors(allDonorIds);
    if (result) {
      setIsDeleteAllDialogOpen(false);
    }
  };

  // Handle delete list (prod environment) - placeholder for now
  const handleDeleteList = async () => {
    if (isDevelopment) return;

    // TODO: Implement list-specific deletion logic
    // This would need to delete all donors in a specific list
    // while preserving donors that are in other lists
    console.log("Delete list functionality not yet implemented");
    setIsDeleteListDialogOpen(false);
  };

  const handleConfirmDeleteAll = () => {
    setIsDeleteAllDialogOpen(true);
  };

  const handleConfirmDeleteList = () => {
    setIsDeleteListDialogOpen(true);
  };

  if (error) {
    return <ErrorDisplay error={error.message || "Unknown error"} title="Error loading donors" />;
  }

  const pageCount = getPageCount(totalCount);

  return (
    <div className="py-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">Donor Management</h1>
          {researchStatistics && !isLoadingStatistics && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="w-4 h-4" />
              <span>
                Research Progress: {researchStatistics.researchedDonors} of {researchStatistics.totalDonors} donors
                researched ({researchStatistics.researchPercentage}%)
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={researchStatistics?.unresearchedDonors === 0} variant="outline">
                <Search className="w-4 h-4 mr-2" />
                Research Donors
                {researchStatistics?.unresearchedDonors > 0 && (
                  <span className="ml-1 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                    {researchStatistics.unresearchedDonors}
                  </span>
                )}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Start Donor Research</DialogTitle>
                <DialogDescription>
                  Choose how many donors to research. We&apos;ll start with the oldest unresearched donors first.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="donorCount" className="text-right">
                    Number of donors
                  </Label>
                  <Input
                    id="donorCount"
                    type="number"
                    min="1"
                    max={researchStatistics?.unresearchedDonors || 1000}
                    value={donorCount}
                    onChange={(e) => setDonorCount(e.target.value)}
                    placeholder="e.g. 100"
                    className="col-span-3"
                  />
                </div>
                <div className="flex gap-2 justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setDonorCount("10")}
                    disabled={!researchStatistics || researchStatistics.unresearchedDonors < 10}
                  >
                    10
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setDonorCount("50")}
                    disabled={!researchStatistics || researchStatistics.unresearchedDonors < 50}
                  >
                    50
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setDonorCount("100")}
                    disabled={!researchStatistics || researchStatistics.unresearchedDonors < 100}
                  >
                    100
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setDonorCount(researchStatistics?.unresearchedDonors?.toString() || "0")}
                    disabled={!researchStatistics || researchStatistics.unresearchedDonors === 0}
                  >
                    All ({researchStatistics?.unresearchedDonors || 0})
                  </Button>
                </div>
                {researchStatistics && (
                  <div className="text-sm text-muted-foreground">
                    {researchStatistics.unresearchedDonors} donors available for research
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button
                  type="submit"
                  onClick={handleStartResearch}
                  disabled={
                    !donorCount ||
                    parseInt(donorCount) <= 0 ||
                    parseInt(donorCount) > (researchStatistics?.unresearchedDonors || 0) ||
                    isStartingResearch
                  }
                >
                  {isStartingResearch ? "Starting..." : "Start Research"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Environment-based delete buttons */}
          {isDevelopment ? (
            <Button
              variant="destructive"
              onClick={handleConfirmDeleteAll}
              disabled={isBulkDeleting || totalCount === 0}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {isBulkDeleting ? "Deleting..." : `Delete All (${totalCount})`}
            </Button>
          ) : (
            <Button variant="destructive" onClick={handleConfirmDeleteList} disabled={isBulkDeleting}>
              <Trash2 className="w-4 h-4 mr-2" />
              {isBulkDeleting ? "Deleting..." : "Delete List"}
            </Button>
          )}

          <Link href="/donors/add">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Donor
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search donors..."
            className="w-full pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Add the checkbox for researched donors */}
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="only-researched"
            checked={onlyResearched}
            onChange={(e) => setOnlyResearched(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          <label htmlFor="only-researched" className="text-sm font-medium">
            Show only researched donors
          </label>
        </div>

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
          onSortingChange={handleSortingChange}
        />
      )}

      {/* Delete All confirmation dialog (Dev environment) */}
      <AlertDialog open={isDeleteAllDialogOpen} onOpenChange={setIsDeleteAllDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete All Donors</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete all <strong>{totalCount}</strong> donors? This will permanently delete all
              donors and their associated data including donations, communications, and research records.
              <br />
              <br />
              <strong>This action cannot be undone.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAll}
              disabled={isBulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isBulkDeleting ? "Deleting..." : `Delete All ${totalCount} Donors`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete List confirmation dialog (Prod environment) */}
      <AlertDialog open={isDeleteListDialogOpen} onOpenChange={setIsDeleteListDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete List Donors</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete all donors that belong only to the selected list, while preserving donors that are in
              other lists. This feature is not yet implemented - please contact support if you need this functionality.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteList}
              className="bg-red-500 hover:bg-red-700 focus:ring-red-500"
              disabled={isBulkDeleting}
            >
              {isBulkDeleting ? "Deleting..." : "Delete List Donors"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
