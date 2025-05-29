import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Eye, MousePointer, MapPin, Clock } from "lucide-react";
import { useEmailTrackingBySession } from "@/app/hooks/use-email-tracking";
import { formatDistanceToNow } from "date-fns";

interface EmailTrackingStatusProps {
  emailId: number;
  donorId: number;
  sessionId?: number;
}

export function EmailTrackingStatus({ emailId, donorId, sessionId }: EmailTrackingStatusProps) {
  // Always use the session-based approach since that's the one that works
  const { data: trackingData, isLoading, error } = useEmailTrackingBySession(sessionId ?? 0, donorId);

  // Debug logging
  console.log("[EmailTrackingStatus] Props:", { emailId, donorId, sessionId });
  console.log("[EmailTrackingStatus] Query state:", { trackingData, isLoading, error });

  if (isLoading) {
    return (
      <Card className="mt-4">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <div className="animate-pulse h-4 w-4 bg-muted rounded"></div>
            <span className="text-sm text-muted-foreground">Loading tracking information...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!trackingData || !sessionId || sessionId <= 0) {
    console.log("[EmailTrackingStatus] No data or invalid session:", { trackingData: !!trackingData, sessionId });
    return (
      <Card className="mt-4">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              Not Sent
            </Badge>
            <span className="text-sm text-muted-foreground">This email has not been sent yet</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { emailTracker, opens, clicks } = trackingData;
  const hasOpens = opens && opens.length > 0;
  const hasClicks = clicks && clicks.length > 0;

  return (
    <Card className="mt-4">
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Status Header */}
          <div className="flex items-center gap-2">
            <Badge variant={hasOpens ? "default" : "secondary"} className="text-xs">
              {hasOpens ? "Opened" : "Sent"}
            </Badge>
            <span className="text-sm text-muted-foreground">
              Sent {formatDistanceToNow(new Date(emailTracker.sentAt))} ago
            </span>
          </div>

          {/* Open Information */}
          {hasOpens && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
                <Eye className="h-4 w-4" />
                Email Opened ({opens.length} time{opens.length !== 1 ? "s" : ""})
              </div>

              <div className="space-y-2 ml-6">
                {opens.slice(0, 3).map((open, index) => (
                  <div key={index} className="text-xs text-muted-foreground space-y-1">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3" />
                      <span>{formatDistanceToNow(new Date(open.openedAt))} ago</span>
                      <span className="text-muted-foreground/60">({new Date(open.openedAt).toLocaleString()})</span>
                    </div>
                    {open.ipAddress && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3 w-3" />
                        <span>IP: {open.ipAddress}</span>
                      </div>
                    )}
                    {open.userAgent && (
                      <div className="text-muted-foreground/60 max-w-md truncate">{open.userAgent}</div>
                    )}
                  </div>
                ))}

                {opens.length > 3 && (
                  <div className="text-xs text-muted-foreground ml-6">
                    ... and {opens.length - 3} more open{opens.length - 3 !== 1 ? "s" : ""}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Click Information */}
          {hasClicks && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-400">
                <MousePointer className="h-4 w-4" />
                Links Clicked ({clicks.length} time{clicks.length !== 1 ? "s" : ""})
              </div>

              <div className="space-y-2 ml-6">
                {clicks.slice(0, 2).map((click, index) => (
                  <div key={index} className="text-xs text-muted-foreground space-y-1">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3" />
                      <span>{formatDistanceToNow(new Date(click.clickedAt))} ago</span>
                      <span className="text-muted-foreground/60">({new Date(click.clickedAt).toLocaleString()})</span>
                    </div>
                    {click.ipAddress && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3 w-3" />
                        <span>IP: {click.ipAddress}</span>
                      </div>
                    )}
                  </div>
                ))}

                {clicks.length > 2 && (
                  <div className="text-xs text-muted-foreground ml-6">
                    ... and {clicks.length - 2} more click{clicks.length - 2 !== 1 ? "s" : ""}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* No activity message */}
          {!hasOpens && !hasClicks && (
            <div className="text-xs text-muted-foreground">No opens or clicks recorded yet</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
