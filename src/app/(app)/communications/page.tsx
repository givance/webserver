"use client";

import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import Link from "next/link";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { columns, type Communication } from "./columns";
import { useCommunications } from "@/app/hooks/use-communications";
import { Skeleton } from "@/components/ui/skeleton";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

// Define a minimal thread type to avoid using 'any'
interface ThreadItem {
  id: number;
  createdAt: string;
  channel?: string;
  donors?: Array<{
    donorId: number;
    donor?: {
      id: number;
      firstName: string;
      lastName: string;
    } | null;
  }>;
  staff?: Array<{
    staffId: number;
    staff?: {
      id: number;
      firstName: string;
      lastName: string;
    } | null;
  }>;
  messages?: Array<{
    id: number;
    subject?: string;
    content?: string;
    status?: string;
  }>;
}

// Transform thread data into the expected Communication format
function transformThreadsToDisplayFormat(threads: ThreadItem[]): Communication[] {
  return threads.map((thread) => {
    // Extract the donor information
    const donor = thread.donors?.[0]?.donor;

    // Extract the staff information
    const staff = thread.staff?.[0];

    // Get the latest message if available
    const latestMessage = thread.messages?.[0];

    // Map channel to appropriate communication type
    let type: "email" | "phone" | "meeting" | "letter" = "email";
    if (thread.channel === "phone" || thread.channel === "text") {
      type = "phone";
    } else if (thread.channel === "meeting") {
      type = "meeting";
    } else if (thread.channel === "letter") {
      type = "letter";
    }

    // Map status to appropriate communication status
    let status: "completed" | "scheduled" | "cancelled" = "completed";
    if (latestMessage?.status === "scheduled") {
      status = "scheduled";
    } else if (latestMessage?.status === "cancelled") {
      status = "cancelled";
    }

    return {
      id: String(thread.id),
      subject: latestMessage?.subject || "No subject",
      type,
      staffId: staff ? String(staff.staffId) : "0",
      staffName: staff?.staff?.firstName ? `${staff.staff.firstName} ${staff.staff.lastName || ""}` : "Unassigned",
      donorId: donor ? String(donor.id) : "0",
      donorName: donor ? `${donor.firstName} ${donor.lastName}` : "Unknown Donor",
      date: thread.createdAt,
      status,
      notes: latestMessage?.content || "",
    };
  });
}

export default function CommunicationListPage() {
  const searchParams = useSearchParams();
  const donorFilter = searchParams.get("donor") || undefined;
  const staffFilter = searchParams.get("staff") || undefined;

  const { listThreads } = useCommunications();
  const {
    data: threads,
    isLoading,
    error,
  } = listThreads({
    includeStaff: true,
    includeDonors: true,
    includeLatestMessage: true,
  });

  if (error) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-red-500">Error loading communications: {error.message}</div>
      </div>
    );
  }

  // Transform the threads data into the expected format for the DataTable
  const communicationsData = threads ? transformThreadsToDisplayFormat(threads as ThreadItem[]) : [];

  // Filter communications based on the URL params
  const filteredCommunications = useMemo(() => {
    let filtered = [...communicationsData];

    if (donorFilter) {
      filtered = filtered.filter((comm) => comm.donorId === donorFilter);
    }

    if (staffFilter) {
      filtered = filtered.filter((comm) => comm.staffId === staffFilter);
    }

    return filtered;
  }, [communicationsData, donorFilter, staffFilter]);

  // Find the donor name for display
  const donorName = donorFilter
    ? communicationsData.find((comm) => comm.donorId === donorFilter)?.donorName
    : undefined;

  // Find the staff name for display
  const staffName = staffFilter
    ? communicationsData.find((comm) => comm.staffId === staffFilter)?.staffName
    : undefined;

  // Set page title based on filters
  let pageTitle = "Communication Management";
  if (donorFilter && donorName) {
    pageTitle = `Communications with ${donorName}`;
  } else if (staffFilter && staffName) {
    pageTitle = `Communications by ${staffName}`;
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{pageTitle}</h1>
        <Link href={`/communications/add${donorFilter ? `?donor=${donorFilter}` : ""}`}>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Communication
          </Button>
        </Link>
      </div>

      {/* Active filters display */}
      {(donorFilter || staffFilter) && (
        <div className="flex items-center gap-2 text-sm mb-4">
          <span className="font-medium">Active filters:</span>
          {donorFilter && (
            <div className="flex items-center gap-1 bg-blue-50 text-blue-800 px-2 py-1 rounded-md">
              <span>Donor: {donorName || donorFilter}</span>
              <Link href="/communications" className="hover:text-blue-600">
                <X className="h-4 w-4" />
              </Link>
            </div>
          )}
          {staffFilter && (
            <div className="flex items-center gap-1 bg-purple-50 text-purple-800 px-2 py-1 rounded-md">
              <span>Staff: {staffName || staffFilter}</span>
              <Link href="/communications" className="hover:text-purple-600">
                <X className="h-4 w-4" />
              </Link>
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={filteredCommunications}
          searchKey="subject"
          searchPlaceholder="Search communications..."
        />
      )}
    </div>
  );
}
