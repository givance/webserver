"use client";

import { useDonors } from "@/app/hooks/use-donors";
import { DonorNameFields } from "@/app/lib/utils/donor-name-formatter";
import { formatCurrency } from "@/app/lib/utils/format";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Column, ColumnDef, Row } from "@tanstack/react-table";
import { ArrowUpDown, MoreHorizontal, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export type PredictedAction = {
  type: string;
  description: string;
  explanation: string;
  instruction: string;
  scheduledDate: string;
};

export interface StaffMember {
  id: string;
  name: string;
}

export type Donor = DonorNameFields & {
  id: string;
  name: string; // This will be the formatted name for display
  email: string;
  phone: string;
  totalDonated: number;
  lastDonation: string;
  status: "active" | "inactive";
  currentStageName: string | null;
  classificationReasoning: string | null;
  predictedActions: PredictedAction[];
  assignedToStaffId: string | null;
  highPotentialDonor: boolean; // NEW: High potential donor flag from research
  highPotentialDonorRationale?: string | null; // NEW: Rationale from person research
};

// DeleteDonorDialog component to handle delete with confirmation dialog
function DeleteDonorDialog({ donorId }: { donorId: string }) {
  const [open, setOpen] = useState(false);
  const { deleteDonor, isDeleting } = useDonors();

  const handleDelete = async () => {
    await deleteDonor(Number(donorId));
    setOpen(false);
  };

  const handleOpenDialog = (e: Event) => {
    e.preventDefault();
    setOpen(true);
  };

  return (
    <>
      <DropdownMenuItem className="text-red-600 cursor-pointer" onSelect={handleOpenDialog}>
        <Trash2 className="h-4 w-4 mr-2" />
        Delete
      </DropdownMenuItem>
      <AlertDialog open={open} onOpenChange={setOpen}>
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
    </>
  );
}

export const getColumns = (
  handleAnalyze: (donorId: string) => void,
  isLoadingDonor: (donorId: string) => boolean,
  staffMembers: StaffMember[],
  handleUpdateDonorStaff: (donorId: string, staffId: string | null) => Promise<void>
): ColumnDef<Donor>[] => [
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
      <div className="flex items-center gap-2">
        <Link href={`/donors/${row.original.id}`} className="font-medium">
          {row.getValue("name")}
        </Link>
        {row.original.highPotentialDonor && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Badge
                  variant="secondary"
                  className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200 cursor-help px-2 py-1 text-xs font-medium"
                >
                  <Star className="h-3 w-3 mr-1 fill-current" />
                  High Potential
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <div>
                  <p className="font-semibold">High Potential Donor</p>
                  {row.original.highPotentialDonorRationale && (
                    <p className="mt-1 text-sm">{row.original.highPotentialDonorRationale}</p>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
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
    accessorKey: "assignedToStaffId",
    header: "Assigned Staff",
    cell: ({ row }: { row: Row<Donor> }) => {
      const donor = row.original;
      const currentStaffId = donor.assignedToStaffId;
      const assignedStaffMember = staffMembers.find((staff) => staff.id === currentStaffId);

      return (
        <Select
          value={currentStaffId || "unassigned"}
          onValueChange={(value) => {
            const newStaffId = value === "unassigned" ? null : value;
            handleUpdateDonorStaff(donor.id, newStaffId);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select staff" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {staffMembers.map((staff) => (
              <SelectItem key={staff.id} value={staff.id}>
                {staff.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row }: { row: Row<Donor> }) => {
      const donor = row.original;
      return (
        <div className="flex items-center justify-end gap-1">
          <Link href={`/donations?donorId=${donor.id}`}>
            <Button variant="ghost" size="sm" title="View Donations">
              Donations
            </Button>
          </Link>
          <Link href={`/communications?donorId=${donor.id}`}>
            <Button variant="ghost" size="sm" title="View Communications">
              Communications
            </Button>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <Link href={`/donors/${donor.id}`}>
                <DropdownMenuItem>View</DropdownMenuItem>
              </Link>
              <Link href={`/donors/${donor.id}/edit`}>
                <DropdownMenuItem>Edit</DropdownMenuItem>
              </Link>
              <Link href={`/donors/email/${donor.id}`}>
                <DropdownMenuItem>Send Email</DropdownMenuItem>
              </Link>
              <DropdownMenuSeparator />
              <DeleteDonorDialog donorId={donor.id} />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    },
  },
];
