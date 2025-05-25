import { useMemo } from "react";
import { trpc } from "@/app/lib/trpc/client";
import { useOrganization } from "@/app/hooks/use-organization";

export interface StaffMember {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
}

interface UseStaffMembersReturn {
  staffMembers: StaffMember[];
  isLoading: boolean;
  error: Error | null;
}

/**
 * Custom hook for fetching and mapping staff members
 * @returns Staff members data, loading state, and error state
 */
export function useStaffMembers(): UseStaffMembersReturn {
  const { getOrganization } = useOrganization();
  const { data: organizationData } = getOrganization();

  const {
    data: staffListResponse,
    isLoading,
    error,
  } = trpc.staff.list.useQuery(
    {}, // Empty object for input, as organizationId is from context
    { enabled: !!organizationData?.id } // Only run query if organizationId is available
  );

  const staffMembers = useMemo(
    () =>
      staffListResponse?.staff?.map((s) => ({
        id: s.id.toString(),
        name: `${s.firstName} ${s.lastName}`,
        firstName: s.firstName,
        lastName: s.lastName,
      })) || [],
    [staffListResponse?.staff]
  );

  return {
    staffMembers,
    isLoading,
    error: error as Error | null,
  };
}
