'use client';

import React from 'react';
import { WriteInstructionStepProps } from './write-instruction-step/types';
import {
  useCampaignData,
  useDonorData,
  useSessionData,
  useChatData,
  useEmailData,
} from '../store/hooks';

// Import the original component for now
import { WriteInstructionStep as WriteInstructionStepComponent } from './WriteInstructionStep';

export function WriteInstructionStepWithStore(
  props: Omit<
    WriteInstructionStepProps,
    | 'instruction'
    | 'selectedDonors'
    | 'campaignName'
    | 'templateId'
    | 'sessionId'
    | 'initialChatHistory'
    | 'initialGeneratedEmails'
    | 'initialReferenceContexts'
    | 'templatePrompt'
  >
) {
  // Get data from store
  const { campaignName, templateId, templatePrompt } = useCampaignData();
  const { selectedDonors } = useDonorData();
  const { sessionId } = useSessionData();
  const { chatMessages, instruction } = useChatData();
  const { generatedEmails, referenceContexts } = useEmailData();

  // Pass store data to the original component
  return (
    <WriteInstructionStepComponent
      {...props}
      instruction={instruction}
      selectedDonors={selectedDonors}
      campaignName={campaignName}
      templateId={templateId}
      sessionId={sessionId}
      initialChatHistory={chatMessages}
      initialGeneratedEmails={generatedEmails}
      initialReferenceContexts={referenceContexts}
      templatePrompt={templatePrompt}
    />
  );
}
