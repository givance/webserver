"use client";

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { columns, type Communication } from "./columns";
import { useCommunications } from "@/app/hooks/use-communications";
import { Skeleton } from "@/components/ui/skeleton";

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

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Communication Management</h1>
        <Link href="/communications/add">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Communication
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={communicationsData}
          searchKey="subject"
          searchPlaceholder="Search communications..."
        />
      )}
    </div>
  );
}
