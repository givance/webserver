"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";
import { useDonors } from "@/app/hooks/use-donors";

interface DeleteDonorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  donorId: number;
  donorName: string;
  listId?: number;
  listName?: string;
  onSuccess?: () => void;
}

type DeleteMode = "fromList" | "fromAllLists" | "entirely";

export function DeleteDonorDialog({
  open,
  onOpenChange,
  donorId,
  donorName,
  listId,
  listName,
  onSuccess,
}: DeleteDonorDialogProps) {
  const [deleteMode, setDeleteMode] = useState<DeleteMode>("fromList");
  const { deleteDonor, isDeleting, getDonorListCount } = useDonors();

  // Get the count of lists this donor belongs to
  const { data: listCountData } = getDonorListCount(donorId);
  const listCount = listCountData?.count || 0;

  // Reset delete mode when dialog opens
  useEffect(() => {
    if (open) {
      // If donor is only in one list or we're not in a list context, default to delete entirely
      if (!listId || listCount <= 1) {
        setDeleteMode("entirely");
      } else {
        setDeleteMode("fromList");
      }
    }
  }, [open, listId, listCount]);

  const handleDelete = async () => {
    const success = await deleteDonor(donorId, {
      deleteMode,
      listId: deleteMode === "fromList" ? listId : undefined,
    });

    if (success) {
      onOpenChange(false);
      onSuccess?.();
    }
  };

  // If not in a list context or donor is only in one list, show simple delete confirmation
  if (!listId || listCount <= 1) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Donor</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete {donorName}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>All data associated with this donor will be permanently deleted.</span>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete Donor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Show options when donor is in multiple lists
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remove or Delete Donor</DialogTitle>
          <DialogDescription>
            {donorName} is in {listCount} list{listCount !== 1 ? "s" : ""}. Choose how you want to proceed:
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={deleteMode} onValueChange={(value) => setDeleteMode(value as DeleteMode)}>
          <div className="space-y-3">
            {listName && (
              <div className="flex items-start space-x-2 rounded-md border p-3">
                <RadioGroupItem value="fromList" id="fromList" className="mt-1" />
                <div className="grid gap-1.5 leading-none">
                  <Label htmlFor="fromList" className="font-medium cursor-pointer">
                    Remove from &quot;{listName}&quot; only
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    The donor will remain in {listCount - 1} other list{listCount - 1 !== 1 ? "s" : ""} and their data
                    will be preserved.
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-start space-x-2 rounded-md border p-3">
              <RadioGroupItem value="fromAllLists" id="fromAllLists" className="mt-1" />
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="fromAllLists" className="font-medium cursor-pointer">
                  Remove from all lists
                </Label>
                <p className="text-sm text-muted-foreground">
                  The donor will be removed from all {listCount} lists but their profile and data will be preserved.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-2 rounded-md border border-destructive/50 p-3">
              <RadioGroupItem value="entirely" id="entirely" className="mt-1" />
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="entirely" className="font-medium cursor-pointer text-destructive">
                  Delete donor entirely
                </Label>
                <p className="text-sm text-muted-foreground">
                  Permanently delete the donor and all associated data. This cannot be undone.
                </p>
              </div>
            </div>
          </div>
        </RadioGroup>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            variant={deleteMode === "entirely" ? "destructive" : "default"}
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting
              ? "Processing..."
              : deleteMode === "fromList"
              ? "Remove from List"
              : deleteMode === "fromAllLists"
              ? "Remove from All Lists"
              : "Delete Donor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
