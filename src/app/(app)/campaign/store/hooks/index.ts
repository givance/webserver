import { useShallow } from 'zustand/react/shallow';
import { useCampaignStore } from '../index';

// Campaign hooks
export const useCampaignData = () => {
  return useCampaignStore(
    useShallow((state) => ({
      campaignName: state.campaignName,
      templateId: state.templateId,
      templatePrompt: state.templatePrompt,
      currentStep: state.currentStep,
      setCampaignName: state.setCampaignName,
      setTemplate: state.setTemplate,
      setCurrentStep: state.setCurrentStep,
      resetCampaign: state.resetCampaign,
    }))
  );
};

// Donor hooks
export const useDonorData = () => {
  return useCampaignStore(
    useShallow((state) => ({
      selectedDonors: state.selectedDonors,
      donorData: state.donorData,
      setSelectedDonors: state.setSelectedDonors,
      addDonor: state.addDonor,
      removeDonor: state.removeDonor,
      cacheDonorData: state.cacheDonorData,
      clearDonorData: state.clearDonorData,
    }))
  );
};

// Email hooks
export const useEmailData = () => {
  return useCampaignStore(
    useShallow((state) => ({
      generatedEmails: state.generatedEmails,
      sampleEmails: state.sampleEmails,
      selectedSampleIndex: state.selectedSampleIndex,
      emailStatuses: state.emailStatuses,
      referenceContexts: state.referenceContexts,
      refinedInstruction: state.refinedInstruction,
      allGeneratedEmails: state.allGeneratedEmails,
      setGeneratedEmails: state.setGeneratedEmails,
      setSampleEmails: state.setSampleEmails,
      setSelectedSample: state.setSelectedSample,
      updateEmailStatus: state.updateEmailStatus,
      updateEmail: state.updateEmail,
      setReferenceContexts: state.setReferenceContexts,
      setRefinedInstruction: state.setRefinedInstruction,
      setAllGeneratedEmails: state.setAllGeneratedEmails,
      clearEmailData: state.clearEmailData,
    }))
  );
};

// Chat hooks
export const useChatData = () => {
  return useCampaignStore(
    useShallow((state) => ({
      chatMessages: state.chatMessages,
      instruction: state.instruction,
      suggestedMemories: state.suggestedMemories,
      isAgenticFlow: state.isAgenticFlow,
      agenticSessionId: state.agenticSessionId,
      addChatMessage: state.addChatMessage,
      setChatMessages: state.setChatMessages,
      setInstruction: state.setInstruction,
      setSuggestedMemories: state.setSuggestedMemories,
      setAgenticFlow: state.setAgenticFlow,
      clearChatData: state.clearChatData,
    }))
  );
};

// Session hooks
export const useSessionData = () => {
  return useCampaignStore(
    useShallow((state) => ({
      sessionId: state.sessionId,
      isSessionLoading: state.isSessionLoading,
      isSaving: state.isSaving,
      lastSaved: state.lastSaved,
      setSessionId: state.setSessionId,
      setSessionLoading: state.setSessionLoading,
      setSaving: state.setSaving,
      updateLastSaved: state.updateLastSaved,
      clearSessionData: state.clearSessionData,
    }))
  );
};

// UI hooks
export const useUIState = () => {
  return useCampaignStore(
    useShallow((state) => ({
      isGenerating: state.isGenerating,
      isGeneratingMore: state.isGeneratingMore,
      isRegenerating: state.isRegenerating,
      isScheduling: state.isScheduling,
      showScheduleConfig: state.showScheduleConfig,
      showBulkGenerationDialog: state.showBulkGenerationDialog,
      showRegenerateDialog: state.showRegenerateDialog,
      isChatCollapsed: state.isChatCollapsed,
      isEmailListExpanded: state.isEmailListExpanded,
      validationResult: state.validationResult,
      error: state.error,
      streamingStatus: state.streamingStatus,
      isUpdatingStatus: state.isUpdatingStatus,
      isStartingBulkGeneration: state.isStartingBulkGeneration,
      regenerateOption: state.regenerateOption,
      setGenerating: state.setGenerating,
      setGeneratingMore: state.setGeneratingMore,
      setRegenerating: state.setRegenerating,
      setScheduling: state.setScheduling,
      toggleScheduleConfig: state.toggleScheduleConfig,
      setBulkGenerationDialog: state.setBulkGenerationDialog,
      setRegenerateDialog: state.setRegenerateDialog,
      toggleChat: state.toggleChat,
      toggleEmailList: state.toggleEmailList,
      setValidationResult: state.setValidationResult,
      setError: state.setError,
      setStreamingStatus: state.setStreamingStatus,
      setUpdatingStatus: state.setUpdatingStatus,
      setStartingBulkGeneration: state.setStartingBulkGeneration,
      setRegenerateOption: state.setRegenerateOption,
      resetUIState: state.resetUIState,
    }))
  );
};

// Specific selector hooks for common use cases
export const useCurrentStep = () => useCampaignStore((state) => state.currentStep);
export const useSelectedDonors = () => useCampaignStore((state) => state.selectedDonors);
export const useGeneratedEmails = () => useCampaignStore((state) => state.generatedEmails);
export const useIsGenerating = () => useCampaignStore((state) => state.isGenerating);
export const useSessionId = () => useCampaignStore((state) => state.sessionId);
