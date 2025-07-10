'use client';

import { useCommunications } from '@/app/hooks/use-communications';
import {
  useSessionTrackingStats,
  useMultipleSessionTrackingStats,
} from '@/app/hooks/use-email-tracking';

import { trpc } from '@/app/lib/trpc/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table/DataTable';
import { CampaignScheduleConfig } from '../campaign/components/CampaignScheduleConfig';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ColumnDef } from '@tanstack/react-table';
import { Edit, Eye, FileText, HelpCircle, RefreshCw, Send, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { Suspense, useState } from 'react';
import { toast } from 'sonner';

// Enhanced status badge function
function getEnhancedStatusBadge(campaign: ExistingCampaign, trackingStats?: any) {
  const { status, totalEmails, sentEmails, totalDonors, completedDonors } = campaign;

  // If the campaign failed, show failed status
  if (status === 'FAILED') {
    return <Badge variant="destructive">Failed</Badge>;
  }

  // If it's a draft, show draft status
  if (status === 'DRAFT') {
    return (
      <Badge variant="outline" className="border-gray-500 text-gray-700 bg-gray-50">
        Draft
      </Badge>
    );
  }

  // If it's pending (queued for generation but not yet started)
  if (status === 'PENDING') {
    return (
      <Badge variant="outline" className="border-blue-500 text-blue-700 bg-blue-50">
        Pending
      </Badge>
    );
  }

  // If still generating emails (actively generating or in progress)
  if (completedDonors < totalDonors && status !== 'COMPLETED' && status !== 'FAILED') {
    return (
      <Badge variant="outline" className="border-orange-500 text-orange-700 bg-orange-50">
        Generating ({completedDonors}/{totalDonors})
      </Badge>
    );
  }

  // If status shows as generating but all donors are completed, treat as ready
  if (
    (status === 'GENERATING' || status === 'IN_PROGRESS') &&
    completedDonors >= totalDonors &&
    totalDonors > 0
  ) {
    // No emails sent yet, but all generated
    return (
      <Badge variant="outline" className="border-purple-500 text-purple-700 bg-purple-50">
        Ready to Send
      </Badge>
    );
  }

  // Check for new RUNNING and PAUSED statuses
  if (status === 'RUNNING') {
    return (
      <Badge variant="outline" className="border-blue-500 text-blue-700 bg-blue-50">
        Running
      </Badge>
    );
  }

  if (status === 'PAUSED') {
    return (
      <Badge variant="outline" className="border-yellow-500 text-yellow-700 bg-yellow-50">
        Paused
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
  if (status === 'COMPLETED') {
    return (
      <Badge variant="outline" className="border-green-500 text-green-700 bg-green-50">
        Completed
      </Badge>
    );
  }

  return <Badge variant="secondary">Unknown</Badge>;
}

// Enhanced status component that gets tracking stats from batch data
function CampaignStatus({
  campaign,
  trackingStatsMap,
}: {
  campaign: ExistingCampaign;
  trackingStatsMap: Map<number, any>;
}) {
  const trackingStats = trackingStatsMap.get(campaign.id);
  return getEnhancedStatusBadge(campaign, trackingStats);
}

// Component to show scheduled emails button
// Removed ScheduledEmailsButton - schedule functionality moved to main campaign page

// Enhanced progress component for individual campaigns using batch data
function CampaignProgress({
  campaign,
  trackingStatsMap,
  isLoading,
}: {
  campaign: ExistingCampaign;
  trackingStatsMap: Map<number, any>;
  isLoading?: boolean;
}) {
  const trackingStats = trackingStatsMap.get(campaign.id);
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
          <div className="text-lg font-semibold text-purple-600">{isLoading ? '...' : opened}</div>
          <div className="text-xs text-muted-foreground">
            Opened {sent > 0 ? `(${openedPercentage.toFixed(0)}%)` : '(0%)'}
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
            <span className="text-xs text-muted-foreground w-8">
              {openedPercentage.toFixed(0)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

interface ExistingCampaign {
  id: number;
  campaignName: string;
  status?: any;
  totalDonors: number;
  completedDonors?: any;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  sentEmails?: any;
  totalEmails?: any;
  openedEmails?: number;
}

interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: ExistingCampaign | null;
  action: 'draft' | 'send' | 'delete';
  onConfirm: (sendType?: 'all' | 'unsent') => void;
  isLoading: boolean;
  userEmail: string | null;
  scheduleConfig?: {
    dailyLimit: number;
    minGapMinutes: number;
    maxGapMinutes: number;
  } | null;
  trackingStats?: any;
  customScheduleConfig?: any;
  onScheduleConfigChange?: (config: any) => void;
}

function ConfirmationDialog({
  open,
  onOpenChange,
  campaign,
  action,
  onConfirm,
  isLoading,
  userEmail,
  scheduleConfig,
  trackingStats,
  customScheduleConfig,
  onScheduleConfigChange,
}: ConfirmationDialogProps) {
  const [sendType, setSendType] = useState<'all' | 'unsent'>('unsent');

  if (!campaign) return null;

  const actionText = action === 'draft' ? 'save as drafts' : action === 'send' ? 'send' : 'delete';
  const actionTitle =
    action === 'draft' ? 'Save to Draft' : action === 'send' ? 'Schedule Send' : 'Delete Campaign';

  const unsentCount = campaign.totalEmails - campaign.sentEmails;
  const openedCount = trackingStats?.uniqueOpens || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{actionTitle}</DialogTitle>
          <DialogDescription>Please confirm the details before proceeding.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="font-medium">Campaign:</span>
              <span>{campaign.campaignName}</span>
            </div>
            {action !== 'delete' && (
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
                    {campaign.sentEmails > 0
                      ? ` (${((openedCount / campaign.sentEmails) * 100).toFixed(0)}%)`
                      : ''}
                  </span>
                </div>

                {action === 'send' && (
                  <div className="space-y-3">
                    <div className="font-medium">Schedule Configuration:</div>
                    <CampaignScheduleConfig
                      scheduleConfig={customScheduleConfig}
                      onChange={onScheduleConfigChange!}
                      compact={true}
                    />
                    <div className="space-y-2 text-sm border-t pt-3">
                      <div className="flex justify-between">
                        <span className="font-medium">Emails to schedule:</span>
                        <span>{unsentCount} emails</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Estimated duration:</span>
                        <span>
                          {Math.ceil(
                            unsentCount /
                              (customScheduleConfig?.dailyLimit ||
                                scheduleConfig?.dailyLimit ||
                                150)
                          )}{' '}
                          days
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {action === 'draft' && (
                  <div className="flex justify-between">
                    <span className="font-medium">Action:</span>
                    <span>Will save {campaign.totalEmails} emails as drafts</span>
                  </div>
                )}
              </>
            )}
            {action === 'delete' && (
              <div className="flex justify-between">
                <span className="font-medium">Action:</span>
                <span>Will permanently delete this campaign and all associated emails</span>
              </div>
            )}
          </div>

          {action === 'send' && (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-md">
              <p className="text-sm text-orange-800">
                ⚠️ <strong>Note:</strong> This will schedule {unsentCount} emails to be sent
                automatically. The sending will start immediately and continue based on your
                configured limits.
              </p>
            </div>
          )}

          {action === 'delete' && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">
                ⚠️ <strong>Warning:</strong> This will permanently delete the campaign &quot;
                {campaign.campaignName}
                &quot; and all {campaign.totalEmails} associated generated emails. This action
                cannot be undone.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 border-t pt-4 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(action === 'send' ? sendType : undefined)}
            disabled={isLoading || (action === 'send' && unsentCount === 0)}
          >
            {isLoading ? 'Processing...' : actionTitle}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const DEFAULT_PAGE_SIZE = 20;

function ExistingCampaignsContent() {
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [confirmationDialog, setConfirmationDialog] = useState<{
    open: boolean;
    campaign: ExistingCampaign | null;
    action: 'draft' | 'send' | 'delete';
  }>({ open: false, campaign: null, action: 'draft' });

  const [customScheduleConfig, setCustomScheduleConfig] = useState<any>(undefined);

  const {
    listCampaigns,
    saveToDraft,
    scheduleEmailSend,
    deleteCampaign,
    retryCampaign,
    getScheduleConfig,
    getEmailSchedule,
    isLoadingSaveToDraft,
    isLoadingScheduleEmailSend,
    isLoadingDeleteCampaign,
    isLoadingRetryCampaign,
  } = useCommunications();

  // Get Gmail connection status
  const { data: gmailStatus } = trpc.gmail.getGmailConnectionStatus.useQuery(undefined, {
    refetchInterval: 5000, // Refresh every 5 seconds
    staleTime: 4000,
    refetchOnWindowFocus: false,
  });

  // Get schedule configuration
  const { data: scheduleConfig } = getScheduleConfig(undefined, {
    refetchInterval: 5000, // Refresh every 5 seconds
    staleTime: 4000,
    refetchOnWindowFocus: false,
  });

  const {
    data: campaignsResponse,
    isLoading,
    error,
  } = listCampaigns(
    {
      limit: pageSize,
      offset: (currentPage - 1) * pageSize,
    },
    {
      refetchInterval: 5000, // Refresh every 5 seconds
      staleTime: 4000, // Consider data stale after 4 seconds
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      refetchOnReconnect: true,
    }
  );

  const campaigns = campaignsResponse?.campaigns || [];
  const totalCount = campaignsResponse?.totalCount || 0;
  const pageCount = Math.ceil(totalCount / pageSize);

  // Get tracking stats for all campaigns in batch
  const sessionIds = campaigns.map((c) => c.id);
  const { data: batchTrackingStats, isLoading: isLoadingStats } =
    useMultipleSessionTrackingStats(sessionIds);

  // Create a lookup map for quick access
  const trackingStatsMap = new Map();
  if (batchTrackingStats) {
    batchTrackingStats.forEach((stats) => {
      trackingStatsMap.set(stats.sessionId, stats);
    });
  }

  const handleRetryCampaign = async (campaignId: number) => {
    const promise = retryCampaign({ campaignId });
    toast.promise(promise, {
      loading: 'Retrying campaign...',
      success: (data: any) => data?.message || 'Campaign retry initiated successfully!',
      error: 'Failed to retry campaign. Please check your Trigger.dev configuration.',
    });
    await promise;
  };

  const handleDeleteCampaign = (campaign: ExistingCampaign) => {
    setConfirmationDialog({ open: true, campaign, action: 'delete' });
  };

  const handleSaveToDraft = (campaign: ExistingCampaign) => {
    if (!gmailStatus?.isConnected) {
      toast.error('Please connect your Gmail account first in Settings');
      return;
    }
    setConfirmationDialog({ open: true, campaign, action: 'draft' });
  };

  const handleSendEmails = (campaign: ExistingCampaign) => {
    if (!gmailStatus?.isConnected) {
      toast.error('Please connect your Gmail account first in Settings');
      return;
    }
    setConfirmationDialog({ open: true, campaign, action: 'send' });
  };

  const handleConfirmAction = async (sendType?: 'all' | 'unsent') => {
    if (!confirmationDialog.campaign) return;

    const { campaign, action } = confirmationDialog;

    try {
      let promise: Promise<any> | undefined;
      if (action === 'draft') {
        promise = saveToDraft({ sessionId: campaign.id });
        toast.promise(promise, {
          loading: 'Saving to drafts...',
          success: 'Emails saved to drafts successfully!',
          error: (err) => err?.message || 'Failed to save to drafts.',
        });
      } else if (action === 'send') {
        promise = scheduleEmailSend({
          sessionId: campaign.id,
          scheduleConfig: customScheduleConfig,
        });
        toast.promise(promise, {
          loading: 'Scheduling emails...',
          success: (data) => {
            // Navigate to campaign view after successful scheduling
            setTimeout(() => {
              router.push(`/campaign/${campaign.id}`);
            }, 1500);
            return `Successfully scheduled ${data.scheduled} emails! Redirecting to campaign view...`;
          },
          error: (err) => {
            // Extract the actual error message from tRPC error
            const message = err?.message || err?.data?.message || 'Failed to schedule emails.';
            return message;
          },
        });
      } else if (action === 'delete') {
        promise = deleteCampaign({ campaignId: campaign.id });
        toast.promise(promise, {
          loading: 'Deleting campaign...',
          success: 'Campaign deleted successfully!',
          error: (err) => err?.message || 'Failed to delete campaign.',
        });
      }
      await promise;
    } catch (error) {
      // Toast will show the error
    } finally {
      setConfirmationDialog({ open: false, campaign: null, action: 'draft' });
    }
  };

  const isLoadingAction =
    isLoadingSaveToDraft ||
    isLoadingScheduleEmailSend ||
    isLoadingDeleteCampaign ||
    isLoadingRetryCampaign;

  const columns: ColumnDef<ExistingCampaign>[] = [
    {
      accessorKey: 'campaignName',
      header: 'Campaign Name',
      cell: ({ row }) => {
        const campaign = row.original;
        return (
          <Link
            href={`/campaign/${campaign.id}`}
            className="font-medium hover:text-primary hover:underline cursor-pointer"
          >
            {row.getValue('campaignName')}
          </Link>
        );
      },
    },
    {
      accessorKey: 'donors',
      header: 'Donors',
      cell: ({ row }) => {
        const campaign = row.original;
        const { totalDonors, completedDonors } = campaign;
        return (
          <div className="text-center">
            <div className="text-sm font-medium">{totalDonors}</div>
            <div className="text-xs text-muted-foreground">
              {completedDonors}/{totalDonors} processed
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const campaign = row.original;
        return <CampaignStatus campaign={campaign} trackingStatsMap={trackingStatsMap} />;
      },
    },
    {
      accessorKey: 'progress',
      header: 'Progress',
      cell: ({ row }) => {
        const campaign = row.original;
        return (
          <CampaignProgress
            campaign={campaign}
            trackingStatsMap={trackingStatsMap}
            isLoading={isLoadingStats}
          />
        );
      },
    },
    {
      accessorKey: 'createdAt',
      header: 'Created At',
      cell: ({ row }) => new Date(row.getValue('createdAt')).toLocaleDateString(),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const campaign = row.original;
        const allEmailsGenerated =
          campaign.completedDonors >= campaign.totalDonors && campaign.totalDonors > 0;
        const isProcessing =
          (campaign.status === 'IN_PROGRESS' ||
            campaign.status === 'GENERATING' ||
            campaign.status === 'RUNNING') &&
          !allEmailsGenerated;
        const isCompleted = campaign.status === 'COMPLETED' || allEmailsGenerated;
        const hasFailed = campaign.status === 'FAILED';
        const isGmailConnected = gmailStatus?.isConnected ?? false;
        const isDisabled = isProcessing || !isGmailConnected;

        let tooltipContent = '';
        if (isProcessing) {
          tooltipContent = 'Campaign is currently processing and cannot be modified.';
        } else if (!isGmailConnected) {
          tooltipContent = 'Please connect your Gmail account in Settings to enable this action.';
        }

        const showSaveToDraft = isCompleted || campaign.status === 'READY_TO_SEND';
        const showScheduleSend =
          campaign.status === 'READY_TO_SEND' ||
          (campaign.status === 'PAUSED' && campaign.totalEmails > 0);
        const showRetry = hasFailed || campaign.status === 'PENDING';

        // Determine disabled states and tooltips for each button
        const saveToDraftDisabled = isDisabled || !showSaveToDraft;
        const scheduleSendDisabled =
          !isGmailConnected ||
          (!showScheduleSend &&
            campaign.status !== 'READY_TO_SEND' &&
            campaign.status !== 'PAUSED');
        const retryDisabled = !showRetry;

        const getSaveToDraftTooltip = () => {
          if (!showSaveToDraft)
            return 'Campaign must be ready to send or completed to save to drafts';
          if (campaign.status === 'RUNNING')
            return 'Campaign is currently running and cannot be modified';
          if (campaign.status === 'PAUSED')
            return 'Campaign is paused and cannot be saved to drafts';
          if (!isGmailConnected)
            return 'Please connect your Gmail account in Settings to enable this action';
          return 'Save to drafts';
        };

        const getScheduleSendTooltip = () => {
          if (campaign.status === 'RUNNING') return 'Campaign is already running';
          if (campaign.status === 'PAUSED') return 'Resume campaign to continue sending';
          if (campaign.status === 'COMPLETED') return 'Campaign has already been completed';
          if (!showScheduleSend && campaign.status !== 'READY_TO_SEND')
            return 'Campaign must be ready to send';
          if (!isGmailConnected)
            return 'Please connect your Gmail account in Settings to enable this action';
          return campaign.status === 'READY_TO_SEND' ? 'Launch campaign' : 'Schedule send';
        };

        const getRetryTooltip = () => {
          if (!showRetry) return 'Retry is only available for failed or pending campaigns';
          return 'Retry campaign';
        };

        return (
          <TooltipProvider>
            <div className="flex items-center gap-1">
              {/* View button - always enabled */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href={`/campaign/${campaign.id}`}>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Eye className="h-4 w-4" />
                      <span className="sr-only">View campaign</span>
                    </Button>
                  </Link>
                </TooltipTrigger>
                <TooltipContent>View campaign</TooltipContent>
              </Tooltip>

              {/* Edit button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={isProcessing ? 'cursor-not-allowed' : ''}>
                    <Link
                      href={isProcessing ? '#' : `/campaign/edit/${campaign.id}`}
                      onClick={isProcessing ? (e) => e.preventDefault() : undefined}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={isProcessing}
                        className="h-8 w-8"
                      >
                        <Edit className="h-4 w-4" />
                        <span className="sr-only">Edit campaign</span>
                      </Button>
                    </Link>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {isProcessing ? "Cannot edit campaign while it's processing" : 'Edit campaign'}
                </TooltipContent>
              </Tooltip>

              {/* Save to drafts button - always show, disable when not applicable */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={saveToDraftDisabled ? 'cursor-not-allowed' : ''}>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={saveToDraftDisabled ? undefined : () => handleSaveToDraft(campaign)}
                      disabled={saveToDraftDisabled}
                      className="h-8 w-8"
                    >
                      <FileText className="h-4 w-4" />
                      <span className="sr-only">Save to drafts</span>
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{getSaveToDraftTooltip()}</TooltipContent>
              </Tooltip>

              {/* Schedule send button - always show, disable when not applicable */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={scheduleSendDisabled ? 'cursor-not-allowed' : ''}>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={scheduleSendDisabled ? undefined : () => handleSendEmails(campaign)}
                      disabled={scheduleSendDisabled}
                      className="h-8 w-8"
                    >
                      <Send className="h-4 w-4" />
                      <span className="sr-only">Schedule send</span>
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{getScheduleSendTooltip()}</TooltipContent>
              </Tooltip>

              {/* Retry button - always show, disable when not applicable */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={retryDisabled ? 'cursor-not-allowed' : ''}>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={retryDisabled ? undefined : () => handleRetryCampaign(campaign.id)}
                      disabled={retryDisabled}
                      className="h-8 w-8"
                    >
                      <RefreshCw className="h-4 w-4" />
                      <span className="sr-only">Retry campaign</span>
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{getRetryTooltip()}</TooltipContent>
              </Tooltip>

              {/* Delete button - always enabled */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteCampaign(campaign)}
                    className="h-8 w-8 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Delete campaign</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete campaign</TooltipContent>
              </Tooltip>
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
        onOpenChange={(open) => {
          setConfirmationDialog({ ...confirmationDialog, open });
          if (!open) {
            // Reset custom schedule config when closing
            setCustomScheduleConfig(null);
          }
        }}
        onConfirm={handleConfirmAction}
        isLoading={isLoadingAction}
        userEmail={gmailStatus?.email || null}
        scheduleConfig={scheduleConfig}
        trackingStats={
          confirmationDialog.campaign
            ? trackingStatsMap.get(confirmationDialog.campaign.id)
            : undefined
        }
        customScheduleConfig={customScheduleConfig}
        onScheduleConfigChange={setCustomScheduleConfig}
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
        ctaButton={
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Auto-refreshing every 5s</span>
          </div>
        }
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
