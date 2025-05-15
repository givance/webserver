"use client";

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
import { useDonors } from "@/app/hooks/use-donors";
import { formatCurrency } from "@/app/lib/utils/format";

export type Donor = {
  id: string;
  name: string;
  email: string;
  phone: string;
  totalDonated: number;
  lastDonation: string;
  status: "active" | "inactive";
};

// DeleteDonorButton component to handle delete with confirmation dialog
function DeleteDonorButton({ donorId }: { donorId: string }) {
  const [open, setOpen] = useState(false);
  const { deleteDonor, isDeleting } = useDonors();

  const handleDelete = async () => {
    await deleteDonor(Number(donorId));
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
            This action cannot be undone. This will permanently delete the donor and all associated records.
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

export const columns: ColumnDef<Donor>[] = [
  {
    accessorKey: "name",
    header: ({ column }: { column: Column<Donor> }) => {
      return (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }: { row: Row<Donor> }) => (
      <Link href={`/donors/${row.original.id}`} className="font-medium">
        {row.getValue("name")}
      </Link>
    ),
  },
  {
    accessorKey: "email",
    header: "Email",
  },
  {
    accessorKey: "phone",
    header: "Phone",
  },
  {
    accessorKey: "totalDonated",
    header: ({ column }: { column: Column<Donor> }) => {
      return (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Total Donated
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }: { row: Row<Donor> }) => {
      const amount = row.getValue("totalDonated") as number;
      return <div>{formatCurrency(amount)}</div>;
    },
  },
  {
    accessorKey: "lastDonation",
    header: "Last Donation",
    cell: ({ row }: { row: Row<Donor> }) => {
      const date = new Date(row.getValue("lastDonation"));
      return date.toLocaleDateString();
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }: { row: Row<Donor> }) => (
      <div
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
          row.original.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
        }`}
      >
        {row.getValue("status")}
      </div>
    ),
  },
  {
    id: "actions",
    cell: ({ row }: { row: Row<Donor> }) => (
      <div className="flex items-center justify-end gap-2">
        <Link href={`/donations?donorId=${row.original.id}`}>
          <Button variant="ghost" size="sm">
            Donations
          </Button>
        </Link>
        <Link href={`/communications?donorId=${row.original.id}`}>
          <Button variant="ghost" size="sm">
            Communications
          </Button>
        </Link>
        <DeleteDonorButton donorId={row.original.id} />
      </div>
    ),
  },
];
