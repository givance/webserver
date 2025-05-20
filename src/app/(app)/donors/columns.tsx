"use client";

import { ColumnDef, Column, Row } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, MoreHorizontal, Trash2, Activity, Info, ChevronDown } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useState } from "react";
import { useDonors } from "@/app/hooks/use-donors";
import { formatCurrency } from "@/app/lib/utils/format";
import React from "react";

export type PredictedAction = {
  type: string;
  description: string;
  explanation: string;
  instruction: string;
  scheduledDate: string;
};

export type Donor = {
  id: string;
  name: string;
  email: string;
  phone: string;
  totalDonated: number;
  lastDonation: string;
  status: "active" | "inactive";
  currentStageName: string | null;
  classificationReasoning: string | null;
  predictedActions: PredictedAction[];
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

export const getColumns = (
  handleAnalyze: (donorId: string) => void,
  isLoadingDonor: (donorId: string) => boolean
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
    accessorKey: "currentStageName",
    header: "Stage",
    cell: ({ row }: { row: Row<Donor> }) => {
      const stageName = row.getValue("currentStageName") as string | null;
      const reasoning = row.original.classificationReasoning;

      if (!stageName) return <div className="text-muted-foreground text-sm">Not classified</div>;

      return (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-medium">
            {stageName}
          </Badge>
          {reasoning && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  <p>{reasoning}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      );
    },
  },
  {
    id: "predictedActions",
    header: "Predicted Actions",
    cell: ({ row }: { row: Row<Donor> }) => {
      const actions = row.original.predictedActions;

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="ml-auto" disabled={!actions || actions.length === 0}>
              {actions?.length ? `${actions.length} Actions` : "No Actions"}
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          {actions && actions.length > 0 && (
            <DropdownMenuContent align="end" className="w-80">
              {actions.map((action, index) => (
                <TooltipProvider key={`${action.type}-${index}`}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuItem
                        className="flex flex-col items-start py-2 cursor-pointer"
                        onSelect={(e) => e.preventDefault()}
                      >
                        <div className="font-medium">{action.type}</div>
                        <div className="text-xs text-muted-foreground mt-1">{action.description}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Scheduled: {new Date(action.scheduledDate).toLocaleString()}
                        </div>
                      </DropdownMenuItem>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-sm">
                      <div className="space-y-2">
                        <div>
                          <span className="font-medium">Explanation:</span>
                          <p className="text-sm">{action.explanation}</p>
                        </div>
                        <div>
                          <span className="font-medium">Instructions:</span>
                          <p className="text-sm">{action.instruction}</p>
                        </div>
                        <div>
                          <span className="font-medium">Scheduled For:</span>
                          <p className="text-sm">{new Date(action.scheduledDate).toLocaleString()}</p>
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </DropdownMenuContent>
          )}
        </DropdownMenu>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row }: { row: Row<Donor> }) => {
      const donor = row.original;
      const isAnalyzingThisDonor = isLoadingDonor(donor.id);
      return (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleAnalyze(donor.id)}
            disabled={isAnalyzingThisDonor}
            title={isAnalyzingThisDonor ? "Analyzing this donor..." : "Analyze this donor"}
          >
            <Activity className={`h-4 w-4 ${isAnalyzingThisDonor ? "animate-spin" : ""}`} />
          </Button>
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
          <DeleteDonorButton donorId={donor.id} />
        </div>
      );
    },
  },
];
