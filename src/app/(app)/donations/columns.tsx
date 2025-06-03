"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { ArrowUpDown } from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/app/lib/utils/format";
import { DonationWithDetails } from "@/app/lib/data/donations";
import { formatDonorName } from "@/app/lib/utils/donor-name-formatter";

export const columns: ColumnDef<DonationWithDetails>[] = [
  {
    accessorKey: "date",
    header: ({ column }) => {
      return (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Date
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const date = new Date(row.getValue("date"));
      return <div>{date.toLocaleDateString()}</div>;
    },
  },
  {
    accessorKey: "amount",
    header: ({ column }) => {
      return (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Amount
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const amount = row.getValue("amount") as number;
      return <div>{formatCurrency(amount)}</div>;
    },
  },
  {
    id: "donor",
    header: "Donor",
    cell: ({ row }) => {
      const donor = row.original.donor;
      if (!donor) return "Unknown Donor";
      return (
        <Link href={`/donors/${donor.id}`} className="hover:underline">
          {formatDonorName(donor)}
        </Link>
      );
    },
  },
  {
    id: "project",
    header: "Project",
    cell: ({ row }) => {
      const project = row.original.project;
      if (!project) return "Unknown Project";
      return (
        <Link href={`/projects/${project.id}`} className="hover:underline">
          {project.name}
        </Link>
      );
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      return (
        <div className="flex items-center gap-2">
          <Link href={`/donations/${row.original.id}`}>
            <Button variant="ghost" size="sm">
              View
            </Button>
          </Link>
          <Link href={`/donations/${row.original.id}/edit`}>
            <Button variant="ghost" size="sm">
              Edit
            </Button>
          </Link>
        </div>
      );
    },
  },
];
