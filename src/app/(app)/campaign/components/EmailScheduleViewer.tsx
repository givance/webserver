"use client";

import { useCommunications } from "@/app/hooks/use-communications";
import { useDonors } from "@/app/hooks/use-donors";
import { formatDonorName } from "@/app/lib/utils/donor-name-formatter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow, isToday, isTomorrow } from "date-fns";
import { AlertCircle, Calendar, CheckCircle2, Clock, Send, Timer, XCircle } from "lucide-react";

interface EmailScheduleViewerProps {
  sessionId: number;
  className?: string;
}

export function EmailScheduleViewer({ sessionId, className }: EmailScheduleViewerProps) {
  const { getEmailSchedule } = useCommunications();
  const { getDonorsQuery } = useDonors();

  // Get schedule data
  const { data: schedule, isLoading } = getEmailSchedule(
    { sessionId },
    {
      refetchInterval: 10000, // Refetch every 10 seconds
      enabled: !!sessionId,
    }
  );

  // Get donor IDs from scheduled emails
  const donorIds = schedule?.scheduledEmails.map((email) => email.donorId) || [];
  const { data: donors } = getDonorsQuery(donorIds);

  // Create donor map for quick lookup
  const donorMap = new Map(donors?.map((donor) => [donor.id, donor]) || []);

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Email Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!schedule) {
    return null;
  }

  const { stats, scheduledEmails, nextScheduledTime, lastSentTime, estimatedCompletionTime } = schedule;
  const totalEmails = Number(stats.total) || 0;
  const sentEmails = Number(stats.sent) || 0;
  const progressPercentage = totalEmails > 0 ? (sentEmails / totalEmails) * 100 : 0;

  // Group emails by status for timeline
  const pendingEmails = scheduledEmails.filter((e) => e.status === "scheduled");
  const sentEmailsList = scheduledEmails.filter((e) => e.status === "sent");
  const failedEmails = scheduledEmails.filter((e) => e.status === "failed");

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case "sent":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "scheduled":
        return <Clock className="h-4 w-4 text-blue-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "sending":
        return <Send className="h-4 w-4 text-yellow-500 animate-pulse" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "sent":
        return (
          <Badge variant="default" className="bg-green-500">
            Sent
          </Badge>
        );
      case "scheduled":
        return <Badge variant="secondary">Scheduled</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      case "sending":
        return (
          <Badge variant="outline" className="animate-pulse">
            Sending
          </Badge>
        );
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const formatScheduledTime = (date: Date | string | null) => {
    if (!date) return "Not scheduled";
    const dateObj = new Date(date);

    if (isToday(dateObj)) {
      return `Today at ${format(dateObj, "h:mm a")}`;
    } else if (isTomorrow(dateObj)) {
      return `Tomorrow at ${format(dateObj, "h:mm a")}`;
    } else {
      return format(dateObj, "MMM d at h:mm a");
    }
  };

  return (
    <TooltipProvider>
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Email Schedule</CardTitle>
            <div className="flex items-center gap-2">
              {stats.paused > 0 && (
                <Badge variant="outline" className="text-yellow-600">
                  {stats.paused} Paused
                </Badge>
              )}
              {stats.failed > 0 && <Badge variant="destructive">{stats.failed} Failed</Badge>}
              <Badge variant="secondary" className="text-xs">
                Live Updates
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Progress Overview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {sentEmails} of {totalEmails} emails sent
              </span>
              <span className="font-medium">{Math.round(progressPercentage)}%</span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
          </div>

          {/* Status Summary */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Next Email</p>
              <p className="text-sm font-medium flex items-center gap-2">
                <Timer className="h-4 w-4" />
                {nextScheduledTime ? (
                  <>
                    {formatScheduledTime(nextScheduledTime)}
                    <span className="text-xs text-muted-foreground">
                      ({formatDistanceToNow(new Date(nextScheduledTime), { addSuffix: true })})
                    </span>
                  </>
                ) : (
                  "No emails scheduled"
                )}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Estimated Completion</p>
              <p className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {estimatedCompletionTime ? formatScheduledTime(estimatedCompletionTime) : "N/A"}
              </p>
            </div>
          </div>

          {/* Email Timeline */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Email Timeline</h4>
            <div className="max-h-64 overflow-y-auto space-y-2">
              {/* Recently sent emails */}
              {sentEmailsList.map((email) => {
                const donor = donorMap.get(email.donorId);
                return (
                  <div key={email.emailId} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(email.status)}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-sm cursor-pointer hover:text-primary">
                            {donor ? formatDonorName(donor) : `Donor ${email.donorId}`}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{donor?.email || "Email not available"}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Sent{" "}
                      {email.actualSendTime && formatDistanceToNow(new Date(email.actualSendTime), { addSuffix: true })}
                    </span>
                  </div>
                );
              })}

              {/* Divider if there are both sent and pending */}
              {sentEmailsList.length > 0 && pendingEmails.length > 0 && (
                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-background px-2 text-muted-foreground">Upcoming</span>
                  </div>
                </div>
              )}

              {/* Upcoming emails */}
              {pendingEmails.map((email) => {
                const donor = donorMap.get(email.donorId);
                return (
                  <div
                    key={email.emailId}
                    className={cn("flex items-center justify-between p-2 rounded-lg", "bg-blue-50 dark:bg-blue-950/20")}
                  >
                    <div className="flex items-center gap-2">
                      {getStatusIcon(email.status)}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-sm cursor-pointer hover:text-primary">
                            {donor ? formatDonorName(donor) : `Donor ${email.donorId}`}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{donor?.email || "Email not available"}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatScheduledTime(email.scheduledTime)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Failed emails alert */}
          {failedEmails.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 p-3">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="text-sm font-medium text-red-900 dark:text-red-100">
                  {failedEmails.length} email{failedEmails.length > 1 ? "s" : ""} failed to send
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
