import { ColumnDef, Column, Row } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, MoreHorizontal, Trash2 } from "lucide-react";
import Link from "next/link";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import { useProjects } from "@/app/hooks/use-projects";
import { formatCurrency } from "@/app/lib/utils/format";

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

// DeleteProjectButton component to handle delete with confirmation dialog
function DeleteProjectButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const { deleteProject, isDeleting } = useProjects();

  const handleDelete = async () => {
    await deleteProject(Number(projectId));
    setOpen(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50">
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the project and all associated records.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-red-500 hover:bg-red-700 focus:ring-red-500"
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

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
        <div className="max-w-[300px] truncate" title={description}>
          {description}
        </div>
      );
    },
    meta: {
      enableHiding: true,
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
          Goal
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }: { row: Row<Project> }) => {
      const amount = parseFloat(row.getValue("goalAmount"));
      return <div className="text-right font-medium">{formatCurrency(amount)}</div>;
    },
    meta: {
      enableHiding: true,
    },
  },
  {
    accessorKey: "raisedAmount",
    header: ({ column }: { column: Column<Project> }) => {
      return (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Raised
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }: { row: Row<Project> }) => {
      const raised = parseFloat(row.getValue("raisedAmount"));
      const goal = parseFloat(row.getValue("goalAmount"));
      const percentage = goal > 0 ? (raised / goal) * 100 : 0;
      return (
        <div className="space-y-1">
          <div className="text-right font-medium">{formatCurrency(raised)}</div>
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
    meta: {
      enableHiding: true,
    },
  },
  {
    accessorKey: "endDate",
    header: "End Date",
    cell: ({ row }: { row: Row<Project> }) => {
      const date = new Date(row.getValue("endDate"));
      return date.toLocaleDateString();
    },
    meta: {
      enableHiding: true,
    },
  },
  {
    id: "actions",
    cell: ({ row }: { row: Row<Project> }) => (
      <div className="flex items-center justify-end gap-2">
        <Link href={`/projects/${row.original.id}/donations`}>
          <Button variant="ghost" size="sm" className="hidden sm:inline-flex">
            Donations
          </Button>
          <Button variant="ghost" size="sm" className="sm:hidden">
            View
          </Button>
        </Link>
        <DeleteProjectButton projectId={row.original.id} />
      </div>
    ),
  },
];
