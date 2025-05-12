import { ColumnDef, Column, Row } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, MoreHorizontal } from "lucide-react";
import Link from "next/link";

export type Project = {
  id: string;
  name: string;
  description: string;
  status: "active" | "completed" | "on_hold";
  goalAmount: number;
  raisedAmount: number;
  startDate: string;
  endDate: string;
};

export const columns: ColumnDef<Project>[] = [
  {
    accessorKey: "name",
    header: ({ column }: { column: Column<Project> }) => {
      return (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }: { row: Row<Project> }) => (
      <Link href={`/projects/${row.original.id}`} className="font-medium">
        {row.getValue("name")}
      </Link>
    ),
  },
  {
    accessorKey: "description",
    header: "Description",
    cell: ({ row }: { row: Row<Project> }) => {
      const description: string = row.getValue("description");
      return (
        <div className="max-w-[500px] truncate" title={description}>
          {description}
        </div>
      );
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }: { row: Row<Project> }) => {
      const status: string = row.getValue("status");
      const statusStyles = {
        active: "bg-green-100 text-green-800",
        completed: "bg-blue-100 text-blue-800",
        on_hold: "bg-yellow-100 text-yellow-800",
      };
      const displayStatus = status.replace("_", " ").toUpperCase();
      return (
        <div
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            statusStyles[status as keyof typeof statusStyles]
          }`}
        >
          {displayStatus}
        </div>
      );
    },
  },
  {
    accessorKey: "goalAmount",
    header: ({ column }: { column: Column<Project> }) => {
      return (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Goal Amount
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }: { row: Row<Project> }) => {
      const amount = parseFloat(row.getValue("goalAmount"));
      const formatted = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(amount);
      return <div className="text-right font-medium">{formatted}</div>;
    },
  },
  {
    accessorKey: "raisedAmount",
    header: ({ column }: { column: Column<Project> }) => {
      return (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Raised Amount
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }: { row: Row<Project> }) => {
      const raised = parseFloat(row.getValue("raisedAmount"));
      const goal = parseFloat(row.getValue("goalAmount"));
      const percentage = (raised / goal) * 100;
      const formatted = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(raised);
      return (
        <div className="space-y-1">
          <div className="text-right font-medium">{formatted}</div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${Math.min(percentage, 100)}%` }} />
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "startDate",
    header: "Start Date",
    cell: ({ row }: { row: Row<Project> }) => {
      const date = new Date(row.getValue("startDate"));
      return date.toLocaleDateString();
    },
  },
  {
    accessorKey: "endDate",
    header: "End Date",
    cell: ({ row }: { row: Row<Project> }) => {
      const date = new Date(row.getValue("endDate"));
      return date.toLocaleDateString();
    },
  },
  {
    id: "actions",
    cell: ({ row }: { row: Row<Project> }) => (
      <div className="flex items-center justify-end gap-2">
        <Link href={`/projects/${row.original.id}/donations`}>
          <Button variant="ghost" size="sm">
            Donations
          </Button>
        </Link>
        <Link href={`/projects/${row.original.id}/edit`}>
          <Button variant="ghost" size="sm">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    ),
  },
];
