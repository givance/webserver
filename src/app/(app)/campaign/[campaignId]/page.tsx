"use client";

import { useParams, useRouter } from "next/navigation";
import { useCommunications } from "@/app/hooks/use-communications";
import { useDonors } from "@/app/hooks/use-donors";
import { useStaff } from "@/app/hooks/use-staff";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Edit } from "lucide-react";
import Link from "next/link";
import { EmailScheduleViewer } from "../components/EmailScheduleViewer";
import { EmailScheduleControlPanel } from "../components/EmailScheduleControlPanel";
// Removed EmailScheduleSettings - moved to organization settings
import { EmailListViewer, BaseGeneratedEmail } from "../components/EmailListViewer";
import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";
import React from "react";

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = Number(params.campaignId);

  const { getSession, getEmailSchedule } = useCommunications();
  const { listStaff, getPrimaryStaff } = useStaff();

  // Get campaign data
  const { data: sessionData, isLoading: isLoadingSession, error: sessionError } = getSession({ sessionId: campaignId });

  // Fetch staff data for assignment display
  const { data: staffData } = listStaff({
    limit: 100,
    isRealPerson: true,
  });

  // Get primary staff for email fallback
  const { data: primaryStaff } = getPrimaryStaff();

  // Debug: Log what we're actually getting from getSession
  React.useEffect(() => {
    if (sessionData) {
      console.log("[CampaignDetailPage] Session data received:", {
        hasSession: !!sessionData.session,
        hasEmails: !!sessionData.emails,
        emailsLength: sessionData.emails?.length || 0,
        hasScheduledEmails: !!(sessionData as any).scheduledEmails,
        hasStats: !!(sessionData as any).stats,
        sessionKeys: Object.keys(sessionData),
      });
    }
  }, [sessionData]);

  // Get schedule data
  const { data: scheduleData, isLoading: isLoadingSchedule } = getEmailSchedule(
    { sessionId: campaignId },
    { enabled: !!sessionData }
  );

  // Get donor IDs from session data
  const donorIds = useMemo((): number[] => {
    if (!sessionData?.session?.selectedDonorIds || !Array.isArray(sessionData.session.selectedDonorIds)) {
      return [];
    }
    return sessionData.session.selectedDonorIds;
  }, [sessionData?.session?.selectedDonorIds]);

  // Fetch donor data
  const { getDonorsQuery } = useDonors();
  const { data: donorsData } = getDonorsQuery(donorIds);

  // Transform emails to proper type
  const typedEmails = useMemo((): BaseGeneratedEmail[] => {
    if (!sessionData?.emails) return [];

    return sessionData.emails.map((email) => ({
      ...email,
      // Type cast the structuredContent from unknown to the proper type
      structuredContent: email.structuredContent as Array<{
        piece: string;
        references: string[];
        addNewlineAfter: boolean;
      }>,
      // Type cast referenceContexts from unknown to the proper type
      referenceContexts: email.referenceContexts as Record<string, string>,
      // Type cast status to proper union type
      status:
        email.status === "PENDING_APPROVAL" || email.status === "APPROVED"
          ? (email.status as "PENDING_APPROVAL" | "APPROVED")
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
      contexts[email.donorId] = email.referenceContexts;
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
    console.error("Session error:", sessionError);
    return (
      <div className="container mx-auto py-8">
        <p className="text-red-500">Error loading campaign: {sessionError.message}</p>
        <Button variant="outline" onClick={() => router.push("/existing-campaigns")} className="mt-4">
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
        <Button variant="outline" onClick={() => router.push("/existing-campaigns")} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Campaigns
        </Button>
      </div>
    );
  }

  const { session } = sessionData;
  const canEdit = session.status !== "GENERATING";
  const hasSchedule = scheduleData && scheduleData.stats.total > 0;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "DRAFT":
        return <Badge variant="outline">Draft</Badge>;
      case "GENERATING":
        return <Badge variant="default">Generating</Badge>;
      case "READY_TO_SEND":
        return <Badge>Ready to Send</Badge>;
      case "COMPLETED":
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
            <Button variant="outline" size="sm" onClick={() => router.push("/existing-campaigns")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <h1 className="text-2xl font-bold">{session.jobName}</h1>
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

      {/* Main Content */}
      <Tabs defaultValue={hasSchedule ? "schedule" : "emails"} className="space-y-4">
        <TabsList>
          {hasSchedule && <TabsTrigger value="schedule">Schedule & Status</TabsTrigger>}
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

        {/* Emails Tab */}
        <TabsContent value="emails">
          <EmailListViewer
            emails={typedEmails}
            donors={typedDonors}
            referenceContexts={referenceContexts}
            showSearch={true}
            showPagination={true}
            showStaffAssignment={true}
            showEditButton={true}
            emailsPerPage={20}
            emptyStateTitle="No emails generated yet"
            emptyStateDescription="This campaign doesn't have any generated emails yet."
            sessionId={campaignId}
            getStaffName={(staffId) => {
              if (!staffId || !staffData?.staff) return "Unassigned";
              const staff = staffData.staff.find((s) => s.id === staffId);
              return staff ? `${staff.firstName} ${staff.lastName}` : "Unknown Staff";
            }}
            getStaffDetails={(staffId) => {
              if (!staffId || !staffData?.staff) return null;
              return staffData.staff.find((s) => s.id === staffId) || null;
            }}
            primaryStaff={primaryStaff || null}
          />
        </TabsContent>

        {/* Settings Tab removed - moved to organization settings */}
      </Tabs>
    </div>
  );
}
