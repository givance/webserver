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
  const [isLoading, setIsLoading] = useState(true);
  const [campaignData, setCampaignData] = useState<any>(null);

  // Load existing campaign data
  const { data: sessionData, isLoading: isLoadingSession, error: sessionError } = getSession({ sessionId: campaignId });

  useEffect(() => {
    if (sessionError) {
      toast.error("Failed to load campaign data");
      router.push("/existing-campaigns");
      return;
    }

    if (sessionData && !isLoadingSession) {
      // Check if campaign is still processing
      if (sessionData.session.status === "IN_PROGRESS" || sessionData.session.status === "PENDING") {
        toast.error("Cannot edit campaign while it's still processing");
        router.push("/existing-campaigns");
        return;
      }

      setCampaignData(sessionData);
      setIsLoading(false);
    }
  }, [sessionData, isLoadingSession, sessionError, router]);

  const handleClose = () => {
    router.push("/existing-campaigns");
  };

  if (isLoading || isLoadingSession) {
    return (
      <div className="container mx-auto py-8">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!campaignData) {
    return (
      <div className="container mx-auto py-8">
        <p className="text-red-500">Campaign not found</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Edit Campaign: {campaignData.session.jobName}</h1>
        <p className="text-gray-600">Continue editing your campaign and chat with the AI to refine your messaging.</p>
      </div>

      <CampaignSteps
        onClose={handleClose}
        editMode={true}
        existingCampaignData={{
          campaignId: campaignId,
          campaignName: campaignData.session.jobName,
          selectedDonorIds: campaignData.session.selectedDonorIds,
          chatHistory: campaignData.session.chatHistory,
          instruction: "", // Don't pre-populate instruction in edit mode - let user start fresh
          templateId: campaignData.session.templateId,
          // Include any existing generated emails for reference
          existingGeneratedEmails: campaignData.emails || [],
        }}
      />
    </div>
  );
}
