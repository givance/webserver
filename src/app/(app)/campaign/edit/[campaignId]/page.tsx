'use client';

import { useCommunications } from '@/app/hooks/use-communications';
import { Skeleton } from '@/components/ui/skeleton';
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { CampaignSteps } from '../../components/CampaignSteps';

export default function EditCampaignPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = Number(params.campaignId);
  const { getSession } = useCommunications();

  // Load existing campaign data
  const {
    data: sessionData,
    isLoading: isLoadingSession,
    error: sessionError,
  } = getSession({
    sessionId: campaignId,
    // Note: signature will be handled in WriteInstructionStep component where UI signature selection is available
  });

  useEffect(() => {
    if (sessionError) {
      toast.error('Failed to load campaign data');
      router.push('/existing-campaigns');
      return;
    }

    if (sessionData) {
      // Check if campaign is still processing
      // Block editing if the campaign is actively generating emails or running
      // Allow editing for PAUSED campaigns (to edit unsent emails)
      if (sessionData.session.status === 'GENERATING' || sessionData.session.status === 'RUNNING') {
        toast.error('Cannot edit campaign while it is generating or actively sending');
        router.push('/existing-campaigns');
        return;
      }

      console.log('[EditCampaignPage] Session data updated:', {
        campaignId,
        campaignName: sessionData.session.jobName,
        status: sessionData.session.status,
        totalDonors: sessionData.session.totalDonors,
        completedDonors: sessionData.session.completedDonors,
        emailCount: sessionData.emails?.length || 0,
      });
    }
  }, [sessionData, sessionError, router, campaignId]);

  const handleClose = () => {
    router.push('/existing-campaigns');
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
    <div className="container mx-auto py-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">{sessionData.session.jobName}</h1>
      </div>

      <CampaignSteps
        key={`campaign-${campaignId}`}
        onClose={handleClose}
        editMode={true}
        existingCampaignData={{
          campaignId: campaignId,
          campaignName: sessionData.session.jobName,
          selectedDonorIds: sessionData.session.selectedDonorIds as number[],
          chatHistory: Array.isArray(sessionData.session.chatHistory)
            ? (sessionData.session.chatHistory as Array<{
                role: 'user' | 'assistant';
                content: string;
              }>)
            : [], // Ensure chatHistory is always an array
          templateId: sessionData.session.templateId ?? undefined,
          // Include any existing generated emails for reference
          existingGeneratedEmails: sessionData.emails || [],
        }}
      />
    </div>
  );
}
