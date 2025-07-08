'use client';

import { useCommunications } from '@/app/hooks/use-communications';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { toast } from 'sonner';
import React, { useState } from 'react';
import { Pause, Play, XCircle, Settings, Send } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { CampaignScheduleConfig } from './CampaignScheduleConfig';

interface EmailScheduleControlPanelProps {
  sessionId: number;
  className?: string;
}

export function EmailScheduleControlPanel({
  sessionId,
  className,
}: EmailScheduleControlPanelProps) {
  const {
    getEmailSchedule,
    pauseEmailSending,
    resumeEmailSending,
    cancelEmailSending,
    scheduleEmailSend,
    getSession,
    updateCampaign,
  } = useCommunications();

  const [showPauseDialog, setShowPauseDialog] = useState(false);
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showScheduleConfig, setShowScheduleConfig] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scheduleConfig, setScheduleConfig] = useState<any>(null);

  // Get schedule data
  const { data: schedule, isLoading } = getEmailSchedule(
    { sessionId },
    {
      enabled: !!sessionId,
    }
  );

  // Get campaign data to access schedule config
  const { data: campaign } = getSession(
    { sessionId },
    {
      enabled: !!sessionId,
    }
  );

  const handlePause = async () => {
    setIsProcessing(true);
    try {
      const result = await pauseEmailSending.mutateAsync({ sessionId });
      toast.success(`Paused campaign. ${result.cancelledJobs} emails were stopped.`);
      setShowPauseDialog(false);
    } catch (error) {
      console.error('Failed to pause campaign:', error);
      toast.error('Failed to pause campaign. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResume = async () => {
    setIsProcessing(true);
    try {
      const result = await resumeEmailSending.mutateAsync({ sessionId });
      toast.success(
        `Resumed campaign. ${result.rescheduled} emails scheduled. ${result.scheduledForToday} will be sent today.`,
        { duration: 5000 }
      );
      setShowResumeDialog(false);
    } catch (error) {
      console.error('Failed to resume campaign:', error);
      toast.error('Failed to resume campaign. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = async () => {
    setIsProcessing(true);
    try {
      const result = await cancelEmailSending.mutateAsync({ sessionId });
      toast.success(`Campaign cancelled. ${result.cancelledEmails} emails were cancelled.`);
      setShowCancelDialog(false);
    } catch (error) {
      console.error('Failed to cancel campaign:', error);
      toast.error('Failed to cancel campaign. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleScheduleConfigSave = async () => {
    if (!scheduleConfig) return;

    setIsProcessing(true);
    try {
      await updateCampaign.mutateAsync({
        campaignId: sessionId,
        scheduleConfig,
      });
      toast.success('Campaign schedule settings updated successfully');
      setShowScheduleConfig(false);
    } catch (error) {
      console.error('Failed to update schedule config:', error);
      toast.error('Failed to update schedule settings. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleScheduleSend = async () => {
    setIsProcessing(true);
    try {
      const x = {
        sessionId,
        scheduleConfig: campaign?.session?.scheduleConfig ?? undefined,
      };
      console.log('x', x);
      const result = await scheduleEmailSend.mutateAsync({
        sessionId,
        scheduleConfig: campaign?.session?.scheduleConfig ?? undefined,
      });
      toast.success(
        `Successfully scheduled ${result.scheduled} emails. ${result.scheduledForToday} will be sent today.`,
        { duration: 5000 }
      );
    } catch (error) {
      console.error('Failed to schedule emails:', error);
      toast.error('Failed to schedule emails. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Campaign Controls</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!schedule) {
    return null;
  }

  const { stats } = schedule;
  const hasPausedEmails = stats.paused > 0;
  const hasScheduledEmails = stats.scheduled > 0;
  const hasUnsentEmails = stats.scheduled > 0 || stats.paused > 0 || stats.pending > 0;
  const hasPendingEmails = stats.pending > 0 && !hasScheduledEmails && !hasPausedEmails;
  const isActive = hasScheduledEmails;
  const isPaused = hasPausedEmails && !hasScheduledEmails;

  // Determine campaign state
  const getCampaignState = () => {
    if (stats.sent === stats.total && stats.total > 0) {
      return { label: 'Completed', variant: 'default' as const };
    }
    if (hasScheduledEmails) {
      return { label: 'Active', variant: 'default' as const };
    }
    if (hasPausedEmails) {
      return { label: 'Paused', variant: 'secondary' as const };
    }
    if (stats.cancelled > 0) {
      return { label: 'Cancelled', variant: 'outline' as const };
    }
    return { label: 'Not Started', variant: 'outline' as const };
  };

  const campaignState = getCampaignState();

  return (
    <>
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Campaign Controls</CardTitle>
              <CardDescription>Manage your email campaign sending</CardDescription>
            </div>
            <Badge variant={campaignState.variant}>{campaignState.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Action Buttons */}
          <div className="grid grid-cols-1 gap-3">
            {/* Schedule Send Button - for pending emails with no schedule */}
            {hasPendingEmails && (
              <Button
                variant="default"
                onClick={handleScheduleSend}
                disabled={isProcessing}
                className="w-full"
              >
                <Send className="mr-2 h-4 w-4" />
                Schedule & Send ({stats.pending} emails)
              </Button>
            )}

            {/* Pause/Resume Button */}
            {(isActive || isPaused) && (
              <>
                {isActive ? (
                  <Button
                    variant="outline"
                    onClick={() => setShowPauseDialog(true)}
                    disabled={isProcessing}
                    className="w-full"
                  >
                    <Pause className="mr-2 h-4 w-4" />
                    Pause Campaign
                  </Button>
                ) : (
                  <Button
                    variant="default"
                    onClick={() => setShowResumeDialog(true)}
                    disabled={isProcessing}
                    className="w-full"
                  >
                    <Play className="mr-2 h-4 w-4" />
                    Resume Campaign
                  </Button>
                )}
              </>
            )}

            {/* Cancel Button */}
            {hasUnsentEmails && (
              <Button
                variant="destructive"
                onClick={() => setShowCancelDialog(true)}
                disabled={isProcessing}
                className="w-full"
              >
                <XCircle className="mr-2 h-4 w-4" />
                Cancel Remaining Emails
              </Button>
            )}

            {/* Schedule Settings Button */}
            <Button
              variant="outline"
              onClick={() => setShowScheduleConfig(true)}
              disabled={isProcessing}
              className="w-full"
            >
              <Settings className="mr-2 h-4 w-4" />
              Schedule Settings
            </Button>
          </div>

          {/* Status Info */}
          <div className="rounded-lg bg-muted p-3 space-y-1">
            <p className="text-sm font-medium">Campaign Status</p>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>• {stats.sent} emails sent</p>
              <p>• {stats.scheduled} emails scheduled</p>
              {stats.paused > 0 && <p>• {stats.paused} emails paused</p>}
              {stats.failed > 0 && <p className="text-red-600">• {stats.failed} emails failed</p>}
              {stats.cancelled > 0 && <p>• {stats.cancelled} emails cancelled</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pause Confirmation Dialog */}
      <AlertDialog open={showPauseDialog} onOpenChange={setShowPauseDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pause Campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              This will stop all scheduled emails from being sent. You can resume the campaign at
              any time, and emails will be rescheduled with the same delays between them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePause}
              disabled={isProcessing}
              className="bg-yellow-600 hover:bg-yellow-700"
            >
              {isProcessing ? 'Pausing...' : 'Pause Campaign'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Resume Confirmation Dialog */}
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
            <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleResume} disabled={isProcessing}>
              {isProcessing ? 'Resuming...' : 'Resume Campaign'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently cancel all remaining unsent emails. This action cannot be
              undone.
              {stats.scheduled > 0 && ` ${stats.scheduled} scheduled emails will be cancelled.`}
              {stats.paused > 0 && ` ${stats.paused} paused emails will be cancelled.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Keep Campaign</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={isProcessing}
              className="bg-red-600 hover:bg-red-700"
            >
              {isProcessing ? 'Cancelling...' : 'Cancel Campaign'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Schedule Configuration Dialog */}
      <AlertDialog open={showScheduleConfig} onOpenChange={setShowScheduleConfig}>
        <AlertDialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <AlertDialogHeader className="flex-shrink-0">
            <AlertDialogTitle>Campaign Schedule Settings</AlertDialogTitle>
            <AlertDialogDescription>
              Configure schedule settings for this campaign. Changes will apply to any remaining
              emails that haven&apos;t been sent yet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex-1 overflow-y-auto py-4 min-h-0">
            <CampaignScheduleConfig
              scheduleConfig={campaign?.session?.scheduleConfig as any}
              onChange={setScheduleConfig}
              compact={true}
            />
          </div>
          <AlertDialogFooter className="flex-shrink-0 border-t pt-4 mt-4">
            <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleScheduleConfigSave}
              disabled={isProcessing || !scheduleConfig}
            >
              {isProcessing ? 'Saving...' : 'Save Settings'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
