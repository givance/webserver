"use client";

import React, { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import Link from "next/link";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { getColumns } from "./columns";
import { useDonors } from "@/app/hooks/use-donors";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "use-debounce";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Donor, PredictedAction as ColumnPredictedAction } from "./columns";
import { formatCurrency } from "@/app/lib/utils/format";
import { trpc } from "@/app/lib/trpc/client";
import { toast } from "sonner";
import type { AppRouter } from "@/app/api/trpc/routers/_app";
import type { TRPCClientErrorLike } from "@trpc/client";
import { useQueryClient } from "@tanstack/react-query";
import { logger } from "@/app/lib/logger";
import { useOrganization } from "@/app/hooks/use-organization";

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

  const { listDonors, getMultipleDonorStats } = useDonors();
  const { getOrganization } = useOrganization();
  const { data: organizationData } = getOrganization();
  const queryClient = useQueryClient();

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

  // Placeholder for the new tRPC mutation
  const analyzeDonorsMutation = trpc.analysis.analyzeDonors.useMutation({
    onSuccess: (data, variables) => {
      const singleDonorId = variables.donorIds.length === 1 ? variables.donorIds[0] : null;
      if (singleDonorId) {
        toast.success(`Analysis complete for donor ${singleDonorId}!`);
      } else {
        toast.success(
          `Batch donor analysis complete! Successful: ${
            data.results.filter((r) => r.status === "success").length
          }, Failed: ${data.results.filter((r) => r.status !== "success").length}`
        );
      }
      // Refetch donor data as stages/actions might have changed
      // This assumes your donor list queries use a key like ['donors', params]
      // or just ['donors'] for a broader invalidation.
      logger.info("Invalidating queries with root key ['donors'] to refetch donor data.");
      queryClient.invalidateQueries({ queryKey: ["donors"] });

      // Potentially also refetch getMultipleDonorStats if actions affect stats displayed.
      // For example, if donorStats are identified by a query key like ['donorStats', arrayOfIds]
      // or a more general ['donorStats'], you might add:
      // queryClient.invalidateQueries({ queryKey: ['donorStats'] });
      // logger.info("Invalidated donorStats queries for donor stats.");
    },
    onError: (error: TRPCClientErrorLike<AppRouter>, variables) => {
      const singleDonorId = variables.donorIds.length === 1 ? variables.donorIds[0] : null;
      if (singleDonorId) {
        toast.error(`Failed to analyze donor ${singleDonorId}: ${error.message}`);
      } else {
        toast.error(`Batch analysis failed: ${error.message}`);
      }
      console.error("Error analyzing donors:", error);
    },
    onSettled: (data, error, variables) => {
      setIsAnalyzing(false);
      setAnalyzingDonorId(null);
      const actionType =
        variables.donorIds.length === 1
          ? `single donor ${variables.donorIds[0]}`
          : `batch of ${variables.donorIds.length} donors`;
      logger.info(`Analysis settled for ${actionType}. Success: ${!!data}, Error: ${!!error}`);
    },
  });

  const updateDonorStaffMutation = trpc.donors.updateAssignedStaff.useMutation({
    onSuccess: (data, variables) => {
      toast.success(`Successfully assigned staff to donor ${variables.donorId}.`);
      // Invalidate queries to refetch donor data to show updated assigned staff
      logger.info("Invalidating queries with root key ['donors'] to refetch donor data after staff assignment.");
      queryClient.invalidateQueries({ queryKey: ["donors"] });
      // Potentially invalidate staff list if it changes, or individual staff details if relevant
      // queryClient.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (error: TRPCClientErrorLike<AppRouter>, variables) => {
      toast.error(`Failed to assign staff to donor ${variables.donorId}: ${error.message}`);
      console.error("Error updating donor's assigned staff:", error);
      logger.error(
        `Error updating donor ${variables.donorId} assigned staff to ${
          variables.staffId === null ? "unassigned" : variables.staffId
        }: ${error.message}`
      );
    },
    onSettled: (data, error, variables) => {
      const donorIdForLogging = variables.donorId as number; // Cast before logging
      if (variables.donorId === null || variables.donorId === undefined) {
        logger.error(
          `Critical: donorId is null or undefined in onSettled for updateDonorStaffMutation. Raw donorId: ${variables.donorId}`
        );
        return;
      }
      logger.info(
        `Update assigned staff settled for donor ${donorIdForLogging}. Success: ${!!data}, Error: ${!!error}`
      );
    },
  });

  const handleAnalyzeDonors = useCallback(
    async (donorId?: string) => {
      setIsAnalyzing(true);
      if (donorId) {
        setAnalyzingDonorId(donorId);
        toast.info(`Starting analysis for donor ${donorId}...`);
        await analyzeDonorsMutation.mutateAsync({ donorIds: [donorId] });
      } else {
        // Batch analysis
        toast.info("Starting batch analysis for donors on current page...");
        const donorIdsToAnalyze = donors.map((d) => d.id);
        if (donorIdsToAnalyze.length === 0) {
          toast.info("No donors to analyze on the current page.");
          setIsAnalyzing(false);
          return;
        }
        await analyzeDonorsMutation.mutateAsync({ donorIds: donorIdsToAnalyze });
      }
      // onSettled from useMutation will handle setIsAnalyzing(false) and setAnalyzingDonorId(null)
    },
    [analyzeDonorsMutation, donors, setIsAnalyzing, setAnalyzingDonorId]
  );

  const handleUpdateDonorStaff = useCallback(
    async (donorId: string, staffId: string | null) => {
      try {
        await updateDonorStaffMutation.mutateAsync({
          donorId: parseInt(donorId, 10),
          staffId: staffId ? parseInt(staffId, 10) : null,
        });
      } catch (error) {
        // Error handling is already done in the mutation's onError callback
        console.error("Error in handleUpdateDonorStaff:", error);
      }
    },
    [updateDonorStaffMutation]
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
          <Button onClick={() => handleAnalyzeDonors()} disabled={isAnalyzing || analyzeDonorsMutation.isPending}>
            {isAnalyzing || analyzeDonorsMutation.isPending ? batchButtonText : "Analyze Page Donors"}
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
