'use client';

import { useCommunications } from '@/app/hooks/use-communications';
import { useDonors } from '@/app/hooks/use-donors';
import { useStaff } from '@/app/hooks/use-staff';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, AlertTriangle, ArrowLeft, Edit } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { EmailScheduleControlPanel } from '../components/EmailScheduleControlPanel';
import { EmailScheduleViewer } from '../components/EmailScheduleViewer';
import { EmailStatsViewer } from '../components/EmailStatsViewer';
// Removed EmailScheduleSettings - moved to organization settings
import { useDonorStaffEmailValidation } from '@/app/hooks/use-donor-validation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import React, { useMemo, useState } from 'react';
import { BaseGeneratedEmail, EmailListViewer } from '../components/EmailListViewer';

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = Number(params.campaignId);

  // State for controlling recipients list expansion (initially expanded)
  const [isRecipientsExpanded, setIsRecipientsExpanded] = useState(true);

  const { getSession, getEmailSchedule } = useCommunications();
  const { listStaff, getPrimaryStaff } = useStaff();

  // Get campaign data with signatures appended for display
  const {
    data: sessionData,
    isLoading: isLoadingSession,
    error: sessionError,
  } = getSession({
    sessionId: campaignId,
    signature: '',
  });

  // Fetch staff data for assignment display
  const { data: staffData } = listStaff({
    limit: 100,
    isRealPerson: true,
  });

  // Get primary staff for email fallback
  const { data: primaryStaff } = getPrimaryStaff();

  // Get schedule data
  const { data: scheduleData, isLoading: isLoadingSchedule } = getEmailSchedule(
    { sessionId: campaignId },
    { enabled: !!sessionData }
  );

  // Get donor IDs from session data
  const donorIds = useMemo((): number[] => {
    if (
      !sessionData?.session?.selectedDonorIds ||
      !Array.isArray(sessionData.session.selectedDonorIds)
    ) {
      return [];
    }
    return sessionData.session.selectedDonorIds;
  }, [sessionData?.session?.selectedDonorIds]);

  // Use the validation hook
  const { data: validationResult, isLoading: isValidating } =
    useDonorStaffEmailValidation(donorIds);

  // Fetch donor data
  const { getDonorsQuery } = useDonors();
  const { data: donorsData } = getDonorsQuery(donorIds);

  // Transform emails to proper type
  const typedEmails = useMemo((): BaseGeneratedEmail[] => {
    if (!sessionData?.emails) return [];

    return sessionData.emails.map((email) => ({
      donorId: email.donorId,
      subject: email.subject,
      id: email.id,
      // Type cast the structuredContent from unknown to the proper type
      structuredContent: email.structuredContent as Array<{
        piece: string;
        references: string[];
        addNewlineAfter: boolean;
      }>,
      // Type cast referenceContexts from unknown to the proper type
      referenceContexts: email.referenceContexts as Record<string, string>,
      // Convert null values to undefined to match interface
      emailContent: email.emailContent || undefined,
      reasoning: email.reasoning || undefined,
      // Type cast status to proper union type
      status:
        email.status === 'PENDING_APPROVAL' || email.status === 'APPROVED'
          ? (email.status as 'PENDING_APPROVAL' | 'APPROVED')
          : undefined,
    }));
  }, [sessionData?.emails]);

  // Transform donors to proper type
  const typedDonors = useMemo(() => {
    return (
      donorsData?.map((donor) => ({
        id: donor.id,
        firstName: donor.firstName,
        lastName: donor.lastName,
        email: donor.email,
        assignedToStaffId: donor.assignedToStaffId,
      })) || []
    );
  }, [donorsData]);

  // Build reference contexts from emails
  const referenceContexts = useMemo(() => {
    const contexts: Record<number, Record<string, string>> = {};
    typedEmails.forEach((email) => {
      contexts[email.donorId] = email.referenceContexts || {};
    });
    return contexts;
  }, [typedEmails]);

  if (isLoadingSession) {
    return (
      <div className="container mx-auto py-8">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (sessionError) {
    return (
      <div className="container mx-auto py-8">
        <p className="text-red-500">Error loading campaign: {sessionError.message}</p>
        <Button
          variant="outline"
          onClick={() => router.push('/existing-campaigns')}
          className="mt-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Campaigns
        </Button>
      </div>
    );
  }

  if (!sessionData) {
    return (
      <div className="container mx-auto py-8">
        <p className="text-red-500">Campaign not found</p>
        <Button
          variant="outline"
          onClick={() => router.push('/existing-campaigns')}
          className="mt-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Campaigns
        </Button>
      </div>
    );
  }

  const { session } = sessionData;
  const canEdit = session.status !== 'GENERATING';
  const hasSchedule = scheduleData && scheduleData.stats.total > 0;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return <Badge variant="outline">Draft</Badge>;
      case 'GENERATING':
        return <Badge variant="default">Generating</Badge>;
      case 'READY_TO_SEND':
        return <Badge>Ready to Send</Badge>;
      case 'COMPLETED':
        return <Badge variant="default">Completed</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  return (
    <div className="container mx-auto py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => router.push('/existing-campaigns')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Link
              href={`/campaign/edit/${campaignId}`}
              className="hover:text-primary transition-colors"
            >
              <h1 className="text-2xl font-bold cursor-pointer">{session.jobName}</h1>
            </Link>
            {getStatusBadge(session.status)}
          </div>
          {canEdit && (
            <Link href={`/campaign/edit/${campaignId}`}>
              <Button variant="outline">
                <Edit className="mr-2 h-4 w-4" />
                Edit Campaign
              </Button>
            </Link>
          )}
        </div>
        <div className="text-sm text-muted-foreground">
          <p>Created: {new Date(session.createdAt).toLocaleDateString()}</p>
          <p>
            Total Donors: {session.totalDonors} | Emails Generated: {typedEmails.length}
          </p>
        </div>
      </div>

      {/* Validation Banner */}
      {isValidating && (
        <div className="mb-6">
          <Alert className="border-blue-200 bg-blue-50">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Validating email setup for all donors in this campaign...
            </AlertDescription>
          </Alert>
        </div>
      )}

      {validationResult && !validationResult.isValid && (
        <div className="mb-6">
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

      {/* Main Content */}
      <Tabs defaultValue={hasSchedule ? 'stats' : 'emails'} className="space-y-4">
        <TabsList>
          {hasSchedule && <TabsTrigger value="schedule">Schedule</TabsTrigger>}
          {hasSchedule && <TabsTrigger value="stats">Statistics</TabsTrigger>}
          <TabsTrigger value="emails">Email List ({typedEmails.length})</TabsTrigger>
        </TabsList>

        {/* Schedule Tab */}
        {hasSchedule && (
          <TabsContent value="schedule" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <EmailScheduleViewer sessionId={campaignId} />
              </div>
              <div>
                <EmailScheduleControlPanel sessionId={campaignId} />
              </div>
            </div>
          </TabsContent>
        )}

        {/* Statistics Tab */}
        {hasSchedule && (
          <TabsContent value="stats" className="space-y-6">
            <EmailStatsViewer sessionId={campaignId} />
          </TabsContent>
        )}

        {/* Emails Tab */}
        <TabsContent value="emails">
          <div className="h-[600px] bg-background border rounded-lg overflow-hidden">
            <div className="h-full overflow-hidden p-3 text-xs [&_button]:text-xs [&_button]:px-2 [&_button]:py-1 [&_button]:h-auto [&_p]:text-xs [&_span]:text-xs [&_div]:text-xs">
              <EmailListViewer
                emails={typedEmails}
                donors={typedDonors}
                referenceContexts={referenceContexts}
                showSearch={true}
                showPagination={true}
                showTracking={false}
                showStaffAssignment={true}
                showSendButton={false}
                showEditButton={true}
                showDonorTooltips={true}
                emailsPerPage={20}
                maxHeight="100%"
                emptyStateTitle="No emails generated yet"
                emptyStateDescription="This campaign doesn't have any generated emails yet."
                sessionId={campaignId}
                isRecipientsExpanded={isRecipientsExpanded}
                onRecipientsExpandedChange={setIsRecipientsExpanded}
                getStaffName={(staffId) => {
                  if (!staffId || !staffData?.staff) return 'Unassigned';
                  const staff = staffData.staff.find((s) => s.id === staffId);
                  return staff ? `${staff.firstName} ${staff.lastName}` : 'Unknown Staff';
                }}
                getStaffDetails={(staffId) => {
                  if (!staffId || !staffData?.staff) return null;
                  return staffData.staff.find((s) => s.id === staffId) || null;
                }}
                primaryStaff={primaryStaff || null}
              />
            </div>
          </div>
        </TabsContent>

        {/* Settings Tab removed - moved to organization settings */}
      </Tabs>
    </div>
  );
}
