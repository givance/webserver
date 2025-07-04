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
import { Mail, Users } from "lucide-react";
import { GeneratedEmail } from "./types";

interface BulkGenerationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDonorsCount: number;
  allGeneratedEmails: GeneratedEmail[];
  approvedCount: number;
  pendingCount: number;
  selectedSignatureType: "none" | "custom" | "staff";
  currentSignature: string;
  isStartingBulkGeneration: boolean;
  onConfirm: () => void;
}

export function BulkGenerationDialog({
  open,
  onOpenChange,
  selectedDonorsCount,
  allGeneratedEmails,
  approvedCount,
  pendingCount,
  selectedSignatureType,
  currentSignature,
  isStartingBulkGeneration,
  onConfirm,
}: BulkGenerationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Confirm Campaign Launch
          </DialogTitle>
          <DialogDescription className="text-sm">
            You&apos;re about to launch a campaign to generate personalized emails for all selected donors based on
            your current instruction.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Summary Card - more compact */}
          <div className="p-3 border rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-3 w-3" />
              <span className="text-sm font-medium">Campaign Summary</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-0.5">
                <p className="text-xs font-medium">Total Campaign</p>
                <p className="text-lg font-bold">{selectedDonorsCount}</p>
                <p className="text-xs text-muted-foreground">donors</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-green-600">Already Reviewed</p>
                <p className="text-lg font-bold text-green-600">{allGeneratedEmails.length}</p>
                <p className="text-xs text-muted-foreground">
                  {approvedCount} approved, {pendingCount} pending
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-blue-600">To Be Generated</p>
                <p className="text-lg font-bold text-blue-600">{selectedDonorsCount - allGeneratedEmails.length}</p>
                <p className="text-xs text-muted-foreground">new emails</p>
              </div>
            </div>

            {selectedSignatureType !== "none" && currentSignature && (
              <div className="space-y-2 mt-3">
                <p className="text-xs font-medium">Selected Signature</p>
                <div className="bg-muted rounded p-2">
                  <div
                    className="prose prose-sm max-w-none text-xs"
                    dangerouslySetInnerHTML={{
                      __html:
                        currentSignature.length > 150 ? currentSignature.substring(0, 150) + "..." : currentSignature,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs text-blue-800">
              {allGeneratedEmails.length > 0 ? (
                <>
                  This will launch your campaign for all {selectedDonorsCount} selected donors.{" "}
                  <strong>{approvedCount} approved emails</strong> will be kept exactly as they are.
                  {selectedDonorsCount - allGeneratedEmails.length > 0 ? (
                    <>
                      {" "}
                      <strong>{selectedDonorsCount - allGeneratedEmails.length} new emails</strong> will be
                      generated for the remaining donors.
                    </>
                  ) : (
                    <> All selected donors already have generated emails.</>
                  )}
                </>
              ) : (
                <>
                  This will launch your campaign to generate personalized emails for all {selectedDonorsCount}{" "}
                  selected donors.
                </>
              )}{" "}
              You&apos;ll be redirected to the communication jobs page where you can monitor the progress.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isStartingBulkGeneration}
            size="sm"
          >
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isStartingBulkGeneration} size="sm">
            {isStartingBulkGeneration ? "Launching..." : "Launch Campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}