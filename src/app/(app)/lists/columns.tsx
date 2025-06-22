"use client";

import { ColumnDef, Column, Row } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, Trash2, Edit, Users } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { useLists } from "@/app/hooks/use-lists";
import React from "react";
import { DeleteListDialog } from "@/components/lists/delete-list-dialog";
import type { ListDeletionMode } from "@/app/lib/data/donor-lists";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
function DeleteListButton({ list }: { list: DonorListWithMemberCountFrontend }) {
  const [open, setOpen] = useState(false);
  const { deleteList, isDeleting } = useLists();

  const handleDelete = async (deleteMode: ListDeletionMode) => {
    await deleteList(list.id, deleteMode);
  };

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(true)}
              className="h-8 w-8"
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Delete list</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete list</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DeleteListDialog
        open={open}
        onOpenChange={setOpen}
        listId={list.id}
        listName={list.name}
        memberCount={list.memberCount}
        onDelete={handleDelete}
        isDeleting={isDeleting}
      />
    </>
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
    header: "Actions",
    enableHiding: false,
    cell: ({ row }: { row: Row<DonorListWithMemberCountFrontend> }) => {
      const list = row.original;

      return (
        <div className="flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  asChild
                  className="h-8 w-8"
                >
                  <Link href={`/lists/${list.id}/edit`}>
                    <Edit className="h-4 w-4" />
                    <span className="sr-only">Edit list</span>
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit list</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <DeleteListButton list={list} />
        </div>
      );
    },
  },
];
