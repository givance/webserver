'use client';

import { useCampaignAutoSave } from '@/app/hooks/use-campaign-auto-save';
import { StepIndicator } from '@/components/ui/step-indicator';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { useTemplates } from '@/app/hooks/use-templates';
import { useOrganization } from '@/app/hooks/use-organization';
import { generateDefaultCampaignName } from '@/app/lib/utils/campaign-utils';
import { SelectDonorsAndNameStep } from '../steps/SelectDonorsAndNameStep';
import { SelectTemplateStep } from '../steps/SelectTemplateStep';
import { WriteInstructionStep } from '../steps/WriteInstructionStep';

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

  // Generate default campaign name for new campaigns
  const getDefaultCampaignName = () => {
    if (editMode || existingCampaignData?.campaignName) {
      return existingCampaignData?.campaignName || '';
    }

    if (organization?.name) {
      return generateDefaultCampaignName(organization.name);
    }

    return ''; // Fallback if organization name isn't loaded yet
  };

  // Initialize state with existing campaign data if in edit mode
  // Determine the right step based on existing data:
  // - If chatHistory exists, go to Write Instructions (step 2)
  // - If templateId exists, go to Write Instructions (step 2)
  // - Otherwise, go to Template Selection (step 1)
  const getInitialStep = () => {
    if (editMode) {
      if (existingCampaignData?.chatHistory?.length) {
        return 2; // Go to Write Instructions step
      } else {
        return 1; // Go to Template Selection step
      }
    }
    return 0; // Start from beginning for create mode
  };
  const [currentStep, setCurrentStep] = useState(getInitialStep());
  const [selectedDonors, setSelectedDonors] = useState<number[]>(
    existingCampaignData?.selectedDonorIds || []
  );
  const [campaignName, setCampaignName] = useState(getDefaultCampaignName());
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | undefined>(
    existingCampaignData?.templateId || undefined
  );
  const [templatePrompt, setTemplatePrompt] = useState<string>('');
  const [instruction, setInstruction] = useState('');

  const [sessionId, setSessionId] = useState<number | undefined>(existingCampaignData?.campaignId);
  const [sessionData, setSessionData] = useState<{
    chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  } | null>(null);
  // Add state to persist chat history and generated emails
  const [persistedChatHistory, setPersistedChatHistory] = useState<
    Array<{ role: 'user' | 'assistant'; content: string }>
  >(existingCampaignData?.chatHistory || []);
  // In edit mode, always use the fresh data from parent, not stale state
  const [persistedGeneratedEmails, setPersistedGeneratedEmails] = useState<any[]>([]);
  const [persistedReferenceContexts, setPersistedReferenceContexts] = useState<
    Record<number, Record<string, string>>
  >({});
  const router = useRouter();

  // Template hooks
  const { getTemplate } = useTemplates();

  // Fetch template data when we have a templateId in edit mode
  const { data: templateData } = getTemplate(
    { id: selectedTemplateId! },
    { enabled: editMode && !!selectedTemplateId }
  );

  // Update campaign name with default when organization data loads (for new campaigns)
  useEffect(() => {
    if (!editMode && organization?.name && !campaignName) {
      const defaultName = generateDefaultCampaignName(organization.name);
      setCampaignName(defaultName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.name, editMode]); // campaignName intentionally excluded to prevent infinite loop

  // Update templatePrompt when template data is loaded in edit mode
  useEffect(() => {
    if (editMode && templateData?.prompt && !templatePrompt) {
      setTemplatePrompt(templateData.prompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, templateData]); // templatePrompt intentionally excluded to prevent infinite loop

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
            chatHistory: persistedChatHistory,
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
      // instruction removed from dependencies - using ref instead
      persistedChatHistory,
      navigationAutoSave,
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
          chatHistory: persistedChatHistory,
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

  const handleTemplateSelected = (templateId: number | null, templatePrompt?: string) => {
    setSelectedTemplateId(templateId ?? undefined);
    if (templatePrompt) {
      // In create mode and no chat history, set instruction immediately
      if (
        !editMode &&
        (!existingCampaignData?.chatHistory || existingCampaignData.chatHistory.length === 0)
      ) {
        setInstruction(templatePrompt);
      }
      setTemplatePrompt(templatePrompt); // Always set the templatePrompt state so it can be passed to WriteInstructionStep
    } else {
      // Clear template prompt if no template is selected
      setTemplatePrompt('');
    }
  };

  const handleSessionDataChange = useCallback(
    (newSessionData: {
      chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
      generatedEmails?: any[];
      referenceContexts?: Record<number, Record<string, string>>;
    }) => {
      setSessionData(newSessionData);
      setPersistedChatHistory(newSessionData.chatHistory);
      if (newSessionData.generatedEmails) {
        setPersistedGeneratedEmails(newSessionData.generatedEmails);
      }
      if (newSessionData.referenceContexts) {
        setPersistedReferenceContexts(newSessionData.referenceContexts);
      }
    },
    []
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
  const handleInstructionChange = useCallback((newInstruction: string) => {
    setInstruction(newInstruction);
  }, []);

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
        return (
          <SelectDonorsAndNameStep
            selectedDonors={selectedDonors}
            onDonorsSelected={handleDonorsSelected}
            campaignName={campaignName}
            onCampaignNameChange={setCampaignName}
            onNext={(name: string) => handleCampaignNameSet(name)}
            sessionId={sessionId}
            onSessionIdChange={setSessionId}
            templateId={selectedTemplateId}
          />
        );
      case 1:
        return (
          <SelectTemplateStep
            selectedTemplateId={selectedTemplateId}
            onTemplateSelected={handleTemplateSelected}
            onBack={() => handleStepNavigation(0)}
            onNext={() => handleStepNavigation(2)}
            sessionId={sessionId}
            onSessionIdChange={setSessionId}
            campaignName={campaignName}
            selectedDonorIds={selectedDonors}
          />
        );
      case 2:
        return (
          <WriteInstructionStep
            instruction={instruction}
            onInstructionChange={handleInstructionChange}
            onBack={handleBackToTemplates}
            onNext={handleNextFromWriteInstruction}
            selectedDonors={selectedDonors}
            onSessionDataChange={handleSessionDataChange}
            templatePrompt={templatePrompt}
            initialChatHistory={persistedChatHistory}
            initialGeneratedEmails={
              editMode && existingCampaignData?.existingGeneratedEmails
                ? existingCampaignData.existingGeneratedEmails
                : persistedGeneratedEmails
            }
            initialReferenceContexts={persistedReferenceContexts}
            campaignName={campaignName}
            templateId={selectedTemplateId}
            onBulkGenerationComplete={handleBulkGenerationComplete}
            sessionId={sessionId}
            editMode={editMode}
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
