"use client";

import { useParams } from "next/navigation";
import { useCommunications } from "@/app/hooks/use-communications";
import { useDonors } from "@/app/hooks/use-donors";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmailDisplay } from "../../components/EmailDisplay";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users, MessageSquare, Mail, AlertCircle } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

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

  const { getDonorQuery } = useDonors();

  // Pre-fetch donor data for all donors in the session
  const donorQueries = sessionData?.session.selectedDonorIds?.map((id: number) => getDonorQuery(id)) || [];

  if (isLoading) {
    return (
      <div className="h-full flex flex-col">
        {/* Header Skeleton */}
        <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center gap-4 p-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/communicate">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Communicate
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
              <Link href="/communicate">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Communicate
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
              <Link href="/communicate">Return to Communicate</Link>
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
            <Link href="/communicate">Return to Communicate</Link>
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
            <Link href="/communicate">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Communicate
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
          <TabsList className="grid w-full grid-cols-3 mx-4 mt-4">
            <TabsTrigger value="emails" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Generated Emails ({sessionData.emails.length})
            </TabsTrigger>
            <TabsTrigger value="chat" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Chat History
            </TabsTrigger>
            <TabsTrigger value="summary" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Summary
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
                    <div className="grid grid-cols-[300px_1fr] h-full border rounded-lg overflow-hidden">
                      <div className="bg-muted/30 overflow-y-auto">
                        <TabsList className="flex flex-col w-full space-y-1 p-2">
                          {sessionData.emails.map((email: GeneratedEmailData) => {
                            const donor = donorQueries.find((q: any) => q.data?.id === email.donorId)?.data;
                            if (!donor) return null;

                            return (
                              <TabsTrigger
                                key={email.donorId}
                                value={email.donorId.toString()}
                                className={cn(
                                  "w-full h-[80px] p-4 rounded-lg",
                                  "flex flex-col items-start justify-center gap-1",
                                  "text-left",
                                  "transition-all duration-200",
                                  "mr-2"
                                )}
                              >
                                <span className="font-medium truncate w-full">
                                  {donor.firstName} {donor.lastName}
                                </span>
                                <span className="text-sm text-muted-foreground data-[state=active]:text-white/70 truncate w-full">
                                  {donor.email}
                                </span>
                              </TabsTrigger>
                            );
                          })}
                        </TabsList>
                      </div>

                      <div className="flex flex-col">
                        {sessionData.emails.map((email: GeneratedEmailData) => {
                          const donor = donorQueries.find((q: any) => q.data?.id === email.donorId)?.data;
                          if (!donor) return null;

                          return (
                            <TabsContent
                              key={email.donorId}
                              value={email.donorId.toString()}
                              className="flex-1 m-0 data-[state=active]:flex flex-col h-full"
                            >
                              <EmailDisplay
                                donorName={`${donor.firstName} ${donor.lastName}`}
                                donorEmail={donor.email}
                                subject={email.subject}
                                content={email.structuredContent}
                                referenceContexts={email.referenceContexts}
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
          </div>
        </Tabs>
      </div>
    </div>
  );
}
