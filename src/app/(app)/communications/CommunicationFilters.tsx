import { useStaff } from "@/app/hooks/use-staff";
import { useDonors } from "@/app/hooks/use-donors";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CommunicationChannel } from "@/app/lib/data/communications";
import { useRouter, useSearchParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";

interface CommunicationFiltersProps {
  pageSize: number;
  onPageSizeChange: (size: number) => void;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export function CommunicationFilters({ pageSize, onPageSizeChange }: CommunicationFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get current filter values from URL
  const currentStaffId = searchParams.get("staffId");
  const currentDonorId = searchParams.get("donorId");
  const currentChannel = searchParams.get("channel") as CommunicationChannel | null;

  // Fetch staff and donors data
  const { listStaff } = useStaff();
  const { listDonors } = useDonors();

  const { data: staffData, isLoading: isLoadingStaff } = listStaff({
    limit: 100, // Reasonable limit for dropdown
  });

  const { data: donorsData, isLoading: isLoadingDonors } = listDonors({
    limit: 100, // Reasonable limit for dropdown
  });

  // Update URL with new filter values
  const updateFilters = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`/communications${params.toString() ? `?${params.toString()}` : ""}`);
  };

  return (
    <div className="flex items-center gap-4 mb-4 flex-wrap">
      {/* Staff filter */}
      {isLoadingStaff ? (
        <Skeleton className="h-10 w-[200px]" />
      ) : (
        <Select value={currentStaffId || "all"} onValueChange={(value) => updateFilters("staffId", value)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by staff" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Staff</SelectItem>
            {staffData?.staff?.map((staff) => (
              <SelectItem key={staff.id} value={staff.id.toString()}>
                {staff.firstName} {staff.lastName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Donor filter */}
      {isLoadingDonors ? (
        <Skeleton className="h-10 w-[200px]" />
      ) : (
        <Select value={currentDonorId || "all"} onValueChange={(value) => updateFilters("donorId", value)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by donor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Donors</SelectItem>
            {donorsData?.donors?.map((donor) => (
              <SelectItem key={donor.id} value={donor.id.toString()}>
                {donor.firstName} {donor.lastName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Channel filter */}
      <Select value={currentChannel || "all"} onValueChange={(value) => updateFilters("channel", value)}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Filter by channel" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Channels</SelectItem>
          <SelectItem value="email">Email</SelectItem>
          <SelectItem value="phone">Phone</SelectItem>
          <SelectItem value="text">Text</SelectItem>
        </SelectContent>
      </Select>

      {/* Page size selector */}
      <Select value={pageSize.toString()} onValueChange={(value) => onPageSizeChange(Number(value))}>
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
  );
}
