import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { CampaignStore } from './types';

// Import slices
import { createCampaignSlice } from './slices/campaign';
import { createDonorSlice } from './slices/donor';
import { createEmailSlice } from './slices/email';
import { createChatSlice } from './slices/chat';
import { createSessionSlice } from './slices/session';
import { createUISlice } from './slices/ui';

// Create the store with all slices combined
export const useCampaignStore = create<CampaignStore>()(
  devtools(
    persist(
      immer((...args) => ({
        ...createCampaignSlice(...args),
        ...createDonorSlice(...args),
        ...createEmailSlice(...args),
        ...createChatSlice(...args),
        ...createSessionSlice(...args),
        ...createUISlice(...args),
      })),
      {
        name: 'campaign-store',
        // Only persist essential data, not UI state
        partialize: (state) => ({
          // Campaign data
          campaignName: state.campaignName,
          templateId: state.templateId,
          templatePrompt: state.templatePrompt,
          currentStep: state.currentStep,

          // Donor data
          selectedDonors: state.selectedDonors,

          // Email data
          generatedEmails: state.generatedEmails,
          emailStatuses: state.emailStatuses,
          referenceContexts: state.referenceContexts,
          refinedInstruction: state.refinedInstruction,

          // Chat data
          chatMessages: state.chatMessages,
          instruction: state.instruction,
          suggestedMemories: state.suggestedMemories,

          // Session data
          sessionId: state.sessionId,
        }),
      }
    ),
    {
      name: 'campaign-store',
    }
  )
);

// Helper function to reset entire store
export const resetCampaignStore = () => {
  useCampaignStore.getState().resetCampaign();
  useCampaignStore.getState().clearDonorData();
  useCampaignStore.getState().clearEmailData();
  useCampaignStore.getState().clearChatData();
  useCampaignStore.getState().clearSessionData();
  useCampaignStore.getState().resetUIState();
};
