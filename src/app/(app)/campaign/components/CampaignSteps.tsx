"use client";

import { useCampaignAutoSave } from "@/app/hooks/use-campaign-auto-save";
import { StepIndicator } from "@/components/ui/step-indicator";
import { useRouter } from "next/navigation";
import { useCallback, useState, useEffect } from "react";
import { useTemplates } from "@/app/hooks/use-templates";
import { CampaignNameStep } from "../steps/CampaignNameStep";
import { SelectDonorsStep } from "../steps/SelectDonorsStep";
import { SelectTemplateStep } from "../steps/SelectTemplateStep";
import { WriteInstructionStep } from "../steps/WriteInstructionStep";

const STEPS = ["Select Donors", "Campaign Name", "Select Template", "Write Instructions"] as const;
type Step = (typeof STEPS)[number];

interface CampaignStepsProps {
  onClose: () => void;
  editMode?: boolean;
  existingCampaignData?: {
    campaignId: number;
    campaignName: string;
    selectedDonorIds: number[];
    chatHistory: Array<{ role: "user" | "assistant"; content: string }>;
    instruction: string;
    templateId?: number;
    existingGeneratedEmails?: any[];
  };
}

export function CampaignSteps({ onClose, editMode = false, existingCampaignData }: CampaignStepsProps) {
  // Initialize state with existing campaign data if in edit mode
  // Determine the right step based on existing data:
  // - If instruction exists, go to Write Instructions (step 3)
  // - If templateId exists, go to Write Instructions (step 3)
  // - Otherwise, go to Template Selection (step 2)
  const getInitialStep = () => {
    if (editMode) {
      if (existingCampaignData?.instruction) {
        return 3; // Go to Write Instructions step
      } else {
        return 2; // Go to Template Selection step
      }
    }
    return 0; // Start from beginning for create mode
  };
  const [currentStep, setCurrentStep] = useState(getInitialStep());
  const [selectedDonors, setSelectedDonors] = useState<number[]>(existingCampaignData?.selectedDonorIds || []);
  const [campaignName, setCampaignName] = useState(existingCampaignData?.campaignName || "");
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | undefined>(
    existingCampaignData?.templateId || undefined
  );
  const [templatePrompt, setTemplatePrompt] = useState<string>("");
  const [instruction, setInstruction] = useState(
    existingCampaignData?.chatHistory.length ? "" : existingCampaignData?.instruction || ""
  );

  const [sessionId, setSessionId] = useState<number | undefined>(existingCampaignData?.campaignId);
  const [sessionData, setSessionData] = useState<{
    chatHistory: Array<{ role: "user" | "assistant"; content: string }>;
    previewDonorIds: number[];
  } | null>(null);
  // Add state to persist chat history and generated emails
  const [persistedChatHistory, setPersistedChatHistory] = useState<
    Array<{ role: "user" | "assistant"; content: string }>
  >(existingCampaignData?.chatHistory || []);
  // In edit mode, always use the fresh data from parent, not stale state
  const [persistedGeneratedEmails, setPersistedGeneratedEmails] = useState<any[]>([]);
  const [persistedReferenceContexts, setPersistedReferenceContexts] = useState<Record<number, Record<string, string>>>(
    {}
  );
  const [persistedPreviewDonorIds, setPersistedPreviewDonorIds] = useState<number[]>([]);
  const router = useRouter();

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
      console.log(
        "[CampaignSteps] Loading template prompt for edit mode:",
        templateData.prompt.substring(0, 100) + "..."
      );
      setTemplatePrompt(templateData.prompt);
    }
  }, [editMode, templateData, templatePrompt]);

  // Navigation auto-save hook
  const { autoSave: navigationAutoSave, manualSave } = useCampaignAutoSave({
    onSessionIdChange: (newSessionId: number) => {
      console.log("[CampaignSteps] onSessionIdChange called with:", {
        newSessionId,
        editMode,
        currentSessionId: sessionId,
      });

      setSessionId(newSessionId);
    },
  });

  // Enhanced navigation handlers with auto-save
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
            instruction,
            chatHistory: persistedChatHistory,
            previewDonorIds: persistedPreviewDonorIds,
          });
        } catch (error) {
          console.error("[CampaignSteps] Auto-save failed during navigation:", error);
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
      instruction,
      persistedChatHistory,
      persistedPreviewDonorIds,
      navigationAutoSave,
    ]
  );

  const handleDonorsSelected = (donorIds: number[]) => {
    setSelectedDonors(donorIds);
    // Removed automatic step advancement - user must click Next button explicitly
  };

  const handleCampaignNameSet = async (name: string) => {
    console.log("[CampaignSteps] handleCampaignNameSet called with:", {
      name,
      campaignName,
      sessionId,
      editMode,
      selectedDonorsCount: selectedDonors.length,
    });

    // Use the provided name (should not be empty at this point)
    setCampaignName(name);

    // If we're not in edit mode, save and redirect to edit mode
    if (!editMode && selectedDonors.length > 0 && name.trim()) {
      console.log("[CampaignSteps] About to trigger manualSave and redirect to edit mode");
      try {
        const result = await manualSave({
          sessionId,
          campaignName: name,
          selectedDonorIds: selectedDonors,
          templateId: selectedTemplateId,
          instruction,
          chatHistory: persistedChatHistory,
          previewDonorIds: persistedPreviewDonorIds,
        });

        console.log("[CampaignSteps] Manual save result:", result);

        // Get the session ID (either from result or existing sessionId)
        const finalSessionId = result?.sessionId || sessionId;

        if (finalSessionId) {
          console.log("[CampaignSteps] Redirecting to edit mode with sessionId:", finalSessionId);
          router.replace(`/campaign/edit/${finalSessionId}`);
          return; // Don't navigate to next step, we're redirecting
        }
      } catch (error) {
        console.error("Failed to save campaign after name set:", error);
        // Continue with navigation even if save failed
      }
    } else if (editMode) {
      console.log("[CampaignSteps] In edit mode, navigating to next step normally");
    } else {
      console.log("[CampaignSteps] Skipping save - conditions not met:", {
        editMode,
        selectedDonorsLength: selectedDonors.length,
        nameToUseTrimmed: name.trim(),
      });
    }

    // Navigate to next step only if we're in edit mode and didn't redirect
    console.log("[CampaignSteps] Navigating to step 2");
    handleStepNavigation(2);
  };

  const handleTemplateSelected = (templateId: number | null, templatePrompt?: string) => {
    setSelectedTemplateId(templateId ?? undefined);
    if (templatePrompt) {
      // In create mode and no chat history, set instruction immediately
      if (!editMode && !existingCampaignData?.chatHistory.length) {
        setInstruction(templatePrompt);
      }
      setTemplatePrompt(templatePrompt); // Always set the templatePrompt state so it can be passed to WriteInstructionStep
    } else {
      // Clear template prompt if no template is selected
      setTemplatePrompt("");
    }
  };

  const handleSessionDataChange = useCallback(
    (newSessionData: {
      chatHistory: Array<{ role: "user" | "assistant"; content: string }>;
      previewDonorIds: number[];
      generatedEmails?: any[];
      referenceContexts?: Record<number, Record<string, string>>;
    }) => {
      setSessionData(newSessionData);
      setPersistedChatHistory(newSessionData.chatHistory);
      setPersistedPreviewDonorIds(newSessionData.previewDonorIds);
      if (newSessionData.generatedEmails) {
        setPersistedGeneratedEmails(newSessionData.generatedEmails);
      }
      if (newSessionData.referenceContexts) {
        setPersistedReferenceContexts(newSessionData.referenceContexts);
      }
    },
    []
  );

  const handleBulkGenerationComplete = (sessionId: number) => {
    // Navigate to existing campaigns page
    router.push(`/existing-campaigns`);
    onClose();
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <SelectDonorsStep
            selectedDonors={selectedDonors}
            onDonorsSelected={handleDonorsSelected}
            onNext={() => handleStepNavigation(1)}
            sessionId={sessionId}
            onSessionIdChange={setSessionId}
            campaignName={campaignName}
            templateId={selectedTemplateId}
          />
        );
      case 1:
        return (
          <CampaignNameStep
            selectedDonors={selectedDonors}
            campaignName={campaignName}
            onCampaignNameChange={setCampaignName}
            onBack={() => handleStepNavigation(0)}
            onNext={(name: string) => handleCampaignNameSet(name)}
            sessionId={sessionId}
            onSessionIdChange={setSessionId}
            templateId={selectedTemplateId}
          />
        );
      case 2:
        return (
          <SelectTemplateStep
            selectedTemplateId={selectedTemplateId}
            onTemplateSelected={handleTemplateSelected}
            onBack={() => handleStepNavigation(1)}
            onNext={() => handleStepNavigation(3)}
            sessionId={sessionId}
            onSessionIdChange={setSessionId}
            campaignName={campaignName}
            selectedDonorIds={selectedDonors}
          />
        );
      case 3:
        return (
          <WriteInstructionStep
            instruction={instruction}
            onInstructionChange={setInstruction}
            onBack={() => handleStepNavigation(2)}
            onNext={() => {
              /* This is the final step, onNext could trigger a summary view or be disabled */
            }}
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
            initialPreviewDonorIds={persistedPreviewDonorIds}
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
      <div className="w-16 border-r bg-muted/30 py-4 px-3">
        <StepIndicator
          steps={STEPS}
          currentStep={currentStep as number}
          orientation="vertical"
          className="mb-6"
          showOnlyNumbers={true}
        />
      </div>
      <div className="flex-1 px-6 py-4 overflow-auto">{renderStep()}</div>
    </div>
  );
}
