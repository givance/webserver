import { useMemo } from "react";

export function useDonorUtils(donorsData: any[]) {
  // Memoize EmailListViewer props to prevent re-renders - these should be very stable
  const emailListViewerDonors = useMemo(() => {
    console.log(`[donorUtils] Recalculating donors at ${new Date().toISOString()}`, {
      donorsCount: donorsData?.length || 0,
    });
    return (
      donorsData
        ?.filter((donor) => !!donor)
        .map((donor) => ({
          id: donor.id,
          firstName: donor.firstName,
          lastName: donor.lastName,
          email: donor.email,
          assignedToStaffId: donor.assignedToStaffId,
        })) || []
    );
  }, [donorsData]);

  return {
    emailListViewerDonors,
  };
}