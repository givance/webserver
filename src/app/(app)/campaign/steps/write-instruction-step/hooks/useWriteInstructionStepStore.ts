import { useCallback, useEffect, useRef } from 'react';
import { useCampaignStore } from '../../../store';
import { useShallow } from 'zustand/react/shallow';
import {
  useCampaignData,
  useDonorData,
  useEmailData,
  useChatData,
  useSessionData,
  useUIState,
} from '../../../store/hooks';
import { GeneratedEmail } from '../types';

export function useWriteInstructionStepStore(
  initialGeneratedEmails: GeneratedEmail[] = [],
  editMode = false,
  initialChatHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  templatePrompt?: string
) {
  // Get all necessary store data and actions
  const { templatePrompt: storeTemplatePrompt } = useCampaignData();

  const { instruction, setInstruction } = useChatData();

  const {
    selectedDonors,
    totalRemainingDonors,
    canGenerateMore,
    setTotalRemainingDonors,
    setCanGenerateMore,
  } = useDonorData();

  const { sessionId, isSaving, setSaving, updateLastSaved } = useSessionData();

  const {
    generatedEmails,
    allGeneratedEmails,
    emailStatuses,
    referenceContexts,
    refinedInstruction,
    approvedCount,
    pendingCount,
    setGeneratedEmails,
    setAllGeneratedEmails,
    updateEmailStatus,
    setEmailStatuses,
    setReferenceContexts,
    setRefinedInstruction,
    clearEmailData,
  } = useEmailData();

  const {
    chatMessages,
    suggestedMemories,
    setChatMessages,
    saveChatHistory,
    setSuggestedMemories,
    clearChatData,
  } = useChatData();

  // Local chat ref
  const chatEndRef = useRef<HTMLDivElement>(null);

  const {
    isGenerating,
    isGeneratingMore,
    isRegenerating,
    streamingStatus,
    isUpdatingStatus,
    isStartingBulkGeneration,
    showBulkGenerationDialog,
    showRegenerateDialog,
    regenerateOption,
    isChatCollapsed,
    isEmailListExpanded,
    setGenerating,
    setGeneratingMore,
    setRegenerating,
    setStreamingStatus,
    setUpdatingStatus,
    setStartingBulkGeneration,
    setBulkGenerationDialog,
    setRegenerateDialog,
    setRegenerateOption,
    toggleChat,
    toggleEmailList,
    setIsChatCollapsed,
    setIsEmailListExpanded,
  } = useUIState();

  // Local instruction management with ref
  const localInstructionRef = useRef(instruction);
  localInstructionRef.current = instruction;

  // Initialize store with initial data on mount
  useEffect(() => {
    console.log('🏁 useWriteInstructionStepStore initialization effect:', {
      editMode,
      initialGeneratedEmailsLength: initialGeneratedEmails.length,
      allGeneratedEmailsLength: allGeneratedEmails.length,
      shouldInitialize: editMode && initialGeneratedEmails.length > 0,
    });

    if (editMode && initialGeneratedEmails.length > 0) {
      console.log('🔄 Initializing Zustand store with initial emails:', initialGeneratedEmails);
      setAllGeneratedEmails(initialGeneratedEmails);
      setGeneratedEmails(initialGeneratedEmails);

      // Set email statuses
      const statuses: Record<number, 'PENDING_APPROVAL' | 'APPROVED'> = {};
      initialGeneratedEmails.forEach((email) => {
        statuses[email.donorId] = (email as any).status || 'PENDING_APPROVAL';
      });

      // Update store with initial statuses
      Object.entries(statuses).forEach(([donorId, status]) => {
        updateEmailStatus(Number(donorId), status);
      });

      // Set reference contexts
      const contexts: Record<number, Record<string, string>> = {};
      initialGeneratedEmails.forEach((email) => {
        if (email.referenceContexts) {
          contexts[email.donorId] = email.referenceContexts;
        }
      });
      if (Object.keys(contexts).length > 0) {
        setReferenceContexts(contexts);
      }
    }
  }, [
    editMode,
    initialGeneratedEmails,
    allGeneratedEmails.length,
    setAllGeneratedEmails,
    setGeneratedEmails,
    setReferenceContexts,
    updateEmailStatus,
  ]); // Re-run when initialGeneratedEmails changes

  // Initialize chat history
  useEffect(() => {
    if (initialChatHistory.length > 0 && chatMessages.length === 0) {
      setChatMessages(initialChatHistory);
    }
  }, [chatMessages.length, initialChatHistory, setChatMessages]); // Only run once on mount

  // Initialize instruction from template
  useEffect(() => {
    if (templatePrompt && !instruction && chatMessages.length === 0) {
      setInstruction(templatePrompt);
    }
  }, [chatMessages.length, instruction, setInstruction, templatePrompt]); // Only run once on mount

  // Calculate remaining donors and canGenerateMore when emails or selectedDonors change
  useEffect(() => {
    const generatedDonorIds = new Set(allGeneratedEmails.map((email) => email.donorId));
    const remainingDonors = selectedDonors.filter((donorId) => !generatedDonorIds.has(donorId));
    const remainingCount = remainingDonors.length;

    console.log('📊 Calculating donor stats:', {
      selectedDonorsCount: selectedDonors.length,
      generatedEmailsCount: allGeneratedEmails.length,
      generatedDonorIds: Array.from(generatedDonorIds),
      remainingCount,
      canGenerateMore: remainingCount > 0,
    });

    setTotalRemainingDonors(remainingCount);
    setCanGenerateMore(remainingCount > 0);
  }, [allGeneratedEmails, selectedDonors, setTotalRemainingDonors, setCanGenerateMore]);

  // Helper functions
  const clearEmailState = useCallback(() => {
    clearEmailData();
  }, [clearEmailData]);

  const clearInstructionInput = useCallback(() => {
    setInstruction('');
  }, [setInstruction]);

  const setEmailGenerationLoading = useCallback(
    (type: 'generating' | 'generatingMore' | 'regenerating', loading: boolean) => {
      if (type === 'generating') setGenerating(loading);
      else if (type === 'generatingMore') setGeneratingMore(loading);
      else if (type === 'regenerating') setRegenerating(loading);
    },
    [setGenerating, setGeneratingMore, setRegenerating]
  );

  return {
    // Email Generation State
    emailGeneration: {
      isGenerating,
      isGeneratingMore,
      isRegenerating,
      streamingStatus,
      setStreamingStatus,
      setIsGenerating: setGenerating,
      setIsGeneratingMore: setGeneratingMore,
      setIsRegenerating: setRegenerating,
    },

    // Email State
    emailState: {
      generatedEmails,
      allGeneratedEmails,
      referenceContexts,
      emailStatuses,
      approvedCount,
      pendingCount,
      isUpdatingStatus,
      setGeneratedEmails,
      setAllGeneratedEmails,
      setReferenceContexts,
      updateEmailStatus,
      setEmailStatuses,
      setIsUpdatingStatus: setUpdatingStatus,
      clearEmailState,
    },

    // Chat State
    chatState: {
      chatMessages,
      suggestedMemories,
      chatEndRef,
      setChatMessages,
      saveChatHistory,
      setSuggestedMemories,
      clearChatData,
    },

    // Instruction Input State
    instructionInput: {
      localInstruction: instruction,
      setLocalInstruction: setInstruction,
      hasInputContent: !!instruction,
      localInstructionRef,
      clearInstructionInput,
      clearInput: clearInstructionInput, // Alias for handler compatibility
      handleInstructionValueChange: setInstruction, // Alias for input handling
    },

    // UI State
    uiState: {
      showBulkGenerationDialog,
      showRegenerateDialog,
      regenerateOption,
      isChatCollapsed,
      isEmailListExpanded,
      isStartingBulkGeneration,
      setBulkGenerationDialog,
      setRegenerateDialog,
      setRegenerateOption,
      toggleChat,
      toggleEmailList,
      setIsChatCollapsed,
      setIsEmailListExpanded,
      setStartingBulkGeneration,
    },

    // Session State
    sessionState: {
      sessionId,
      isSaving,
      setSaving,
      updateLastSaved,
    },

    // Donor State
    donorState: {
      selectedDonors,
      totalRemainingDonors,
      canGenerateMore,
    },

    // Helper functions
    setEmailGenerationLoading,
  };
}
