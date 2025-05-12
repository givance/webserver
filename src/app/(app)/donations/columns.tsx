import { ColumnDef, Column, Row } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, MoreHorizontal } from "lucide-react";
import Link from "next/link";

export type Donation = {
  id: string;
  amount: number;
  donorId: string;
  donorName: string;
  projectId: string;
  projectName: string;
  type: "one_time" | "recurring";
  status: "completed" | "pending" | "failed";
  date: string;
  notes?: string;
};

export const columns: ColumnDef<Donation>[] = [
  {
    accessorKey: "amount",
    header: ({ column }: { column: Column<Donation> }) => {
      return (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Amount
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }: { row: Row<Donation> }) => {
      const amount = parseFloat(row.getValue("amount"));
      const formatted = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(amount);
      return <div className="text-right font-medium">{formatted}</div>;
    },
  },
  {
    accessorKey: "donorName",
    header: "Donor",
    cell: ({ row }: { row: Row<Donation> }) => (
      <Link href={`/donors/${row.original.donorId}`} className="font-medium">
        {row.getValue("donorName")}
      </Link>
    ),
  },
  {
    accessorKey: "projectName",
    header: "Project",
    cell: ({ row }: { row: Row<Donation> }) => (
      <Link href={`/projects/${row.original.projectId}`} className="font-medium">
        {row.getValue("projectName")}
      </Link>
    ),
  },
  {
    accessorKey: "type",
    header: "Type",
    cell: ({ row }: { row: Row<Donation> }) => {
      const type = row.getValue("type") as string;
      return <div className="capitalize">{type.replace("_", " ")}</div>;
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }: { row: Row<Donation> }) => {
      const status = row.getValue("status") as string;
      const statusStyles = {
        completed: "bg-green-100 text-green-800",
        pending: "bg-yellow-100 text-yellow-800",
        failed: "bg-red-100 text-red-800",
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
    accessorKey: "date",
    header: ({ column }: { column: Column<Donation> }) => {
      return (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Date
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }: { row: Row<Donation> }) => {
      const date = new Date(row.getValue("date"));
      return date.toLocaleDateString();
    },
  },
  {
    accessorKey: "notes",
    header: "Notes",
    cell: ({ row }: { row: Row<Donation> }) => {
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
    cell: ({ row }: { row: Row<Donation> }) => (
      <div className="flex items-center justify-end gap-2">
        <Link href={`/donations/${row.original.id}/edit`}>
          <Button variant="ghost" size="sm">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    ),
  },
];
