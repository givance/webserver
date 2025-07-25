"use client";

import { ErrorDisplay } from "@/app/components/ErrorDisplay";
import { LoadingSkeleton } from "@/app/components/LoadingSkeleton";
import { PageSizeSelector } from "@/app/components/PageSizeSelector";
import { useDonors } from "@/app/hooks/use-donors";
import { usePagination } from "@/app/hooks/use-pagination";
import { useSearch } from "@/app/hooks/use-search";
import { useStaff } from "@/app/hooks/use-staff";
import { useLists } from "@/app/hooks/use-lists";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Info, Users2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBulkDonorResearch } from "@/app/hooks/use-bulk-donor-research";
import type { Donor } from "./columns";
import { getColumns } from "./columns";
import { toast } from "sonner";

export default function DonorListPage() {
  const { searchTerm, debouncedSearchTerm, setSearchTerm } = useSearch();

  // Add state for sorting
  const [sortField, setSortField] = useState<"firstName" | "lastName" | "email" | "createdAt" | "totalDonated">(
    "firstName"
  );
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Add state for filters
  const [onlyResearched, setOnlyResearched] = useState(false);
  const [selectedListId, setSelectedListId] = useState<number | undefined>(undefined);
  const [notInAnyList, setNotInAnyList] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState<number | null | undefined>(undefined);

  // Add state for row selection
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [isCreateListDialogOpen, setIsCreateListDialogOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [isSelectingAllFiltered, setIsSelectingAllFiltered] = useState(false);
  const [isBulkStaffDialogOpen, setIsBulkStaffDialogOpen] = useState(false);
  const [selectedBulkStaffId, setSelectedBulkStaffId] = useState<string>("");

  // Reset pagination state when sorting or searched term changes
  const { currentPage, pageSize, setCurrentPage, setPageSize, getOffset, getPageCount, resetToFirstPage } =
    usePagination({
      resetOnDependency: debouncedSearchTerm,
    });

  // Reset pagination when filters/sorting change
  const prevFiltersRef = useRef({
    sortField,
    sortDirection,
    onlyResearched,
    selectedListId,
    notInAnyList,
    selectedStaffId,
  });
  useEffect(() => {
    const prev = prevFiltersRef.current;
    const current = { sortField, sortDirection, onlyResearched, selectedListId, notInAnyList, selectedStaffId };

    // Only reset if values actually changed (not just on re-render)
    if (
      prev.sortField !== current.sortField ||
      prev.sortDirection !== current.sortDirection ||
      prev.onlyResearched !== current.onlyResearched ||
      prev.selectedListId !== current.selectedListId ||
      prev.notInAnyList !== current.notInAnyList ||
      prev.selectedStaffId !== current.selectedStaffId
    ) {
      setCurrentPage(1);
      // Clear selection when filters change
      setRowSelection({});
      setIsSelectingAllFiltered(false);
      prevFiltersRef.current = current;
    }
  }, [sortField, sortDirection, onlyResearched, selectedListId, notInAnyList, selectedStaffId, setCurrentPage]);


  const { listDonors, getMultipleDonorStats, updateDonorStaff, getAllDonorIds, bulkUpdateDonorStaff, isBulkUpdatingStaff } =
    useDonors();
  const { getStaffMembers } = useStaff();
  const { staffMembers } = getStaffMembers();
  const { listDonorLists, createList, addDonorsToList, isCreating, isAddingDonors } = useLists();

  // Get lists for the filter dropdown
  const { data: lists } = listDonorLists();
  const { startBulkResearch, researchStatistics, isStartingResearch, isLoadingStatistics } = useBulkDonorResearch();

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [donorCount, setDonorCount] = useState<string>("");

  // Get all donor IDs for bulk operations (called at top level)
  const allDonorIdsQuery = getAllDonorIds();

  // Get filtered donor IDs for select all functionality
  const filteredDonorIdsQuery = getAllDonorIds({
    searchTerm: debouncedSearchTerm,
    listId: selectedListId,
    notInAnyList,
    onlyResearched,
    assignedToStaffId: selectedStaffId,
  });

  const queryParams = {
    limit: pageSize,
    offset: getOffset(),
    searchTerm: debouncedSearchTerm,
    orderBy: sortField,
    orderDirection: sortDirection,
    onlyResearched,
    listId: selectedListId,
    notInAnyList,
    assignedToStaffId: selectedStaffId,
  };

  const { data: listDonorsResponse, isLoading, error } = listDonors(queryParams);

  // Get donation stats for all donors in the current page
  const donorIds = useMemo(() => listDonorsResponse?.donors?.map((d) => d.id) || [], [listDonorsResponse]);
  const { data: donorStats } = getMultipleDonorStats(donorIds, donorIds.length > 0);

  // Handler for when the DataTable sorting changes
  const handleSortingChange = useCallback(
    (sorting: { id: string; desc: boolean }[]) => {
      if (sorting.length > 0) {
        const sort = sorting[0];
        let newSortField: typeof sortField = "firstName";

        // Map table column IDs to backend field names
        switch (sort.id) {
          case "name":
            newSortField = "firstName"; // Note: Backend still sorts by firstName for consistency
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
            newSortField = "firstName"; // Note: Backend still sorts by firstName for consistency
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

  const handlePageSizeChange = useCallback(
    (size: number) => {
      // Cast to PageSize union type since DataTable uses standard numbers
      setPageSize(size as 10 | 20 | 50 | 100);
    },
    [setPageSize]
  );

  const handlePageChange = useCallback(
    (page: number) => {
      setCurrentPage(page);
    },
    [setCurrentPage]
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


  // Handler for creating list from selected donors
  const handleCreateListFromSelected = async () => {
    if (!newListName.trim()) {
      toast.error("Please enter a list name");
      return;
    }

    const selectedDonorIds = Object.keys(rowSelection)
      .filter((id) => rowSelection[id])
      .map((id) => parseInt(id));
    if (selectedDonorIds.length === 0) {
      toast.error("Please select at least one donor");
      return;
    }

    try {
      // Create the list first
      const newList = await createList({
        name: newListName.trim(),
        description: `Created from ${selectedDonorIds.length} selected donors`,
      });

      // Then add the selected donors to the list
      await addDonorsToList(newList.id, selectedDonorIds);

      setNewListName("");
      setRowSelection({});
      setIsCreateListDialogOpen(false);
      toast.success(`Created list "${newList.name}" with ${selectedDonorIds.length} donors`);
    } catch (error) {
      console.error("Failed to create list:", error);
      toast.error("Failed to create list");
    }
  };

  // Handler for bulk updating staff assignment
  const handleBulkUpdateStaff = async () => {
    const selectedDonorIds = Object.keys(rowSelection)
      .filter((id) => rowSelection[id])
      .map((id) => parseInt(id));
    
    if (selectedDonorIds.length === 0) {
      toast.error("Please select at least one donor");
      return;
    }

    const staffId = selectedBulkStaffId === "unassigned" ? null : parseInt(selectedBulkStaffId);
    
    try {
      await bulkUpdateDonorStaff(selectedDonorIds, staffId);
      setIsBulkStaffDialogOpen(false);
      setSelectedBulkStaffId("");
      setRowSelection({});
      setIsSelectingAllFiltered(false);
    } catch (error) {
      console.error("Failed to bulk update staff:", error);
    }
  };

  // Get count of selected donors
  const selectedCount = Object.values(rowSelection).filter(Boolean).length;

  // Handle select all functionality
  const handleSelectAll = async () => {
    if (isSelectingAllFiltered || selectedCount > 0) {
      // Deselect all
      setRowSelection({});
      setIsSelectingAllFiltered(false);
    } else {
      // Select all matching donors (not just current page)
      try {
        console.log("Fetching filtered donor IDs for select all...");
        const refetchResult = await filteredDonorIdsQuery.refetch();

        // Access data from the refetch result, not the query object
        const allMatchingIds = refetchResult.data || [];
        console.log("Filtered donor IDs for selection:", allMatchingIds.length, allMatchingIds);

        const newSelection: Record<string, boolean> = {};
        allMatchingIds.forEach((id) => {
          newSelection[id.toString()] = true;
        });
        setRowSelection(newSelection);
        setIsSelectingAllFiltered(true);

        toast.success(
          `Selected ${allMatchingIds.length} donor${allMatchingIds.length !== 1 ? "s" : ""} matching current filters`
        );
      } catch (error) {
        console.error("Failed to get all donor IDs:", error);
        toast.error("Failed to select all donors");
      }
    }
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
          {/* Research progress info hidden
          {researchStatistics && !isLoadingStatistics && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="w-4 h-4" />
              <span>
                Research Progress: {researchStatistics.researchedDonors} of {researchStatistics.totalDonors} donors
                researched ({researchStatistics.researchPercentage}%)
              </span>
            </div>
          )}
          */}
        </div>
        <div className="flex gap-2">
          {/* Research Donors button and dialog hidden
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
          */}


          <Link href="/donors/add">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Donor
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-4 mb-4">
        {/* Search and filters row */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
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

          {/* Filter by list */}
          <div className="flex items-center space-x-2">
            <Label htmlFor="list-filter" className="text-sm font-medium whitespace-nowrap">
              List:
            </Label>
            <Select
              value={notInAnyList ? "not-in-any" : selectedListId?.toString() || "all"}
              onValueChange={(value) => {
                if (value === "not-in-any") {
                  setNotInAnyList(true);
                  setSelectedListId(undefined);
                } else if (value === "all") {
                  setNotInAnyList(false);
                  setSelectedListId(undefined);
                } else {
                  setNotInAnyList(false);
                  setSelectedListId(parseInt(value));
                }
              }}
            >
              <SelectTrigger className="w-48" id="list-filter">
                <SelectValue placeholder="All Lists" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Lists</SelectItem>
                <SelectItem value="not-in-any">Not in any list</SelectItem>
                {lists?.lists?.map((list) => (
                  <SelectItem key={list.id} value={list.id.toString()}>
                    {list.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Filter by assigned staff */}
          <div className="flex items-center space-x-2">
            <Label htmlFor="staff-filter" className="text-sm font-medium whitespace-nowrap">
              Assigned to:
            </Label>
            <Select
              value={
                selectedStaffId === null
                  ? "unassigned"
                  : selectedStaffId === undefined
                  ? "all"
                  : selectedStaffId.toString()
              }
              onValueChange={(value) => {
                if (value === "all") {
                  setSelectedStaffId(undefined);
                } else if (value === "unassigned") {
                  setSelectedStaffId(null);
                } else {
                  setSelectedStaffId(parseInt(value));
                }
              }}
            >
              <SelectTrigger className="w-40" id="staff-filter">
                <SelectValue placeholder="All Staff" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Staff</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {staffMembers?.map((staff) => (
                  <SelectItem key={staff.id} value={staff.id.toString()}>
                    {staff.firstName} {staff.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <PageSizeSelector pageSize={pageSize} onPageSizeChange={setPageSize} />
        </div>

        {/* Second row with researched donors checkbox - hidden
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
        */}
      </div>

      {/* Selection controls */}
      {donors.length > 0 && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={handleSelectAll} className="flex items-center gap-2">
              {selectedCount > 0 ? "Deselect All" : "Select All Matching"}
            </Button>
            {selectedCount > 0 && (
              <span className="text-sm text-muted-foreground">
                {selectedCount} donor{selectedCount !== 1 ? "s" : ""} selected
                {isSelectingAllFiltered && selectedCount > donors.length && ` (across all pages matching filters)`}
              </span>
            )}
          </div>
          {selectedCount > 0 && (
            <div className="flex items-center gap-2">
              <Button onClick={() => setIsBulkStaffDialogOpen(true)} variant="outline" className="flex items-center gap-2">
                <Users2 className="w-4 h-4" />
                Assign Staff ({selectedCount})
              </Button>
              <Button onClick={() => setIsCreateListDialogOpen(true)} className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Create List from Selected ({selectedCount})
              </Button>
            </div>
          )}
        </div>
      )}

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
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          onSortingChange={handleSortingChange}
          enableRowSelection={true}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
        />
      )}


      {/* Create List from Selected Dialog */}
      <Dialog open={isCreateListDialogOpen} onOpenChange={setIsCreateListDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create List from Selected Donors</DialogTitle>
            <DialogDescription>
              Create a new list with the {selectedCount} selected donor{selectedCount !== 1 ? "s" : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="list-name" className="text-right">
                List Name
              </Label>
              <Input
                id="list-name"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="Enter list name..."
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateListDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateListFromSelected}
              disabled={!newListName.trim() || isCreating || isAddingDonors}
            >
              {isCreating || isAddingDonors ? "Creating..." : "Create List"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Staff Assignment Dialog */}
      <Dialog open={isBulkStaffDialogOpen} onOpenChange={setIsBulkStaffDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Assign Staff to Selected Donors</DialogTitle>
            <DialogDescription>
              Assign a staff member to the {selectedCount} selected donor{selectedCount !== 1 ? "s" : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="bulk-staff-select" className="text-right">
                Staff Member
              </Label>
              <Select value={selectedBulkStaffId} onValueChange={setSelectedBulkStaffId}>
                <SelectTrigger className="col-span-3" id="bulk-staff-select">
                  <SelectValue placeholder="Select staff member..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {staffMembers?.map((staff) => (
                    <SelectItem key={staff.id} value={staff.id.toString()}>
                      {staff.firstName} {staff.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkStaffDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleBulkUpdateStaff}
              disabled={!selectedBulkStaffId || isBulkUpdatingStaff}
            >
              {isBulkUpdatingStaff ? "Assigning..." : "Assign Staff"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
