"use client";

import { ColumnDef, Column, Row } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, MoreHorizontal, Trash2, Edit, Users } from "lucide-react";
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
import { useState } from "react";
import { useLists } from "@/app/hooks/use-lists";
import React from "react";

// Frontend type that matches what comes from tRPC (dates are strings)
export type DonorListWithMemberCountFrontend = {
  id: number;
  organizationId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
};

// DeleteListButton component to handle delete with confirmation dialog
function DeleteListButton({ listId, listName }: { listId: number; listName: string }) {
  const [open, setOpen] = useState(false);
  const { deleteList, isDeleting } = useLists();

  const handleDelete = async () => {
    await deleteList(listId);
    setOpen(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </DropdownMenuItem>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the list &quot;{listName}&quot; and remove all
            its members.
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

export const getColumns = (): ColumnDef<DonorListWithMemberCountFrontend>[] => [
  {
    accessorKey: "name",
    header: ({ column }: { column: Column<DonorListWithMemberCountFrontend> }) => {
      return (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }: { row: Row<DonorListWithMemberCountFrontend> }) => (
      <Link href={`/lists/${row.original.id}`} className="font-medium hover:underline">
        {row.getValue("name")}
      </Link>
    ),
  },
  {
    accessorKey: "description",
    header: "Description",
    cell: ({ row }: { row: Row<DonorListWithMemberCountFrontend> }) => {
      const description = row.getValue("description") as string | null;
      return (
        <div className="max-w-xs truncate">
          {description || <span className="text-muted-foreground italic">No description</span>}
        </div>
      );
    },
  },
  {
    accessorKey: "memberCount",
    header: ({ column }: { column: Column<DonorListWithMemberCountFrontend> }) => {
      return (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          <Users className="mr-2 h-4 w-4" />
          Members
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }: { row: Row<DonorListWithMemberCountFrontend> }) => {
      const count = row.getValue("memberCount") as number;
      return (
        <Badge variant="outline" className="font-medium">
          {count} {count === 1 ? "donor" : "donors"}
        </Badge>
      );
    },
  },
  {
    accessorKey: "isActive",
    header: "Status",
    cell: ({ row }: { row: Row<DonorListWithMemberCountFrontend> }) => (
      <div
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
          row.original.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
        }`}
      >
        {row.original.isActive ? "Active" : "Inactive"}
      </div>
    ),
  },
  {
    accessorKey: "createdAt",
    header: ({ column }: { column: Column<DonorListWithMemberCountFrontend> }) => {
      return (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Created
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }: { row: Row<DonorListWithMemberCountFrontend> }) => {
      const dateString = row.getValue("createdAt") as string;
      const date = new Date(dateString);
      return date.toLocaleDateString();
    },
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }: { row: Row<DonorListWithMemberCountFrontend> }) => {
      const list = row.original;

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/lists/${list.id}`}>
                <Users className="h-4 w-4 mr-2" />
                View Members
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/lists/${list.id}/edit`}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DeleteListButton listId={list.id} listName={list.name} />
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
