"use client";

import { ErrorDisplay } from "@/app/components/ErrorDisplay";
import { LoadingSkeleton } from "@/app/components/LoadingSkeleton";
import { PageSizeSelector } from "@/app/components/PageSizeSelector";
import { useDonors } from "@/app/hooks/use-donors";
import { usePagination } from "@/app/hooks/use-pagination";
import { useSearch } from "@/app/hooks/use-search";
import { useStaffMembers } from "@/app/hooks/use-staff-members";
import { logger } from "@/app/lib/logger";
import { formatDonorName } from "@/app/lib/utils/donor-name-formatter";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import type { PredictedAction as ColumnPredictedAction, Donor } from "./columns";
import { getColumns } from "./columns";

export default function DonorListPage() {
  const { searchTerm, debouncedSearchTerm, setSearchTerm } = useSearch();
  const { currentPage, pageSize, setCurrentPage, setPageSize, getOffset, getPageCount } = usePagination({
    resetOnDependency: debouncedSearchTerm,
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzingDonorId, setAnalyzingDonorId] = useState<string | null>(null);

  const {
    listDonors,
    getMultipleDonorStats,
    analyzeDonors,
    updateDonorStaff,
    isAnalyzing: isAnalyzingMutation,
  } = useDonors();
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

        // Parse the predicted actions if they exist
        let parsedActions: ColumnPredictedAction[] = [];

        if (apiDonor.predictedActions && Array.isArray(apiDonor.predictedActions)) {
          parsedActions = apiDonor.predictedActions.reduce((acc: ColumnPredictedAction[], actionString: string) => {
            try {
              // Assuming each string in the array is a JSON representation of PredictedAction
              const action: ColumnPredictedAction = JSON.parse(actionString);
              acc.push({
                ...action,
                scheduledDate: action.scheduledDate || new Date().toISOString(), // Default to current date if not provided
              });
            } catch (e) {
              // Log error for debugging
              logger.error(`Failed to parse a predicted action string for donor ${apiDonor.id}`);
            }
            return acc;
          }, []);
        } else if (apiDonor.predictedActions) {
          // This case handles if predictedActions is unexpectedly not an array (e.g. a single JSON string due to some upstream issue)
          // Or if it's some other truthy non-array value. This is less expected based on schema.
          logger.warn(`Predicted actions for donor ${apiDonor.id} was not an array as expected.`);
          // Attempt to parse if it's a string, mimicking old logic for this fallback, though schema implies array of strings.
          if (typeof apiDonor.predictedActions === "string") {
            try {
              const actionsArray = JSON.parse(apiDonor.predictedActions);
              if (Array.isArray(actionsArray)) {
                parsedActions = actionsArray.map((action: any) => ({
                  // 'any' here as structure is unknown
                  ...action,
                  scheduledDate: action.scheduledDate || new Date().toISOString(),
                }));
              }
            } catch (e) {
              logger.error(`Fallback parsing of predictedActions string for donor ${apiDonor.id} failed`);
            }
          }
        }

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
          predictedActions: parsedActions,
          assignedToStaffId: apiDonor.assignedToStaffId?.toString() || null,
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

  const handleAnalyzeDonors = useCallback(
    async (donorId?: string) => {
      setIsAnalyzing(true);
      if (donorId) {
        setAnalyzingDonorId(donorId);
        toast.info(`Starting analysis for donor ${donorId}...`);
        await analyzeDonors([donorId]);
      } else {
        // Batch analysis
        toast.info("Starting batch analysis for donors on current page...");
        const donorIdsToAnalyze = donors.map((d) => d.id);
        if (donorIdsToAnalyze.length === 0) {
          toast.info("No donors to analyze on the current page.");
          setIsAnalyzing(false);
          return;
        }
        await analyzeDonors(donorIdsToAnalyze);
      }
      setIsAnalyzing(false);
      setAnalyzingDonorId(null);
    },
    [analyzeDonors, donors]
  );

  const handleUpdateDonorStaff = useCallback(
    async (donorId: string, staffId: string | null) => {
      await updateDonorStaff(donorId, staffId);
    },
    [updateDonorStaff]
  );

  const isLoadingDonor = useCallback(
    (id: string) => isAnalyzing && analyzingDonorId === id,
    [isAnalyzing, analyzingDonorId]
  );

  const columnsConfig = useMemo(
    () => getColumns(handleAnalyzeDonors, isLoadingDonor, staffMembers, handleUpdateDonorStaff),
    [handleAnalyzeDonors, isLoadingDonor, staffMembers, handleUpdateDonorStaff]
  );

  if (error) {
    return <ErrorDisplay error={error.message || "Unknown error"} title="Error loading donors" />;
  }

  const pageCount = getPageCount(totalCount);

  // A more refined batch button text:
  let batchButtonText = "Analyze Page Donors";
  if (isAnalyzing) {
    if (analyzingDonorId) batchButtonText = "Analyzing Single...";
    else batchButtonText = "Analyzing Page...";
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Donor Management</h1>
        <div className="flex gap-2">
          <Button onClick={() => handleAnalyzeDonors()} disabled={isAnalyzing || isAnalyzingMutation}>
            {isAnalyzing || isAnalyzingMutation ? batchButtonText : "Analyze Page Donors"}
          </Button>
          <Link href="/donors/add">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Donor
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <Input
          placeholder="Search donors by name, email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
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
