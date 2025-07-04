"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";

interface RegenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  regenerateOption: "all" | "unapproved";
  onRegenerateOptionChange: (option: "all" | "unapproved") => void;
  allGeneratedEmailsCount: number;
  approvedCount: number;
  pendingCount: number;
  isRegenerating: boolean;
  onConfirm: (onlyUnapproved: boolean) => void;
}

export function RegenerateDialog({
  open,
  onOpenChange,
  regenerateOption,
  onRegenerateOptionChange,
  allGeneratedEmailsCount,
  approvedCount,
  pendingCount,
  isRegenerating,
  onConfirm,
}: RegenerateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Regenerate Emails
          </DialogTitle>
          <DialogDescription className="text-sm">Choose which emails you want to regenerate</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-sm">Regeneration Options</Label>
            <div className="space-y-2">
              <div
                className={cn(
                  "flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-colors",
                  regenerateOption === "all" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                )}
                onClick={() => onRegenerateOptionChange("all")}
              >
                <input
                  type="radio"
                  checked={regenerateOption === "all"}
                  onChange={() => onRegenerateOptionChange("all")}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium">Regenerate ALL emails ({allGeneratedEmailsCount} total)</div>
                  <div className="text-xs text-muted-foreground">This will replace all existing emails</div>
                </div>
              </div>

              <div
                className={cn(
                  "flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-colors",
                  regenerateOption === "unapproved"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50",
                  pendingCount === 0 && "opacity-50 cursor-not-allowed"
                )}
                onClick={() => pendingCount > 0 && onRegenerateOptionChange("unapproved")}
              >
                <input
                  type="radio"
                  checked={regenerateOption === "unapproved"}
                  onChange={() => onRegenerateOptionChange("unapproved")}
                  disabled={pendingCount === 0}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium">Regenerate only unapproved emails ({pendingCount} emails)</div>
                  <div className="text-xs text-muted-foreground">
                    Keep your {approvedCount} approved emails unchanged
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs text-blue-800">
              {regenerateOption === "all"
                ? `This will regenerate all ${allGeneratedEmailsCount} emails using the same instructions.`
                : `This will regenerate ${pendingCount} unapproved emails. Your ${approvedCount} approved emails will remain unchanged.`}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isRegenerating}
            size="sm"
          >
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(regenerateOption === "unapproved")}
            disabled={isRegenerating}
            size="sm"
          >
            {isRegenerating ? "Regenerating..." : "Regenerate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}