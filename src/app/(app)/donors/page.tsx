"use client";

import { useDonors } from "@/app/hooks/use-donors";
import { useOrganization } from "@/app/hooks/use-organization";
import { logger } from "@/app/lib/logger";
import { trpc } from "@/app/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useDebounce } from "use-debounce";
import type { PredictedAction as ColumnPredictedAction, Donor } from "./columns";
import { getColumns } from "./columns";

// Assuming a type for Staff members, adjust if necessary
interface StaffMember {
  id: string; // or number, depending on your schema
  name: string;
}

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export default function DonorListPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(DEFAULT_PAGE_SIZE);
  const [searchTermInput, setSearchTermInput] = useState("");
  const [debouncedSearchTerm] = useDebounce(searchTermInput, 500);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzingDonorId, setAnalyzingDonorId] = useState<string | null>(null);

  const {
    listDonors,
    getMultipleDonorStats,
    analyzeDonors,
    updateDonorStaff,
    isAnalyzing: isAnalyzingMutation,
  } = useDonors();
  const { getOrganization } = useOrganization();
  const { data: organizationData } = getOrganization();

  // Fetch staff members
  const { data: staffListResponse, isLoading: isLoadingStaff } = trpc.staff.list.useQuery(
    {}, // Empty object for input, as organizationId is from context
    { enabled: !!organizationData?.id } // Only run query if organizationId is available
  );
  // TODO: Potentially add organizationId if your staff.list needs it, e.g., trpc.staff.list.useQuery({ organizationId: currentOrgId });

  const {
    data: listDonorsResponse,
    isLoading,
    error,
  } = listDonors({
    limit: pageSize,
    offset: (currentPage - 1) * pageSize,
    searchTerm: debouncedSearchTerm,
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
              // Log to console for debugging, consider more robust error handling if needed
              console.error(`Failed to parse a predicted action string for donor ${apiDonor.id}: ${actionString}`, e);
              logger.error(`Failed to parse a predicted action string for donor ${apiDonor.id}`);
            }
            return acc;
          }, []);
        } else if (apiDonor.predictedActions) {
          // This case handles if predictedActions is unexpectedly not an array (e.g. a single JSON string due to some upstream issue)
          // Or if it's some other truthy non-array value. This is less expected based on schema.
          console.warn(
            `Predicted actions for donor ${apiDonor.id} was not an array as expected: `,
            apiDonor.predictedActions
          );
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
              console.error(`Fallback parsing of predictedActions string for donor ${apiDonor.id} failed`, e);
              logger.error(`Fallback parsing of predictedActions string for donor ${apiDonor.id} failed`);
            }
          }
        }

        return {
          id: apiDonor.id.toString(),
          name: `${apiDonor.firstName} ${apiDonor.lastName}`,
          email: apiDonor.email,
          phone: apiDonor.phone || "",
          totalDonated,
          lastDonation: stats?.lastDonationDate ? new Date(stats.lastDonationDate).toISOString() : apiDonor.createdAt,
          status: "active" as const,
          currentStageName: apiDonor.currentStageName || null,
          classificationReasoning: apiDonor.classificationReasoning || null,
          predictedActions: parsedActions,
          assignedToStaffId: apiDonor.assignedToStaffId?.toString() || null,
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

  const staffMembers = useMemo(
    () =>
      staffListResponse?.staff?.map((s) => ({
        id: s.id.toString(),
        name: `${s.firstName} ${s.lastName}`,
      })) || [],
    [staffListResponse?.staff]
  );

  const columnsConfig = useMemo(
    () => getColumns(handleAnalyzeDonors, isLoadingDonor, staffMembers, handleUpdateDonorStaff),
    [handleAnalyzeDonors, isLoadingDonor, staffMembers, handleUpdateDonorStaff]
  );

  if (error) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-red-500">Error loading donors: {error.message}</div>
      </div>
    );
  }

  const pageCount = Math.ceil(totalCount / pageSize);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

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
          value={searchTermInput}
          onChange={(e) => setSearchTermInput(e.target.value)}
          className="max-w-sm"
        />
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

      {isLoading && !listDonorsResponse ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
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
        />
      )}
    </div>
  );
}
