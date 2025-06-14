"use client";

import { useParams } from "next/navigation";
import { useCommunications } from "@/app/hooks/use-communications";
import { useDonors } from "@/app/hooks/use-donors";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmailDisplay } from "../../components/EmailDisplay";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users, MessageSquare, Mail, AlertCircle, Activity, Eye } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemo } from "react";
import { TrackingAnalytics } from "@/components/tracking/tracking-analytics";
import { useSessionTracking } from "@/app/hooks/use-email-tracking";
import { Badge } from "@/components/ui/badge";
import { useStaffMembers } from "@/app/hooks/use-staff-members";

interface GeneratedEmailData {
  id: number;
  donorId: number;
  subject: string;
  structuredContent: Array<{
    piece: string;
    references: string[];
    addNewlineAfter: boolean;
  }>;
  referenceContexts: Record<string, string>;
  isPreview: boolean;
}

interface SessionData {
  session: {
    id: number;
    instruction: string;
    refinedInstruction?: string;
    chatHistory: Array<{ role: "user" | "assistant"; content: string }>;
    selectedDonorIds: number[];
    previewDonorIds: number[];
    totalDonors: number;
    completedDonors: number;
    status: string;
    createdAt: string;
    completedAt?: string;
  };
  emails: GeneratedEmailData[];
}

export default function EmailGenerationResultsPage() {
  const params = useParams();
  const sessionId = parseInt(params.sessionId as string);

  const { getSession } = useCommunications();
  const {
    data: sessionData,
    isLoading,
    error,
  } = getSession({ sessionId }) as {
    data: SessionData | undefined;
    isLoading: boolean;
    error: any;
  };

  const { getDonorsQuery } = useDonors();

  // Memoize the donor IDs to prevent unnecessary re-renders
  const donorIds = useMemo(() => {
    return sessionData?.session.selectedDonorIds || [];
  }, [sessionData?.session.selectedDonorIds]);

  // Fetch all donors at once using the new getDonorsQuery hook
  const { data: donorsData } = getDonorsQuery(donorIds);

  // Get session tracking data
  const { donorStats } = useSessionTracking(sessionId);

  // Get staff members
  const { staffMembers } = useStaffMembers();

  // Helper function to get donor data by ID
  const getDonorData = (donorId: number) => {
    return donorsData?.find((donor) => donor.id === donorId);
  };

  // Helper function to get staff member name
  const getStaffName = (staffId: number | null) => {
    if (!staffId) return "Unassigned";
    const staff = staffMembers.find((s) => parseInt(s.id, 10) === staffId);
    return staff ? staff.name : "Unknown Staff";
  };

  // Helper function to get donor tracking stats
  const getDonorTrackingStats = (donorId: number) => {
    return donorStats?.find((stats) => stats.donorId === donorId);
  };

  if (isLoading) {
    return (
      <div className="h-full flex flex-col">
        {/* Header Skeleton */}
        <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center gap-4 p-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/campaign">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Campaign
              </Link>
            </Button>
            <div className="flex-1">
              <Skeleton className="h-6 w-48 mb-2" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
        </div>

        {/* Content Skeleton */}
        <div className="flex-1 p-4">
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center gap-4 p-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/campaign">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Campaign
              </Link>
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-semibold">Email Generation Results</h1>
              <p className="text-sm text-muted-foreground">Session #{sessionId}</p>
            </div>
          </div>
        </div>

        {/* Error Content */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
            <div>
              <h2 className="text-lg font-medium">Failed to load session data</h2>
              <p className="text-sm text-muted-foreground">
                {error.message || "An error occurred while loading the email generation results."}
              </p>
            </div>
            <Button asChild>
              <Link href="/campaign">Return to Campaign</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!sessionData) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-lg font-medium">Session not found</h2>
          <p className="text-sm text-muted-foreground">The requested email generation session could not be found.</p>
          <Button asChild className="mt-4">
            <Link href="/campaign">Return to Campaign</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-4 p-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/campaign">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Campaign
            </Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold">Email Generation Results</h1>
            <p className="text-sm text-muted-foreground">
              Session #{sessionData.session.id} • {sessionData.session.totalDonors} donors • Completed{" "}
              {sessionData.session.completedAt ? new Date(sessionData.session.completedAt).toLocaleDateString() : "N/A"}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="emails" className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-4 mx-4 mt-4">
            <TabsTrigger value="emails" className="flex h-full items-center gap-2">
              <Mail className="h-4 w-4" />
              Generated Emails ({sessionData.emails.length})
            </TabsTrigger>
            <TabsTrigger value="chat" className="flex items-center gap-2 h-full">
              <MessageSquare className="h-4 w-4" />
              Chat History
            </TabsTrigger>
            <TabsTrigger value="summary" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Summary
            </TabsTrigger>
            <TabsTrigger value="tracking" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Tracking
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-hidden px-4 pb-4">
            <TabsContent value="emails" className="h-full mt-4">
              <div className="h-full">
                {sessionData.emails.length > 0 ? (
                  <Tabs
                    defaultValue={sessionData.emails[0]?.donorId?.toString()}
                    orientation="vertical"
                    className="h-full"
                  >
                    <div className="grid grid-cols-[320px_1fr] h-full border rounded-lg overflow-hidden max-h-[calc(100vh-200px)]">
                      <div className="border-r bg-background flex flex-col h-full max-h-[calc(100vh-200px)]">
                        <div className="p-3 border-b bg-muted/30 flex-shrink-0">
                          <h3 className="font-medium text-sm text-muted-foreground">
                            Recipients ({sessionData.emails.length})
                          </h3>
                        </div>
                        <div className="flex-1 overflow-hidden min-h-0">
                          <ScrollArea className="h-full">
                            <TabsList className="flex flex-col w-full h-auto bg-transparent p-2 space-y-1">
                              {sessionData.emails.map((email: GeneratedEmailData) => {
                                const donor = getDonorData(email.donorId);
                                const trackingStats = getDonorTrackingStats(email.donorId);
                                if (!donor) return null;

                                const assignedStaffName = getStaffName(donor.assignedToStaffId);

                                return (
                                  <TabsTrigger
                                    key={email.donorId}
                                    value={email.donorId.toString()}
                                    className={cn(
                                      "w-full p-3 rounded-md border border-transparent",
                                      "flex flex-col items-start justify-start gap-2",
                                      "text-left min-h-[72px] h-auto",
                                      "transition-all duration-200",
                                      "hover:bg-muted/50 hover:border-border",
                                      "data-[state=active]:bg-primary/10 data-[state=active]:border-primary/20",
                                      "data-[state=active]:shadow-sm"
                                    )}
                                  >
                                    <div className="flex items-center justify-between w-full">
                                      <span className="font-medium text-sm truncate flex-1">
                                        {donor.firstName} {donor.lastName}
                                      </span>
                                      {trackingStats && trackingStats.uniqueOpens > 0 && (
                                        <Badge variant="secondary" className="text-xs flex items-center gap-1 ml-2">
                                          <Eye className="h-3 w-3" />
                                          {trackingStats.uniqueOpens}
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="w-full space-y-1">
                                      <span className="text-xs text-muted-foreground font-medium">
                                        {assignedStaffName}
                                      </span>
                                      <span className="text-xs text-muted-foreground/80 truncate block w-full">
                                        {donor.email}
                                      </span>
                                    </div>
                                  </TabsTrigger>
                                );
                              })}
                            </TabsList>
                          </ScrollArea>
                        </div>
                      </div>

                      <div className="flex flex-col">
                        {sessionData.emails.map((email: GeneratedEmailData) => {
                          const donor = getDonorData(email.donorId);
                          if (!donor) return null;

                          return (
                            <TabsContent
                              key={email.donorId}
                              value={email.donorId.toString()}
                              className="flex-1 m-0 data-[state=active]:flex flex-col h-full"
                            >
                              <EmailDisplay
                                key={`${email.id}-${email.donorId}-${sessionId}`}
                                donorName={`${donor.firstName} ${donor.lastName}`}
                                donorEmail={donor.email}
                                subject={email.subject}
                                content={email.structuredContent}
                                referenceContexts={email.referenceContexts}
                                emailId={email.id}
                                donorId={email.donorId}
                                sessionId={sessionId}
                              />
                            </TabsContent>
                          );
                        })}
                      </div>
                    </div>
                  </Tabs>
                ) : (
                  <div className="flex items-center justify-center h-full border rounded-lg">
                    <div className="text-center">
                      <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-medium">No emails generated</h3>
                      <p className="text-sm text-muted-foreground">
                        This session doesn&apos;t have any generated emails yet.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="chat" className="h-full mt-4">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>Chat History</CardTitle>
                </CardHeader>
                <CardContent className="h-full">
                  <ScrollArea className="h-full">
                    <div className="space-y-4">
                      {sessionData.session.chatHistory && sessionData.session.chatHistory.length > 0 ? (
                        sessionData.session.chatHistory.map(
                          (message: { role: "user" | "assistant"; content: string }, index: number) => (
                            <div
                              key={index}
                              className={cn("flex flex-col space-y-2", {
                                "items-end": message.role === "user",
                              })}
                            >
                              <div
                                className={cn("rounded-lg px-3 py-2 max-w-[80%]", {
                                  "bg-primary text-primary-foreground": message.role === "user",
                                  "bg-muted": message.role === "assistant",
                                })}
                              >
                                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                              </div>
                            </div>
                          )
                        )
                      ) : (
                        <div className="text-center text-muted-foreground">
                          <MessageSquare className="h-8 w-8 mx-auto mb-2" />
                          <p>No chat history available</p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="summary" className="h-full mt-4">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Generation Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Total Donors</p>
                        <p className="text-2xl font-bold">{sessionData.session.totalDonors}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Emails Generated</p>
                        <p className="text-2xl font-bold">{sessionData.emails.length}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium">Original Instruction</p>
                      <div className="p-3 bg-muted rounded-lg">
                        <p className="text-sm">{sessionData.session.instruction}</p>
                      </div>
                    </div>

                    {sessionData.session.refinedInstruction && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Refined Instruction</p>
                        <div className="p-3 bg-muted rounded-lg">
                          <p className="text-sm">{sessionData.session.refinedInstruction}</p>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Status</p>
                        <p className="text-sm font-mono bg-muted px-2 py-1 rounded">{sessionData.session.status}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Preview Donors</p>
                        <p className="text-2xl font-bold">
                          {Array.isArray(sessionData.session.previewDonorIds)
                            ? sessionData.session.previewDonorIds.length
                            : 0}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="tracking" className="h-full mt-4">
              <TrackingAnalytics sessionId={sessionId} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
