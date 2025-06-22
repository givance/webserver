"use client";

import React, { useState, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { AlertCircle, Trash2, Users } from "lucide-react";
import { trpc } from "@/app/lib/trpc/client";
import type { ListDeletionMode } from "@/app/lib/data/donor-lists";

interface DeleteListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listId: number;
  listName: string;
  memberCount: number;
  onDelete: (deleteMode: ListDeletionMode) => Promise<void>;
  isDeleting?: boolean;
}

export function DeleteListDialog({
  open,
  onOpenChange,
  listId,
  listName,
  memberCount,
  onDelete,
  isDeleting = false,
}: DeleteListDialogProps) {
  const [deleteMode, setDeleteMode] = useState<ListDeletionMode>("listOnly");
  const [exclusiveDonorCount, setExclusiveDonorCount] = useState<number | null>(null);

  // Get exclusive donor count when dialog opens
  const { data: exclusiveCountData } = trpc.lists.getExclusiveDonorCount.useQuery(
    { id: listId },
    { enabled: open }
  );

  useEffect(() => {
    if (exclusiveCountData) {
      setExclusiveDonorCount(exclusiveCountData.count);
    }
  }, [exclusiveCountData]);

  const handleDelete = async () => {
    await onDelete(deleteMode);
    onOpenChange(false);
  };

  const getDeleteButtonText = () => {
    if (isDeleting) return "Deleting...";
    
    switch (deleteMode) {
      case "withExclusiveDonors":
        return exclusiveDonorCount !== null 
          ? `Delete List & ${exclusiveDonorCount} Donor${exclusiveDonorCount !== 1 ? 's' : ''}`
          : "Delete List & Exclusive Donors";
      case "withAllDonors":
        return `Delete List & ${memberCount} Donor${memberCount !== 1 ? 's' : ''}`;
      default:
        return "Delete List Only";
    }
  };

  const getWarningMessage = () => {
    switch (deleteMode) {
      case "withExclusiveDonors":
        if (exclusiveDonorCount === null) return "";
        if (exclusiveDonorCount === 0) {
          return "No donors are exclusively in this list. Only the list will be deleted.";
        }
        return `${exclusiveDonorCount} donor${exclusiveDonorCount !== 1 ? 's are' : ' is'} only in this list and will be permanently deleted.`;
      case "withAllDonors":
        return `All ${memberCount} donor${memberCount !== 1 ? 's' : ''} in this list will be permanently deleted, even if they belong to other lists.`;
      default:
        return "The list will be deleted but all donors will be preserved.";
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            Delete List: {listName}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Choose how you want to delete this list:
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Users className="h-4 w-4" />
          <span>This list contains {memberCount} donor{memberCount !== 1 ? 's' : ''}</span>
        </div>

        <div className="my-6">
          <RadioGroup value={deleteMode} onValueChange={(value) => setDeleteMode(value as ListDeletionMode)}>
            <div className="space-y-4">
              <div className="flex items-start space-x-3 rounded-lg border p-4 hover:bg-muted/50">
                <RadioGroupItem value="listOnly" id="listOnly" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="listOnly" className="font-medium cursor-pointer">
                    Delete list only
                  </Label>
                  <div className="text-sm text-muted-foreground mt-1">
                    Remove the list but keep all donors. Donors will remain in your database and other lists.
                  </div>
                </div>
              </div>

              <div className="flex items-start space-x-3 rounded-lg border p-4 hover:bg-muted/50">
                <RadioGroupItem value="withExclusiveDonors" id="withExclusiveDonors" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="withExclusiveDonors" className="font-medium cursor-pointer">
                    Delete list and donors only in this list
                  </Label>
                  <div className="text-sm text-muted-foreground mt-1">
                    Remove the list and delete donors that don&apos;t belong to any other lists.
                    {exclusiveDonorCount !== null && exclusiveDonorCount > 0 && (
                      <span className="block mt-1 text-amber-600 dark:text-amber-500">
                        {exclusiveDonorCount} donor{exclusiveDonorCount !== 1 ? 's' : ''} will be deleted
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-start space-x-3 rounded-lg border p-4 hover:bg-muted/50">
                <RadioGroupItem value="withAllDonors" id="withAllDonors" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="withAllDonors" className="font-medium cursor-pointer">
                    Delete list and all its donors
                  </Label>
                  <div className="text-sm text-muted-foreground mt-1">
                    Remove the list and permanently delete ALL donors in it, even if they belong to other lists.
                    <span className="block mt-1 text-red-600 dark:text-red-500">
                      This will delete {memberCount} donor{memberCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </RadioGroup>
        </div>

        {deleteMode !== "listOnly" && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 p-4">
            <div className="flex gap-2">
              <Trash2 className="h-5 w-5 text-red-600 dark:text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-red-800 dark:text-red-200">
                  Warning: This action cannot be undone
                </div>
                <div className="text-sm text-red-700 dark:text-red-300 mt-1">
                  {getWarningMessage()}
                </div>
              </div>
            </div>
          </div>
        )}

        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
            className="min-w-[200px]"
          >
            {getDeleteButtonText()}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}