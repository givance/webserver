"use client";

import { ColumnDef, Column, Row } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export type Communication = {
  id: string;
  subject: string;
  type: "email" | "phone" | "meeting" | "letter";
  staffId: string;
  staffName: string;
  donorId: string;
  donorName: string;
  date: string;
  status: "completed" | "scheduled" | "cancelled";
  notes?: string;
};

export const columns: ColumnDef<Communication>[] = [
  {
    accessorKey: "subject",
    header: ({ column }: { column: Column<Communication> }) => {
      return (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Subject
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }: { row: Row<Communication> }) => (
      <Link
        href={`/communications/${row.original.id}`}
        className="font-medium max-w-[300px] truncate block"
        title={row.getValue("subject")}
      >
        {row.getValue("subject")}
      </Link>
    ),
  },
  {
    accessorKey: "type",
    header: "Type",
    cell: ({ row }: { row: Row<Communication> }) => {
      const type = row.getValue("type") as string;
      return <div className="capitalize">{type}</div>;
    },
  },
  {
    accessorKey: "staffName",
    header: "Staff Member",
    cell: ({ row }: { row: Row<Communication> }) => (
      <Link href={`/communications?staff=${row.original.staffId}`} className="font-medium">
        {row.getValue("staffName")}
      </Link>
    ),
  },
  {
    accessorKey: "donorName",
    header: "Donor",
    cell: ({ row }: { row: Row<Communication> }) => (
      <Link href={`/communications?donor=${row.original.donorId}`} className="font-medium">
        {row.getValue("donorName")}
      </Link>
    ),
  },
  {
    accessorKey: "date",
    header: ({ column }: { column: Column<Communication> }) => {
      return (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Date
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }: { row: Row<Communication> }) => {
      const date = new Date(row.getValue("date"));
      return date.toLocaleDateString();
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }: { row: Row<Communication> }) => {
      const status = row.getValue("status") as string;
      const statusStyles = {
        completed: "bg-green-100 text-green-800",
        scheduled: "bg-blue-100 text-blue-800",
        cancelled: "bg-red-100 text-red-800",
      };
      return (
        <div
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            statusStyles[status as keyof typeof statusStyles]
          }`}
        >
          {status.toUpperCase()}
        </div>
      );
    },
  },
  {
    accessorKey: "notes",
    header: "Notes",
    cell: ({ row }: { row: Row<Communication> }) => {
      const notes = row.getValue("notes") as string;
      return notes ? (
        <div className="max-w-[300px] truncate" title={notes}>
          {notes}
        </div>
      ) : null;
    },
  },
  {
    id: "actions",
    cell: ({ row }: { row: Row<Communication> }) => (
      <div className="flex items-center justify-end gap-2">
        <Link href={`/communications/${row.original.id}/edit`}>
          <Button variant="ghost" size="sm">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    ),
  },
];
