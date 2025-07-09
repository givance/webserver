'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Eye, MousePointer, Mail, TrendingUp, Users, Activity } from 'lucide-react';
import { useSessionTracking } from '@/app/hooks/use-email-tracking';
import { formatDistanceToNowLocal } from '@/app/lib/utils/format';

interface TrackingAnalyticsProps {
  sessionId: number;
  className?: string;
}

export function TrackingAnalytics({ sessionId, className }: TrackingAnalyticsProps) {
  const { sessionStats, donorStats, isLoading, error, refetch } = useSessionTracking(sessionId);

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Email Tracking Analytics
          </CardTitle>
          <CardDescription>Loading tracking data...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Email Tracking Analytics
          </CardTitle>
          <CardDescription>Error loading tracking data</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Unable to load tracking analytics. Please try refreshing the page.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!sessionStats) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Email Tracking Analytics
          </CardTitle>
          <CardDescription>No tracking data available</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            No tracking data found for this communication session.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Email Tracking Analytics
          <Badge variant="secondary" className="ml-auto">
            Live
          </Badge>
        </CardTitle>
        <CardDescription>Real-time email open and click tracking</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="donors">By Donor</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Overall Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="flex items-center justify-center w-12 h-12 mx-auto mb-2 bg-blue-100 rounded-full">
                  <Mail className="h-6 w-6 text-blue-600" />
                </div>
                <div className="text-2xl font-bold">{sessionStats.totalSent}</div>
                <div className="text-sm text-muted-foreground">Emails Sent</div>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center w-12 h-12 mx-auto mb-2 bg-green-100 rounded-full">
                  <Eye className="h-6 w-6 text-green-600" />
                </div>
                <div className="text-2xl font-bold">{sessionStats.uniqueOpens}</div>
                <div className="text-sm text-muted-foreground">Unique Opens</div>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center w-12 h-12 mx-auto mb-2 bg-purple-100 rounded-full">
                  <MousePointer className="h-6 w-6 text-purple-600" />
                </div>
                <div className="text-2xl font-bold">{sessionStats.uniqueClicks}</div>
                <div className="text-sm text-muted-foreground">Unique Clicks</div>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center w-12 h-12 mx-auto mb-2 bg-orange-100 rounded-full">
                  <TrendingUp className="h-6 w-6 text-orange-600" />
                </div>
                <div className="text-2xl font-bold">{sessionStats.openRate.toFixed(1)}%</div>
                <div className="text-sm text-muted-foreground">Open Rate</div>
              </div>
            </div>

            {/* Rate Bars */}
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Open Rate</span>
                  <span>{sessionStats.openRate.toFixed(1)}%</span>
                </div>
                <Progress value={sessionStats.openRate} className="h-2" />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Click Rate</span>
                  <span>{sessionStats.clickRate.toFixed(1)}%</span>
                </div>
                <Progress value={sessionStats.clickRate} className="h-2" />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Click-to-Open Rate</span>
                  <span>{sessionStats.clickToOpenRate.toFixed(1)}%</span>
                </div>
                <Progress value={sessionStats.clickToOpenRate} className="h-2" />
              </div>
            </div>

            {/* Additional Stats */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <div className="text-sm text-muted-foreground">Total Opens</div>
                <div className="text-xl font-semibold">{sessionStats.totalOpens}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Total Clicks</div>
                <div className="text-xl font-semibold">{sessionStats.totalClicks}</div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="donors" className="space-y-4">
            {donorStats && donorStats.length > 0 ? (
              <div className="space-y-3">
                {donorStats.map((donor) => (
                  <div
                    key={donor.donorId}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="font-medium">{donor.donorName}</div>
                      <div className="text-sm text-muted-foreground">{donor.donorEmail}</div>
                      {donor.lastOpenedAt && (
                        <div className="text-xs text-green-600">
                          Last opened {formatDistanceToNowLocal(donor.lastOpenedAt)} ago
                        </div>
                      )}
                    </div>
                    <div className="flex gap-4 text-center">
                      <div>
                        <div className="text-sm font-medium">{donor.uniqueOpens}</div>
                        <div className="text-xs text-muted-foreground">Opens</div>
                      </div>
                      <div>
                        <div className="text-sm font-medium">{donor.uniqueClicks}</div>
                        <div className="text-xs text-muted-foreground">Clicks</div>
                      </div>
                      <div>
                        <Badge
                          variant={donor.uniqueOpens > 0 ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {donor.openRate.toFixed(0)}%
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No donor tracking data available</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
