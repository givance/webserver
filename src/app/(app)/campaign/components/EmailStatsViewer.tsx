"use client";

import { useEmailTrackingBySession, useSessionTracking } from "@/app/hooks/use-email-tracking";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, formatDistanceToNow } from "date-fns";
import { Clock, Eye, MapPin } from "lucide-react";
import { useState } from "react";

interface EmailStatsViewerProps {
  sessionId: number;
  className?: string;
}

interface DonorOpenDetailsProps {
  sessionId: number;
  donorId: number;
  donorName: string;
  totalOpens: number;
  lastOpenedAt: Date | string | null;
  children: React.ReactNode;
}

function DonorOpenDetails({
  sessionId,
  donorId,
  donorName,
  totalOpens,
  lastOpenedAt,
  children,
}: DonorOpenDetailsProps) {
  const [shouldFetch, setShouldFetch] = useState(false);

  // Use the hook conditionally by passing 0 when we don't want to fetch
  const { data: trackingData, isLoading } = useEmailTrackingBySession(
    shouldFetch ? sessionId : 0,
    shouldFetch ? donorId : 0
  );

  const opens = trackingData?.opens || [];

  return (
    <Tooltip>
      <TooltipTrigger asChild onMouseEnter={() => setShouldFetch(true)}>
        {children}
      </TooltipTrigger>
      <TooltipContent align="end" className="max-w-md">
        <div className="space-y-3">
          <div className="font-medium">Email Timeline for {donorName}</div>

          {/* Email Sent Time */}
          {trackingData?.emailTracker?.sentAt && (
            <div className="border-l-2 border-blue-200 pl-3 py-1">
              <div className="flex items-center gap-2 text-xs">
                <Clock className="h-3 w-3 text-blue-600" />
                <span className="font-medium text-blue-600">Email Sent</span>
              </div>
              <div className="text-xs font-medium">
                {format(new Date(trackingData.emailTracker.sentAt), "MMM d, yyyy 'at' h:mm a")}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(trackingData.emailTracker.sentAt))} ago
              </div>
            </div>
          )}

          {/* Loading State */}
          {isLoading && shouldFetch ? (
            <div className="text-sm text-muted-foreground">Loading detailed timeline...</div>
          ) : opens.length > 0 ? (
            <div className="text-sm space-y-2">
              <div className="font-medium text-green-600">
                {opens.length} email open{opens.length !== 1 ? "s" : ""}
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {opens
                  .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())
                  .map((open, index) => (
                    <div key={index} className="border-l-2 border-green-200 pl-3 py-1">
                      <div className="flex items-center gap-2 text-xs">
                        <Eye className="h-3 w-3 text-green-600" />
                        <span className="font-medium text-green-600">
                          Email Opened {index === 0 ? "(Most Recent)" : ""}
                        </span>
                      </div>
                      <div className="text-xs font-medium">
                        {format(new Date(open.openedAt), "MMM d, yyyy 'at' h:mm a")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(open.openedAt))} ago
                      </div>
                      {open.ipAddress && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          IP: {open.ipAddress}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            <div className="text-sm space-y-1">
              <div className="text-muted-foreground">Email sent but not opened yet</div>
              {!trackingData?.emailTracker?.sentAt && (
                <div className="text-xs text-muted-foreground">Detailed timeline not available</div>
              )}
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function EmailStatsViewer({ sessionId, className }: EmailStatsViewerProps) {
  const { sessionStats, donorStats, isLoading, error } = useSessionTracking(sessionId);

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Who Opened Your Emails</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Who Opened Your Emails</CardTitle>
          <CardDescription>Error loading email open data</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Unable to load email open statistics. Please try refreshing the page.</p>
        </CardContent>
      </Card>
    );
  }

  // Filter to only show donors who have opened emails
  const engagedDonors = donorStats ? donorStats.filter((d) => d.uniqueOpens > 0) : [];

  // Sort by total opens (highest first), then by last opened time
  const sortedEngagedDonors = engagedDonors.sort((a, b) => {
    if (a.totalOpens !== b.totalOpens) {
      return b.totalOpens - a.totalOpens;
    }
    if (a.lastOpenedAt && b.lastOpenedAt) {
      return new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime();
    }
    return 0;
  });

  return (
    <TooltipProvider>
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Who Opened Your Emails
            {engagedDonors.length > 0 && (
              <Badge variant="secondary" className="ml-auto">
                {engagedDonors.length} engaged
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Donors who have opened your campaign emails, with open counts and timestamps
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sortedEngagedDonors.length > 0 ? (
            <div className="space-y-1">
              {sortedEngagedDonors.map((donor) => (
                <DonorOpenDetails
                  key={donor.donorId}
                  sessionId={sessionId}
                  donorId={donor.donorId}
                  donorName={donor.donorName}
                  totalOpens={donor.totalOpens}
                  lastOpenedAt={donor.lastOpenedAt}
                >
                  <div className="flex items-center justify-between px-3 py-2 rounded hover:bg-muted/50 cursor-pointer transition-colors">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="font-medium truncate">{donor.donorName}</div>
                      <div className="text-sm text-muted-foreground truncate">{donor.donorEmail}</div>
                      {donor.lastOpenedAt && (
                        <div className="text-xs text-green-600 flex items-center gap-1 whitespace-nowrap">
                          <Eye className="h-3 w-3" />
                          {formatDistanceToNow(new Date(donor.lastOpenedAt))} ago
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-sm font-medium text-green-600 whitespace-nowrap">
                      <span>{donor.totalOpens}</span>
                      <span className="text-xs text-muted-foreground">{donor.totalOpens === 1 ? "open" : "opens"}</span>
                    </div>
                  </div>
                </DonorOpenDetails>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Eye className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No email opens recorded yet</p>
              <p className="text-sm text-muted-foreground">
                Email open data will appear here once donors start opening your campaign emails.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
