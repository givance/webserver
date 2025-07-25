'use client';

import { useParams } from 'next/navigation';
import { useCommunications } from '@/app/hooks/use-communications';
import { useDonors } from '@/app/hooks/use-donors';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  EmailListViewer,
  BaseGeneratedEmail,
  BaseDonor,
  TrackingStats,
} from '../../components/EmailListViewer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft,
  Users,
  MessageSquare,
  Mail,
  AlertCircle,
  Activity,
  Eye,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useMemo, useState, useCallback, useEffect } from 'react';
import { TrackingAnalytics } from '@/components/tracking/tracking-analytics';
import { useSessionTracking } from '@/app/hooks/use-email-tracking';
import { Badge } from '@/components/ui/badge';
import { useStaff } from '@/app/hooks/use-staff';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  useDonorStaffEmailValidation,
  type DonorEmailValidationResult,
} from '@/app/hooks/use-donor-validation';

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
    chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
    selectedDonorIds: number[];
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

  const EMAILS_PER_PAGE = 20;

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

  // Debug logging to check if data updates
  useEffect(() => {
    console.log('[Campaign Results] Session data updated:', {
      sessionId,
      emailCount: sessionData?.emails?.length,
      firstEmailContent: sessionData?.emails?.[0]?.structuredContent?.length,
      timestamp: new Date().toISOString(),
    });
  }, [sessionData, sessionId]);

  // Use the validation hook
  const { data: validationResult, isLoading: isValidating } = useDonorStaffEmailValidation(
    sessionData?.session?.selectedDonorIds || []
  );

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
  const { getStaffMembers } = useStaff();
  const { staffMembers } = getStaffMembers();

  // Get staff list with email info
  const { listStaff, getPrimaryStaff } = useStaff();
  const { data: staffData } = listStaff({ limit: 100, isRealPerson: true });
  const { data: primaryStaff } = getPrimaryStaff();

  // Helper functions memoized for performance
  const getDonorData = useCallback(
    (donorId: number) => {
      return donorsData?.find((donor) => donor.id === donorId);
    },
    [donorsData]
  );

  const getStaffName = useCallback(
    (staffId: number | null) => {
      if (!staffId) return 'Unassigned';
      const staff = staffMembers.find((s) => parseInt(s.id, 10) === staffId);
      return staff ? staff.name : 'Unknown Staff';
    },
    [staffMembers]
  );

  // Get staff details including email info
  const getStaffDetails = useCallback(
    (staffId: number | null) => {
      if (!staffId || !staffData) return null;
      const staff = staffData.staff.find((s) => s.id === staffId);
      if (!staff) return null;

      // Map to StaffDetails interface
      return {
        id: staff.id,
        firstName: staff.firstName,
        lastName: staff.lastName,
        email: staff.email,
        gmailToken: undefined,
        microsoftToken: undefined,
      };
    },
    [staffData]
  );

  const getDonorTrackingStats = useCallback(
    (donorId: number) => {
      return donorStats?.find((stats) => stats.donorId === donorId);
    },
    [donorStats]
  );

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
                {error.message || 'An error occurred while loading the email generation results.'}
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
          <p className="text-sm text-muted-foreground">
            The requested email generation session could not be found.
          </p>
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
              Session #{sessionData.session.id} • {sessionData.session.totalDonors} donors •
              Completed{' '}
              {sessionData.session.completedAt
                ? new Date(sessionData.session.completedAt).toLocaleDateString()
                : 'N/A'}
            </p>
          </div>
        </div>
      </div>

      {/* Validation Banner */}
      {isValidating && (
        <div className="border-b bg-blue-50 px-4 py-3">
          <Alert className="border-blue-200">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Validating email setup for all donors...</AlertDescription>
          </Alert>
        </div>
      )}

      {validationResult && !validationResult.isValid && (
        <div className="border-b bg-orange-50 px-4 py-3">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-medium">⚠️ Email setup issues detected for this campaign:</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {validationResult.donorsWithoutStaff.length > 0 && (
                    <li>
                      <strong>{validationResult.donorsWithoutStaff.length}</strong> donor(s)
                      don&apos;t have assigned staff members
                    </li>
                  )}
                  {validationResult.donorsWithStaffButNoEmail.length > 0 && (
                    <li>
                      <strong>{validationResult.donorsWithStaffButNoEmail.length}</strong> donor(s)
                      have staff members without connected Gmail accounts
                    </li>
                  )}
                </ul>
                <p className="text-sm">
                  These issues need to be resolved before emails can be scheduled. Please assign
                  staff to all donors and ensure all staff have connected their Gmail accounts in
                  Settings.
                </p>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      )}

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
              <EmailListViewer
                emails={sessionData?.emails || []}
                donors={
                  donorsData?.map((donor) => ({
                    id: donor.id,
                    firstName: donor.firstName,
                    lastName: donor.lastName,
                    email: donor.email,
                    assignedToStaffId: donor.assignedToStaffId,
                  })) || []
                }
                referenceContexts={
                  sessionData?.emails.reduce<Record<number, Record<string, string>>>(
                    (acc, email) => {
                      acc[email.donorId] = email.referenceContexts;
                      return acc;
                    },
                    {}
                  ) || {}
                }
                showSearch={true}
                showPagination={true}
                showTracking={true}
                showStaffAssignment={true}
                showEditButton={true}
                emailsPerPage={EMAILS_PER_PAGE}
                maxHeight="calc(100vh - 400px)"
                trackingStats={donorStats}
                getStaffName={getStaffName}
                getStaffDetails={getStaffDetails}
                primaryStaff={primaryStaff || null}
                sessionId={sessionId}
                searchPlaceholder="Search emails by recipient, subject, or content..."
                emptyStateTitle="No emails generated"
                emptyStateDescription="This session doesn't have any generated emails yet."
                searchEmptyStateTitle="No emails found"
                searchEmptyStateDescription="No emails match your search criteria"
              />
            </TabsContent>

            <TabsContent value="chat" className="h-full mt-4">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>Chat History</CardTitle>
                </CardHeader>
                <CardContent className="h-full">
                  <ScrollArea className="h-full">
                    <div className="space-y-4">
                      {sessionData.session.chatHistory &&
                      sessionData.session.chatHistory.length > 0 ? (
                        sessionData.session.chatHistory.map(
                          (
                            message: { role: 'user' | 'assistant'; content: string },
                            index: number
                          ) => (
                            <div
                              key={index}
                              className={cn('flex flex-col space-y-2', {
                                'items-end': message.role === 'user',
                              })}
                            >
                              <div
                                className={cn('rounded-lg px-3 py-2 max-w-[80%]', {
                                  'bg-primary text-primary-foreground': message.role === 'user',
                                  'bg-muted': message.role === 'assistant',
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

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Status</p>
                        <p className="text-sm font-mono bg-muted px-2 py-1 rounded">
                          {sessionData.session.status}
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
