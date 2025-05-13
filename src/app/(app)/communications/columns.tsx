"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { ArrowUpDown } from "lucide-react";
import Link from "next/link";
import { CommunicationThreadWithDetails } from "@/app/lib/data/communications";

interface CommunicationsColumnsProps {
  onViewThread: (thread: CommunicationThreadWithDetails) => void;
}

export const createColumns = ({
  onViewThread,
}: CommunicationsColumnsProps): ColumnDef<CommunicationThreadWithDetails>[] => [
  {
    accessorKey: "createdAt",
    header: ({ column }) => {
      return (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Date
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const date = new Date(row.getValue("createdAt"));
      return <div>{date.toLocaleDateString()}</div>;
    },
  },
  {
    accessorKey: "channel",
    header: "Channel",
    cell: ({ row }) => {
      const channel = row.getValue("channel") as string;
      return <div className="capitalize">{channel}</div>;
    },
  },
  {
    id: "staff",
    header: "Staff",
    cell: ({ row }) => {
      const staffMembers = row.original.staff || [];
      if (staffMembers.length === 0) return "Unassigned";

      return (
        <div className="space-y-1">
          {staffMembers.map((staffMember) => {
            if (!staffMember.staff) return null;
            return (
              <Link key={staffMember.staffId} href={`/staff/${staffMember.staffId}`} className="hover:underline block">
                {staffMember.staff.firstName} {staffMember.staff.lastName}
              </Link>
            );
          })}
        </div>
      );
    },
  },
  {
    id: "donors",
    header: "Donors",
    cell: ({ row }) => {
      const donors = row.original.donors || [];
      if (donors.length === 0) return "No donors";

      return (
        <div className="space-y-1">
          {donors.map((donor) => {
            if (!donor.donor) return null;
            return (
              <Link key={donor.donorId} href={`/donors/${donor.donorId}`} className="hover:underline block">
                {donor.donor.firstName} {donor.donor.lastName}
              </Link>
            );
          })}
        </div>
      );
    },
  },
  {
    id: "latestMessage",
    header: "Latest Message",
    cell: ({ row }) => {
      const content = row.original.content;
      if (!content || content.length === 0) return "No messages";

      const latestMessage = content[0];
      return (
        <div className="max-w-[300px] truncate" title={latestMessage.content}>
          <div className="text-muted-foreground">{latestMessage.content}</div>
        </div>
      );
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      return (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onViewThread(row.original)}>
            View
          </Button>
          <Link href={`/communications/${row.original.id}/edit`}>
            <Button variant="ghost" size="sm">
              Edit
            </Button>
          </Link>
        </div>
      );
    },
  },
];
