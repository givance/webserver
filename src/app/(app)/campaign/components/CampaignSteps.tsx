'use client';

import { useCampaignAutoSave } from '@/app/hooks/use-campaign-auto-save';
import { StepIndicator } from '@/components/ui/step-indicator';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useRef } from 'react';
import { useTemplates } from '@/app/hooks/use-templates';
import { useOrganization } from '@/app/hooks/use-organization';
import { generateDefaultCampaignName } from '@/app/lib/utils/campaign-utils';
import { SelectDonorsAndNameStep } from '../steps/SelectDonorsAndNameStep';
import { SelectTemplateStep } from '../steps/SelectTemplateStep';
import { WriteInstructionStepWithStore } from '../steps/WriteInstructionStepWithStore';
import {
  useCampaignData,
  useDonorData,
  useSessionData,
  useChatData,
  useEmailData,
} from '../store/hooks';
import { resetCampaignStore } from '../store';

const STEPS = ['Select Donors & Name', 'Select Template', 'Write Instructions'] as const;
type Step = (typeof STEPS)[number];

interface CampaignStepsProps {
  onClose: () => void;
  editMode?: boolean;
  existingCampaignData?: {
    campaignId: number;
    campaignName: string;
    selectedDonorIds: number[];
    chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
    templateId?: number;
    existingGeneratedEmails?: any[];
  };
}

function CampaignStepsComponent({
  onClose,
  editMode = false,
  existingCampaignData,
}: CampaignStepsProps) {
  // Get organization data for default campaign name generation
  const { getOrganization } = useOrganization();
  const { data: organization } = getOrganization();
  const router = useRouter();

  // Get state and actions from store
  const {
    campaignName,
    templateId: selectedTemplateId,
    templatePrompt,
    currentStep,
    setCampaignName,
    setTemplate,
    setCurrentStep,
    resetCampaign,
  } = useCampaignData();

  const { selectedDonors, setSelectedDonors, clearDonorData } = useDonorData();

  const { sessionId, setSessionId, clearSessionData } = useSessionData();

  const { instruction, chatMessages, setInstruction, setChatMessages, clearChatData } =
    useChatData();

  const {
    generatedEmails,
    referenceContexts,
    setGeneratedEmails,
    setReferenceContexts,
    clearEmailData,
  } = useEmailData();

  // Initialize store with existing data on mount for edit mode
  useEffect(() => {
    if (editMode && existingCampaignData) {
      // Reset store first to ensure clean state
      resetCampaignStore();

      // Set campaign data
      if (existingCampaignData.campaignName) {
        setCampaignName(existingCampaignData.campaignName);
      }
      if (existingCampaignData.selectedDonorIds) {
        setSelectedDonors(existingCampaignData.selectedDonorIds);
      }
      if (existingCampaignData.templateId) {
        setTemplate(existingCampaignData.templateId, '');
      }
      if (existingCampaignData.campaignId) {
        setSessionId(existingCampaignData.campaignId);
      }
      if (existingCampaignData.chatHistory) {
        setChatMessages(existingCampaignData.chatHistory);
      }
      if (existingCampaignData.existingGeneratedEmails) {
        setGeneratedEmails(existingCampaignData.existingGeneratedEmails);
      }

      // Set initial step based on chat history
      if (existingCampaignData.chatHistory && existingCampaignData.chatHistory.length > 0) {
        setCurrentStep(2); // Go to Write Instructions step
      } else {
        setCurrentStep(1); // Go to Template Selection step
      }
    } else if (!editMode) {
      // For new campaigns, reset store and set default campaign name
      resetCampaignStore();
      if (organization?.name) {
        setCampaignName(generateDefaultCampaignName(organization.name));
      }
    }
  }, [editMode, existingCampaignData?.campaignId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update campaign name with default when organization data loads (for new campaigns)
  useEffect(() => {
    if (!editMode && organization?.name && !campaignName) {
      const defaultName = generateDefaultCampaignName(organization.name);
      setCampaignName(defaultName);
    }
  }, [organization?.name, editMode, campaignName, setCampaignName]);

  // Template hooks
  const { getTemplate } = useTemplates();

  // Fetch template data when we have a templateId in edit mode
  const { data: templateData } = getTemplate(
    { id: selectedTemplateId! },
    { enabled: editMode && !!selectedTemplateId }
  );

  // Update templatePrompt when template data is loaded in edit mode
  useEffect(() => {
    if (editMode && templateData?.prompt && !templatePrompt) {
      setTemplate(selectedTemplateId!, templateData.prompt);
    }
  }, [editMode, templateData, templatePrompt, selectedTemplateId, setTemplate]);

  // Navigation auto-save hook
  const { autoSave: navigationAutoSave, manualSave } = useCampaignAutoSave({
    onSessionIdChange: (newSessionId: number) => {
      setSessionId(newSessionId);
    },
  });

  // Enhanced navigation handlers with auto-save
  // Use refs to access current values without causing re-renders
  const instructionRef = useRef(instruction);
  instructionRef.current = instruction;

  const handleStepNavigation = useCallback(
    async (newStep: number) => {
      // Auto-save current state before navigation if we have enough data
      if (campaignName && selectedDonors.length > 0) {
        try {
          await navigationAutoSave({
            sessionId,
            campaignName,
            selectedDonorIds: selectedDonors,
            templateId: selectedTemplateId,
            instruction: instructionRef.current, // Use ref to get current value
            chatHistory: chatMessages,
          });
        } catch (error) {
          // Continue with navigation even if save fails
        }
      }
      setCurrentStep(newStep);
    },
    [
      campaignName,
      selectedDonors,
      sessionId,
      selectedTemplateId,
      chatMessages,
      navigationAutoSave,
      setCurrentStep,
    ]
  );

  const handleDonorsSelected = (donorIds: number[]) => {
    setSelectedDonors(donorIds);
    // Removed automatic step advancement - user must click Next button explicitly
  };

  const handleCampaignNameSet = async (name: string) => {
    // Use the provided name (should not be empty at this point)
    setCampaignName(name);

    // If we're not in edit mode, save and redirect to edit mode
    if (!editMode && selectedDonors.length > 0 && name.trim()) {
      try {
        const result = await manualSave({
          sessionId,
          campaignName: name,
          selectedDonorIds: selectedDonors,
          templateId: selectedTemplateId,
          instruction,
          chatHistory: chatMessages,
        });

        // Get the session ID (either from result or existing sessionId)
        const finalSessionId = result?.sessionId || sessionId;

        if (finalSessionId) {
          router.replace(`/campaign/edit/${finalSessionId}`);
          return; // Don't navigate to next step, we're redirecting
        }
      } catch (error) {
        // Continue with navigation even if save failed
      }
    } else if (editMode) {
    } else {
    }

    // Navigate to next step only if we're in edit mode and didn't redirect
    handleStepNavigation(1);
  };

  const handleTemplateSelected = useCallback(
    (templateId: number | null, prompt?: string) => {
      setTemplate(templateId ?? undefined, prompt || '');
      if (prompt) {
        // In create mode and no chat history, set instruction immediately
        if (!editMode && chatMessages.length === 0) {
          setInstruction(prompt);
        }
      }
    },
    [editMode, chatMessages.length, setTemplate, setInstruction]
  );

  const handleSessionDataChange = useCallback(
    (newSessionData: {
      chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
      generatedEmails?: any[];
      referenceContexts?: Record<number, Record<string, string>>;
    }) => {
      setChatMessages(newSessionData.chatHistory);
      if (newSessionData.generatedEmails) {
        setGeneratedEmails(newSessionData.generatedEmails);
      }
      if (newSessionData.referenceContexts) {
        setReferenceContexts(newSessionData.referenceContexts);
      }
    },
    [setChatMessages, setGeneratedEmails, setReferenceContexts]
  );

  const handleBulkGenerationComplete = useCallback(
    (sessionId: number) => {
      // Navigate to existing campaigns page
      router.push(`/existing-campaigns`);
      onClose();
    },
    [router, onClose]
  );

  // Create a stable callback for instruction changes
  const handleInstructionChange = useCallback(
    (newInstruction: string) => {
      setInstruction(newInstruction);
    },
    [setInstruction]
  );

  // Create stable callbacks for navigation
  const handleBackToTemplates = useCallback(() => {
    handleStepNavigation(1);
  }, [handleStepNavigation]);

  const handleNextFromWriteInstruction = useCallback(() => {
    // This is the final step, onNext could trigger a summary view or be disabled
  }, []);

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <SelectDonorsAndNameStep onNext={(name: string) => handleCampaignNameSet(name)} />;
      case 1:
        return (
          <SelectTemplateStep
            onBack={() => handleStepNavigation(0)}
            onNext={() => handleStepNavigation(2)}
          />
        );
      case 2:
        return (
          <WriteInstructionStepWithStore
            onInstructionChange={handleInstructionChange}
            onBack={handleBackToTemplates}
            onNext={handleNextFromWriteInstruction}
            onSessionDataChange={handleSessionDataChange}
            onBulkGenerationComplete={handleBulkGenerationComplete}
            editMode={editMode}
            initialRefinedInstruction={editMode ? instruction : undefined}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full">
      <div className="w-12 border-r bg-muted/30 py-3 px-2">
        <StepIndicator
          steps={STEPS}
          currentStep={currentStep as number}
          orientation="vertical"
          className="mb-4"
          showOnlyNumbers={true}
        />
      </div>
      <div className="flex-1 px-4 py-3 overflow-auto">{renderStep()}</div>
    </div>
  );
}

// Aggressive memoization for CampaignSteps to prevent unnecessary re-renders
const areEqual = (prevProps: CampaignStepsProps, nextProps: CampaignStepsProps): boolean => {
  // Only re-render for essential prop changes
  const essentialPropsEqual =
    prevProps.editMode === nextProps.editMode &&
    prevProps.existingCampaignData === nextProps.existingCampaignData;

  // We ignore onClose function changes since they're typically stable

  if (!essentialPropsEqual) {
    return false;
  }

  return true; // Block all other re-renders
};

export const CampaignSteps = React.memo(CampaignStepsComponent, areEqual);
