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
import { Separator } from '@/components/ui/separator';
import { Clock, Mail, Pause, Play, ChevronDown, ChevronRight } from 'lucide-react';
import { CampaignScheduleConfig } from '../campaign/components/CampaignScheduleConfig';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ColumnDef } from '@tanstack/react-table';
import { Edit, Eye, FileText, RefreshCw, Send, Trash2 } from 'lucide-react';
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
  const unsent = generated - sent;

  const openedPercentage = generated > 0 ? (opened / generated) * 100 : 0;
  const sentNotOpenedPercentage = generated > 0 ? ((sent - opened) / generated) * 100 : 0;
  const unsentPercentage = generated > 0 ? (unsent / generated) * 100 : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Total:</span>
          <span className="font-medium">{generated}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Sent:</span>
          <span className="font-medium text-blue-600">{sent}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Opened:</span>
          <span className="font-medium text-purple-600">{isLoading ? '...' : opened}</span>
        </div>
      </div>
      <div className="w-full max-w-[300px]">
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
          {/* Opened segment */}
          {openedPercentage > 0 && (
            <div
              className="bg-purple-600 h-full transition-all duration-300"
              style={{ width: `${openedPercentage}%` }}
              title={`Opened: ${opened} (${openedPercentage.toFixed(0)}%)`}
            />
          )}
          {/* Sent but not opened segment */}
          {sentNotOpenedPercentage > 0 && (
            <div
              className="bg-blue-600 h-full transition-all duration-300"
              style={{ width: `${sentNotOpenedPercentage}%` }}
              title={`Sent but not opened: ${sent - opened} (${sentNotOpenedPercentage.toFixed(0)}%)`}
            />
          )}
          {/* Unsent segment */}
          {unsentPercentage > 0 && (
            <div
              className="bg-gray-300 h-full transition-all duration-300"
              style={{ width: `${unsentPercentage}%` }}
              title={`Unsent: ${unsent} (${unsentPercentage.toFixed(0)}%)`}
            />
          )}
        </div>
        <div className="flex items-center gap-4 mt-1">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-purple-600 rounded-sm" />
            <span className="text-xs text-muted-foreground">Opened</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-blue-600 rounded-sm" />
            <span className="text-xs text-muted-foreground">Sent</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-gray-300 rounded-sm" />
            <span className="text-xs text-muted-foreground">Unsent</span>
          </div>
        </div>
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
    action === 'draft'
      ? 'Save to Draft'
      : action === 'send'
        ? campaign?.status === 'PAUSED'
          ? 'Resume Campaign'
          : 'Schedule Send'
        : 'Delete Campaign';

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
  // Separate pagination states for each section
  const [activePage, setActivePage] = useState(1);
  const [readyPage, setReadyPage] = useState(1);
  const [otherPage, setOtherPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [confirmationDialog, setConfirmationDialog] = useState<{
    open: boolean;
    campaign: ExistingCampaign | null;
    action: 'draft' | 'send' | 'delete';
  }>({ open: false, campaign: null, action: 'draft' });

  const [customScheduleConfig, setCustomScheduleConfig] = useState<any>(undefined);
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [resumeCampaignId, setResumeCampaignId] = useState<number | null>(null);
  const [isProcessingResume, setIsProcessingResume] = useState(false);

  // Collapse states for each section (default to open)
  const [activeCollapsed, setActiveCollapsed] = useState(false);
  const [readyCollapsed, setReadyCollapsed] = useState(false);
  const [otherCollapsed, setOtherCollapsed] = useState(false);

  const {
    listCampaigns,
    saveToDraft,
    scheduleEmailSend,
    deleteCampaign,
    retryCampaign,
    resumeEmailSending,
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

  // Three separate API calls for each section with server-side filtering
  const {
    data: activeResponse,
    isLoading: isLoadingActive,
    isFetching: isFetchingActive,
    error: activeError,
  } = listCampaigns(
    {
      limit: pageSize,
      offset: (activePage - 1) * pageSize,
      statusGroup: 'active',
    },
    {
      refetchInterval: 5000,
      staleTime: 4000,
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      refetchOnReconnect: true,
    }
  );

  const {
    data: readyResponse,
    isLoading: isLoadingReady,
    isFetching: isFetchingReady,
    error: readyError,
  } = listCampaigns(
    {
      limit: pageSize,
      offset: (readyPage - 1) * pageSize,
      statusGroup: 'ready',
    },
    {
      refetchInterval: 5000,
      staleTime: 4000,
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      refetchOnReconnect: true,
    }
  );

  const {
    data: otherResponse,
    isLoading: isLoadingOther,
    isFetching: isFetchingOther,
    error: otherError,
  } = listCampaigns(
    {
      limit: pageSize,
      offset: (otherPage - 1) * pageSize,
      statusGroup: 'other',
    },
    {
      refetchInterval: 5000,
      staleTime: 4000,
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      refetchOnReconnect: true,
    }
  );

  const activeCampaigns = activeResponse?.campaigns || [];
  const readyCampaigns = readyResponse?.campaigns || [];
  const otherCampaigns = otherResponse?.campaigns || [];

  const activeTotalCount = activeResponse?.totalCount || 0;
  const readyTotalCount = readyResponse?.totalCount || 0;
  const otherTotalCount = otherResponse?.totalCount || 0;

  const activePageCount = Math.ceil(activeTotalCount / pageSize);
  const readyPageCount = Math.ceil(readyTotalCount / pageSize);
  const otherPageCount = Math.ceil(otherTotalCount / pageSize);

  // Get tracking stats for all campaigns in batch
  const allCampaigns = [...activeCampaigns, ...readyCampaigns, ...otherCampaigns];
  const sessionIds = allCampaigns.map((c) => c.id);
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

    // For paused campaigns, show resume dialog instead
    if (campaign.status === 'PAUSED') {
      setResumeCampaignId(campaign.id);
      setShowResumeDialog(true);
    } else {
      setConfirmationDialog({ open: true, campaign, action: 'send' });
    }
  };

  const handleResume = async () => {
    if (!resumeCampaignId) return;

    setIsProcessingResume(true);
    try {
      const result = await resumeEmailSending({ sessionId: resumeCampaignId });
      toast.success(
        `Resumed campaign. ${result.rescheduled} emails scheduled. ${result.scheduledForToday} will be sent today.`,
        { duration: 5000 }
      );
      setShowResumeDialog(false);
      setResumeCampaignId(null);
    } catch (error) {
      toast.error('Failed to resume campaign');
    } finally {
      setIsProcessingResume(false);
    }
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
          <div>
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

        // Determine disabled states and tooltips for each button
        const saveToDraftDisabled = isDisabled || !showSaveToDraft;
        const scheduleSendDisabled =
          !isGmailConnected ||
          (!showScheduleSend &&
            campaign.status !== 'READY_TO_SEND' &&
            campaign.status !== 'PAUSED');

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
          if (campaign.status === 'PAUSED') return 'Resume campaign';
          if (campaign.status === 'COMPLETED') return 'Campaign has already been completed';
          if (!showScheduleSend && campaign.status !== 'READY_TO_SEND')
            return 'Campaign must be ready to send';
          if (!isGmailConnected)
            return 'Please connect your Gmail account in Settings to enable this action';
          return campaign.status === 'READY_TO_SEND' ? 'Launch campaign' : 'Schedule send';
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
                      {campaign.status === 'PAUSED' ? (
                        <Play className="h-4 w-4" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      <span className="sr-only">
                        {campaign.status === 'PAUSED' ? 'Resume campaign' : 'Schedule send'}
                      </span>
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{getScheduleSendTooltip()}</TooltipContent>
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

  const isLoading = isLoadingActive || isLoadingReady || isLoadingOther;
  const isFetching = isFetchingActive || isFetchingReady || isFetchingOther;
  const error = activeError || readyError || otherError;

  if (
    isLoading &&
    activeCampaigns.length === 0 &&
    readyCampaigns.length === 0 &&
    otherCampaigns.length === 0
  ) {
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

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    // Reset all pages to first page when page size changes
    setActivePage(1);
    setReadyPage(1);
    setOtherPage(1);
  };

  // Create sections for grouped campaigns with pagination
  const CampaignSection = ({
    title,
    icon,
    campaigns,
    totalCount,
    pageCount,
    currentPage,
    onPageChange,
    isLoading,
    isFetching,
    isCollapsed,
    onCollapsedChange,
  }: {
    title: string;
    icon: React.ReactNode;
    campaigns: ExistingCampaign[];
    totalCount: number;
    pageCount: number;
    currentPage: number;
    onPageChange: (page: number) => void;
    isLoading?: boolean;
    isFetching?: boolean;
    isCollapsed: boolean;
    onCollapsedChange: (collapsed: boolean) => void;
  }) => {
    if (totalCount === 0 && !isLoading) return null;

    return (
      <Collapsible
        open={!isCollapsed}
        onOpenChange={(open) => onCollapsedChange(!open)}
        className="mb-6"
      >
        <div className="rounded-lg border bg-card">
          <CollapsibleTrigger className="flex w-full items-center justify-between p-4 hover:bg-accent/50 transition-colors rounded-t-lg cursor-pointer">
            <div className="flex items-center gap-2">
              <ChevronRight
                className={`h-4 w-4 transition-transform duration-200 ${!isCollapsed ? 'rotate-90' : ''}`}
              />
              {icon}
              <h3 className="text-lg font-semibold">{title}</h3>
              <Badge variant="secondary" className="ml-2">
                {totalCount}
              </Badge>
              {isFetching && !isLoading && (
                <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              Click to {isCollapsed ? 'expand' : 'collapse'}
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 pb-4">
              <DataTable
                columns={columns}
                data={campaigns}
                totalItems={totalCount}
                pageCount={pageCount}
                pageSize={pageSize}
                currentPage={currentPage}
                onPageChange={onPageChange}
                onPageSizeChange={handlePageSizeChange}
                showPagination={totalCount > pageSize}
              />
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    );
  };

  return (
    <div className="p-6">
      {/* Resume Campaign Dialog */}
      <AlertDialog open={showResumeDialog} onOpenChange={setShowResumeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resume Campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reschedule all remaining emails with fresh delays starting from now. The
              same gap settings (1-3 minutes between emails) will be maintained.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessingResume}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleResume} disabled={isProcessingResume}>
              {isProcessingResume ? 'Resuming...' : 'Resume Campaign'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmationDialog
        {...confirmationDialog}
        onOpenChange={(open) => {
          setConfirmationDialog({ ...confirmationDialog, open });
          if (!open) {
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

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Email Campaigns</h1>
        <div className="flex items-center gap-4">
          {isFetching && !isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Refreshing...</span>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const allCollapsed = activeCollapsed && readyCollapsed && otherCollapsed;
              setActiveCollapsed(!allCollapsed);
              setReadyCollapsed(!allCollapsed);
              setOtherCollapsed(!allCollapsed);
            }}
            className="flex items-center gap-2"
          >
            {activeCollapsed && readyCollapsed && otherCollapsed ? (
              <>
                <ChevronDown className="h-4 w-4" />
                Expand All
              </>
            ) : (
              <>
                <ChevronRight className="h-4 w-4" />
                Collapse All
              </>
            )}
          </Button>
        </div>
      </div>

      <CampaignSection
        title="Running / In Progress"
        icon={<Play className="h-4 w-4 text-blue-600" />}
        campaigns={activeCampaigns}
        totalCount={activeTotalCount}
        pageCount={activePageCount}
        currentPage={activePage}
        onPageChange={setActivePage}
        isLoading={isLoadingActive}
        isFetching={isFetchingActive}
        isCollapsed={activeCollapsed}
        onCollapsedChange={setActiveCollapsed}
      />

      <CampaignSection
        title="Ready to Send"
        icon={<Mail className="h-4 w-4 text-purple-600" />}
        campaigns={readyCampaigns}
        totalCount={readyTotalCount}
        pageCount={readyPageCount}
        currentPage={readyPage}
        onPageChange={setReadyPage}
        isLoading={isLoadingReady}
        isFetching={isFetchingReady}
        isCollapsed={readyCollapsed}
        onCollapsedChange={setReadyCollapsed}
      />

      <CampaignSection
        title="Other Campaigns"
        icon={<Clock className="h-4 w-4 text-gray-600" />}
        campaigns={otherCampaigns}
        totalCount={otherTotalCount}
        pageCount={otherPageCount}
        currentPage={otherPage}
        onPageChange={setOtherPage}
        isLoading={isLoadingOther}
        isFetching={isFetchingOther}
        isCollapsed={otherCollapsed}
        onCollapsedChange={setOtherCollapsed}
      />

      {activeTotalCount === 0 && readyTotalCount === 0 && otherTotalCount === 0 && !isLoading && (
        <div className="text-center py-8 text-muted-foreground">
          No campaigns found. Create your first campaign to get started.
        </div>
      )}
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
