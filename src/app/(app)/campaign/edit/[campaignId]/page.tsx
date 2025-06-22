"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useCommunications } from "@/app/hooks/use-communications";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { CampaignSteps } from "../../components/CampaignSteps";

export default function EditCampaignPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = Number(params.campaignId);
  const { getSession } = useCommunications();

  // Load existing campaign data
  const { data: sessionData, isLoading: isLoadingSession, error: sessionError } = getSession({ sessionId: campaignId });

  useEffect(() => {
    if (sessionError) {
      toast.error("Failed to load campaign data");
      router.push("/existing-campaigns");
      return;
    }

    if (sessionData) {
      // Check if campaign is still processing
      // Block editing if the campaign is actively generating emails
      // All other statuses (DRAFT, READY_TO_SEND, COMPLETED) are allowed for editing
      if (sessionData.session.status === "GENERATING") {
        toast.error("Cannot edit campaign while emails are being generated");
        router.push("/existing-campaigns");
        return;
      }

      console.log("[EditCampaignPage] Session data updated:", {
        campaignId,
        campaignName: sessionData.session.jobName,
        refinedInstruction: sessionData.session.refinedInstruction,
        instruction: sessionData.session.instruction,
        status: sessionData.session.status,
        totalDonors: sessionData.session.totalDonors,
        completedDonors: sessionData.session.completedDonors,
        emailCount: sessionData.emails?.length || 0,
      });
    }
  }, [sessionData, sessionError, router, campaignId]);

  const handleClose = () => {
    router.push("/existing-campaigns");
  };

  if (isLoadingSession) {
    return (
      <div className="container mx-auto py-8">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!sessionData) {
    return (
      <div className="container mx-auto py-8">
        <p className="text-red-500">Campaign not found</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Edit Campaign: {sessionData.session.jobName}</h1>
        <p className="text-gray-600">Continue editing your campaign and chat with the AI to refine your messaging.</p>
      </div>

      <CampaignSteps
        key={`campaign-${campaignId}-${sessionData.emails?.length || 0}`}
        onClose={handleClose}
        editMode={true}
        existingCampaignData={{
          campaignId: campaignId,
          campaignName: sessionData.session.jobName,
          selectedDonorIds: sessionData.session.selectedDonorIds,
          chatHistory: sessionData.session.chatHistory,
          instruction: sessionData.session.instruction || "", // Pass the original instruction for fallback
          templateId: sessionData.session.templateId,
          refinedInstruction: sessionData.session.refinedInstruction,
          // Include any existing generated emails for reference
          existingGeneratedEmails: sessionData.emails || [],
        }}
      />
    </div>
  );
}
