"use client";

import React, { useState, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Plus, RefreshCw, Eye, Trash2, Mail, Send, FileText, HelpCircle, Edit } from "lucide-react";
import Link from "next/link";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { useCommunications } from "@/app/hooks/use-communications";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/app/lib/trpc/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useSessionTrackingStats } from "@/app/hooks/use-email-tracking";

// Enhanced status badge function
function getEnhancedStatusBadge(campaign: ExistingCampaign, trackingStats?: any) {
  const { status, totalEmails, sentEmails, totalDonors, completedDonors } = campaign;

  // If the campaign failed, show failed status
  if (status === "FAILED") {
    return <Badge variant="destructive">Failed</Badge>;
  }

  // If it's a draft, show draft status
  if (status === "DRAFT") {
    return (
      <Badge variant="outline" className="border-gray-500 text-gray-700 bg-gray-50">
        Draft
      </Badge>
    );
  }

  // If it's pending (queued for generation but not yet started)
  if (status === "PENDING") {
    return (
      <Badge variant="outline" className="border-blue-500 text-blue-700 bg-blue-50">
        Pending
      </Badge>
    );
  }

  // If still generating emails (actively generating or in progress)
  if (
    status === "GENERATING" ||
    status === "IN_PROGRESS" ||
    (completedDonors < totalDonors && status !== "COMPLETED")
  ) {
    return (
      <Badge variant="outline" className="border-orange-500 text-orange-700 bg-orange-50">
        Generating ({completedDonors}/{totalDonors})
      </Badge>
    );
  }

  // All emails generated, check sending status
  if (totalEmails > 0) {
    // All emails sent
    if (sentEmails === totalEmails) {
      return (
        <Badge variant="outline" className="border-green-500 text-green-700 bg-green-50">
          Completed
        </Badge>
      );
    }

    // Some emails sent, some not
    if (sentEmails > 0) {
      return (
        <Badge variant="outline" className="border-blue-500 text-blue-700 bg-blue-50">
          In Progress
        </Badge>
      );
    }

    // No emails sent yet, but all generated
    return (
      <Badge variant="outline" className="border-purple-500 text-purple-700 bg-purple-50">
        Ready to Send
      </Badge>
    );
  }

  // Fallback cases
  if (status === "COMPLETED") {
    return (
      <Badge variant="outline" className="border-green-500 text-green-700 bg-green-50">
        Completed
      </Badge>
    );
  }

  return <Badge variant="secondary">Unknown</Badge>;
}

// Enhanced status component that gets tracking stats
function CampaignStatus({ campaign }: { campaign: ExistingCampaign }) {
  const { data: trackingStats } = useSessionTrackingStats(campaign.id);
  return getEnhancedStatusBadge(campaign, trackingStats);
}

// Enhanced progress component for individual campaigns
function CampaignProgress({ campaign }: { campaign: ExistingCampaign }) {
  const { data: trackingStats, isLoading } = useSessionTrackingStats(campaign.id);

  const generated = campaign.totalEmails;
  const sent = campaign.sentEmails;
  const opened = trackingStats?.uniqueOpens || 0;

  const sentPercentage = generated > 0 ? (sent / generated) * 100 : 0;
  const openedPercentage = sent > 0 ? (opened / sent) * 100 : 0;

  return (
    <div className="space-y-2 min-w-[280px]">
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-lg font-semibold text-green-600">{generated}</div>
          <div className="text-xs text-muted-foreground">Generated</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-blue-600">{sent}</div>
          <div className="text-xs text-muted-foreground">Sent ({sentPercentage.toFixed(0)}%)</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-purple-600">{isLoading ? "..." : opened}</div>
          <div className="text-xs text-muted-foreground">
            Opened {sent > 0 ? `(${openedPercentage.toFixed(0)}%)` : "(0%)"}
          </div>
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs w-14 text-blue-600">Sent</span>
          <Progress value={sentPercentage} className="flex-1 h-2" />
          <span className="text-xs text-muted-foreground w-8">{sentPercentage.toFixed(0)}%</span>
        </div>
        {sent > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs w-14 text-purple-600">Opened</span>
            <Progress value={openedPercentage} className="flex-1 h-2" />
            <span className="text-xs text-muted-foreground w-8">{openedPercentage.toFixed(0)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

interface ExistingCampaign {
  id: number;
  campaignName: string;
  status: string;
  totalDonors: number;
  completedDonors: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  sentEmails: number;
  totalEmails: number;
  openedEmails?: number;
}

interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: ExistingCampaign | null;
  action: "draft" | "send" | "delete";
  onConfirm: (sendType?: "all" | "unsent") => void;
  isLoading: boolean;
  userEmail: string | null;
}

function ConfirmationDialog({
  open,
  onOpenChange,
  campaign,
  action,
  onConfirm,
  isLoading,
  userEmail,
}: ConfirmationDialogProps) {
  const [sendType, setSendType] = useState<"all" | "unsent">("unsent");

  // Get tracking stats for this campaign
  const { data: trackingStats } = useSessionTrackingStats(campaign?.id || 0);

  if (!campaign) return null;

  const actionText = action === "draft" ? "save as drafts" : action === "send" ? "send" : "delete";
  const actionTitle = action === "draft" ? "Save to Draft" : action === "send" ? "Send Emails" : "Delete Campaign";

  const unsentCount = campaign.totalEmails - campaign.sentEmails;
  const openedCount = trackingStats?.uniqueOpens || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{actionTitle}</DialogTitle>
          <DialogDescription>Please confirm the details before proceeding.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="font-medium">Campaign:</span>
              <span>{campaign.campaignName}</span>
            </div>
            {action !== "delete" && (
              <>
                <div className="flex justify-between">
                  <span className="font-medium">Generated emails:</span>
                  <span>{campaign.totalEmails}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Sent emails:</span>
                  <span>{campaign.sentEmails}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Unsent emails:</span>
                  <span>{unsentCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Opened emails:</span>
                  <span>
                    {openedCount}
                    {campaign.sentEmails > 0 ? ` (${((openedCount / campaign.sentEmails) * 100).toFixed(0)}%)` : ""}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Gmail account:</span>
                  <span className="text-sm text-muted-foreground">{userEmail || "Not connected"}</span>
                </div>

                {action === "send" && (
                  <div className="space-y-3">
                    <div className="font-medium">Send options:</div>
                    <div className="space-y-2">
                      <label className="flex items-center space-x-2">
                        <input
                          type="radio"
                          name="sendType"
                          value="unsent"
                          checked={sendType === "unsent"}
                          onChange={(e) => setSendType(e.target.value as "all" | "unsent")}
                          className="form-radio"
                        />
                        <span>Send only unsent emails ({unsentCount} emails)</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="radio"
                          name="sendType"
                          value="all"
                          checked={sendType === "all"}
                          onChange={(e) => setSendType(e.target.value as "all" | "unsent")}
                          className="form-radio"
                        />
                        <span>Resend all emails ({campaign.totalEmails} emails)</span>
                      </label>
                    </div>
                  </div>
                )}

                {action === "draft" && (
                  <div className="flex justify-between">
                    <span className="font-medium">Action:</span>
                    <span>Will save {campaign.totalEmails} emails as drafts</span>
                  </div>
                )}
              </>
            )}
            {action === "delete" && (
              <div className="flex justify-between">
                <span className="font-medium">Action:</span>
                <span>Will permanently delete this campaign and all associated emails</span>
              </div>
            )}
          </div>

          {action === "send" && (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-md">
              <p className="text-sm text-orange-800">
                ⚠️ <strong>Warning:</strong> This will send {sendType === "all" ? campaign.totalEmails : unsentCount}{" "}
                emails immediately. This action cannot be undone.
              </p>
            </div>
          )}

          {action === "delete" && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">
                ⚠️ <strong>Warning:</strong> This will permanently delete the campaign &quot;{campaign.campaignName}
                &quot; and all {campaign.totalEmails} associated generated emails. This action cannot be undone.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(action === "send" ? sendType : undefined)} disabled={isLoading}>
            {isLoading ? "Processing..." : actionTitle}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const DEFAULT_PAGE_SIZE = 20;

function ExistingCampaignsContent() {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [confirmationDialog, setConfirmationDialog] = useState<{
    open: boolean;
    campaign: ExistingCampaign | null;
    action: "draft" | "send" | "delete";
  }>({ open: false, campaign: null, action: "draft" });

  const { listCampaigns, saveToDraft, sendBulkEmails, deleteCampaign } = useCommunications();

  // Get Gmail connection status
  const { data: gmailStatus } = trpc.gmail.getGmailConnectionStatus.useQuery();

  const {
    data: campaignsResponse,
    isLoading,
    error,
  } = listCampaigns({
    limit: pageSize,
    offset: (currentPage - 1) * pageSize,
  });

  const campaigns = campaignsResponse?.campaigns || [];
  const totalCount = campaignsResponse?.totalCount || 0;
  const pageCount = Math.ceil(totalCount / pageSize);

  const ActionButtonWrapper = ({
    disabled,
    tooltipContent,
    children,
    className,
  }: {
    disabled: boolean;
    tooltipContent: string;
    children: React.ReactNode;
    className?: string;
  }) => {
    if (disabled) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`flex items-center ${className || ""}`}>
              {children}
              <HelpCircle className="ml-1 h-4 w-4 text-muted-foreground" />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{tooltipContent}</p>
          </TooltipContent>
        </Tooltip>
      );
    }

    return <div className={className}>{children}</div>;
  };

  const handleRetryCampaign = async (campaignId: number) => {
    // TODO: Implement retry functionality
    toast.success("Campaign retry functionality will be implemented soon");
  };

  const handleDeleteCampaign = (campaign: ExistingCampaign) => {
    setConfirmationDialog({ open: true, campaign, action: "delete" });
  };

  const handleSaveToDraft = (campaign: ExistingCampaign) => {
    if (!gmailStatus?.isConnected) {
      toast.error("Please connect your Gmail account first in Settings");
      return;
    }
    setConfirmationDialog({ open: true, campaign, action: "draft" });
  };

  const handleSendEmails = (campaign: ExistingCampaign) => {
    if (!gmailStatus?.isConnected) {
      toast.error("Please connect your Gmail account first in Settings");
      return;
    }
    setConfirmationDialog({ open: true, campaign, action: "send" });
  };

  const handleConfirmAction = async (sendType?: "all" | "unsent") => {
    if (!confirmationDialog.campaign) return;

    const { campaign, action } = confirmationDialog;

    try {
      let promise: Promise<any> | undefined;
      if (action === "draft") {
        promise = saveToDraft.mutateAsync({ sessionId: campaign.id });
        toast.promise(promise, {
          loading: "Saving to drafts...",
          success: "Emails saved to drafts successfully!",
          error: "Failed to save to drafts.",
        });
      } else if (action === "send") {
        promise = sendBulkEmails.mutateAsync({
          sessionId: campaign.id,
          sendType: sendType || "unsent",
        });
        toast.promise(promise, {
          loading: "Sending emails...",
          success: "Emails are being sent!",
          error: "Failed to send emails.",
        });
      } else if (action === "delete") {
        promise = deleteCampaign.mutateAsync({ campaignId: campaign.id });
        toast.promise(promise, {
          loading: "Deleting campaign...",
          success: "Campaign deleted successfully!",
          error: "Failed to delete campaign.",
        });
      }
      await promise;
    } catch (error) {
      // Toast will show the error
    } finally {
      setConfirmationDialog({ open: false, campaign: null, action: "draft" });
    }
  };

  const isLoadingAction = saveToDraft.isPending || sendBulkEmails.isPending || deleteCampaign.isPending;

  const columns: ColumnDef<ExistingCampaign>[] = [
    {
      accessorKey: "campaignName",
      header: "Campaign Name",
      cell: ({ row }) => <div className="font-medium">{row.getValue("campaignName")}</div>,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <CampaignStatus campaign={row.original} />,
    },
    {
      accessorKey: "progress",
      header: "Progress",
      cell: ({ row }) => {
        const campaign = row.original;
        return <CampaignProgress campaign={campaign} />;
      },
    },
    {
      accessorKey: "createdAt",
      header: "Created At",
      cell: ({ row }) => new Date(row.getValue("createdAt")).toLocaleDateString(),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const campaign = row.original;
        const isProcessing = campaign.status === "IN_PROGRESS" || campaign.status === "GENERATING";
        const isCompleted = campaign.status === "COMPLETED";
        const hasFailed = campaign.status === "FAILED";
        const isGmailConnected = gmailStatus?.isConnected ?? false;
        const isDisabled = isProcessing || !isGmailConnected;

        let tooltipContent = "";
        if (isProcessing) {
          tooltipContent = "Campaign is currently processing and cannot be modified.";
        } else if (!isGmailConnected) {
          tooltipContent = "Please connect your Gmail account in Settings to enable this action.";
        }

        return (
          <TooltipProvider>
            <div className="flex items-center">
              <Link href={`/campaign/results/${campaign.id}`} className="mr-2">
                <Button variant="outline" size="sm">
                  <Eye className="mr-2 h-4 w-4" />
                  View
                </Button>
              </Link>

              {/* Edit Campaign Button - Allow editing if not currently processing */}
              <ActionButtonWrapper
                disabled={isProcessing}
                tooltipContent={isProcessing ? "Cannot edit campaign while it's processing" : ""}
                className="mr-2"
              >
                <Link href={`/campaign/edit/${campaign.id}`}>
                  <Button variant="outline" size="sm" disabled={isProcessing}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                </Link>
              </ActionButtonWrapper>

              {(isCompleted || isProcessing) && (
                <>
                  <ActionButtonWrapper disabled={isDisabled} tooltipContent={tooltipContent} className="mr-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSaveToDraft(campaign)}
                      disabled={isDisabled}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Save to Drafts
                    </Button>
                  </ActionButtonWrapper>

                  <ActionButtonWrapper disabled={isDisabled} tooltipContent={tooltipContent}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSendEmails(campaign)}
                      disabled={isDisabled}
                    >
                      <Send className="mr-2 h-4 w-4" />
                      Send Emails
                    </Button>
                  </ActionButtonWrapper>
                </>
              )}
              {hasFailed && (
                <Button variant="outline" size="sm" onClick={() => handleRetryCampaign(campaign.id)} className="mr-2">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
              )}
              <Button variant="destructive" size="sm" onClick={() => handleDeleteCampaign(campaign)}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </div>
          </TooltipProvider>
        );
      },
    },
  ];

  if (isLoading) {
    return (
      <div className="p-6">
        <Skeleton className="h-10 w-1/4 mb-4" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-500">Error loading campaigns: {error.message}</p>
      </div>
    );
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1); // Reset to first page when page size changes
  };

  return (
    <div className="p-6">
      <ConfirmationDialog
        {...confirmationDialog}
        onOpenChange={(open) => setConfirmationDialog({ ...confirmationDialog, open })}
        onConfirm={handleConfirmAction}
        isLoading={isLoadingAction}
        userEmail={gmailStatus?.email || null}
      />
      <DataTable
        columns={columns}
        data={campaigns}
        totalItems={totalCount}
        pageCount={pageCount}
        pageSize={pageSize}
        currentPage={currentPage}
        onPageChange={handlePageChange}
        title="Existing Campaigns"
        // TODO: bring back create button
        // ctaButton={
        //   <Button asChild>
        //     <Link href="/campaign/steps/1">
        //       <Plus className="mr-2 h-4 w-4" /> Create Campaign
        //     </Link>
        //   </Button>
        // }
      />
    </div>
  );
}

export default function ExistingCampaignsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ExistingCampaignsContent />
    </Suspense>
  );
}
