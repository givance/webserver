import { trpc } from "@/app/lib/trpc/client";

/**
 * Interface for donor validation results
 */
export interface DonorEmailValidationResult {
  isValid: boolean;
  donorsWithoutStaff: Array<{
    donorId: number;
    donorFirstName: string;
    donorLastName: string;
    donorEmail: string;
  }>;
  donorsWithStaffButNoEmail: Array<{
    donorId: number;
    donorFirstName: string;
    donorLastName: string;
    donorEmail: string;
    staffFirstName: string;
    staffLastName: string;
    staffEmail: string;
  }>;
  errorMessage?: string;
}

/**
 * Hook to validate donor staff email connectivity
 * @param donorIds Array of donor IDs to validate
 * @param enabled Whether to run the validation query
 * @returns Query result with validation data
 */
export function useDonorStaffEmailValidation(donorIds: number[], enabled = true) {
  return trpc.donors.validateStaffEmailConnectivity.useQuery(
    { donorIds },
    {
      enabled: enabled && donorIds.length > 0,
      staleTime: 30000, // Cache for 30 seconds
      refetchOnWindowFocus: false,
    }
  );
}
