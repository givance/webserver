"use client";

import { StepIndicator } from "@/components/ui/step-indicator";
import { useRouter } from "next/navigation";
import { useState, useCallback } from "react";
import { CampaignNameStep } from "../steps/CampaignNameStep";
import { SelectDonorsStep } from "../steps/SelectDonorsStep";
import { SelectTemplateStep } from "../steps/SelectTemplateStep";
import { WriteInstructionStep } from "../steps/WriteInstructionStep";
import { useCampaignAutoSave } from "@/app/hooks/use-campaign-auto-save";
import { toast } from "react-hot-toast";

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
    refinedInstruction?: string;
    existingGeneratedEmails?: any[];
  };
}

export function CampaignSteps({ onClose, editMode = false, existingCampaignData }: CampaignStepsProps) {
  // Initialize state with existing campaign data if in edit mode
  const [currentStep, setCurrentStep] = useState(editMode ? 3 : 0); // Go directly to Write Instructions step in edit mode
  const [selectedDonors, setSelectedDonors] = useState<number[]>(existingCampaignData?.selectedDonorIds || []);
  const [campaignName, setCampaignName] = useState(existingCampaignData?.campaignName || "");
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | undefined>(
    existingCampaignData?.templateId || undefined
  );
  const [templatePrompt, setTemplatePrompt] = useState<string>("");
  const [instruction, setInstruction] = useState(existingCampaignData?.instruction || "");
  const [sessionId, setSessionId] = useState<number | undefined>(existingCampaignData?.campaignId);
  const [sessionData, setSessionData] = useState<{
    chatHistory: Array<{ role: "user" | "assistant"; content: string }>;
    finalInstruction: string;
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

  // Navigation auto-save hook
  const { autoSave: navigationAutoSave } = useCampaignAutoSave({
    onSessionIdChange: setSessionId,
  });

  // Enhanced navigation handlers with auto-save
  const handleStepNavigation = useCallback(
    async (newStep: number) => {
      // Auto-save current state before navigation if we have enough data
      if (campaignName && selectedDonors.length > 0) {
        await navigationAutoSave({
          sessionId,
          campaignName,
          selectedDonorIds: selectedDonors,
          templateId: selectedTemplateId,
          instruction,
          chatHistory: persistedChatHistory,
          refinedInstruction: existingCampaignData?.refinedInstruction,
          previewDonorIds: persistedPreviewDonorIds,
        });
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
      existingCampaignData?.refinedInstruction,
      persistedPreviewDonorIds,
      navigationAutoSave,
    ]
  );

  const handleDonorsSelected = (donorIds: number[]) => {
    setSelectedDonors(donorIds);
    // Removed automatic step advancement - user must click Next button explicitly
  };

  const handleCampaignNameSet = (name: string) => {
    setCampaignName(name);
    handleStepNavigation(2);
  };

  const handleTemplateSelected = (templateId: number | null, templatePrompt?: string) => {
    setSelectedTemplateId(templateId ?? undefined);
    if (templatePrompt) {
      setInstruction(templatePrompt);
    }
    handleStepNavigation(3);
  };

  const handleSessionDataChange = useCallback(
    (newSessionData: {
      chatHistory: Array<{ role: "user" | "assistant"; content: string }>;
      finalInstruction: string;
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
            onCampaignNameChange={handleCampaignNameSet}
            onBack={() => handleStepNavigation(0)}
            onNext={() => handleStepNavigation(2)}
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
            templatePrompt={editMode ? undefined : templatePrompt}
            initialChatHistory={persistedChatHistory}
            initialGeneratedEmails={editMode && existingCampaignData?.existingGeneratedEmails ? existingCampaignData.existingGeneratedEmails : persistedGeneratedEmails}
            initialReferenceContexts={persistedReferenceContexts}
            initialPreviewDonorIds={persistedPreviewDonorIds}
            initialRefinedInstruction={existingCampaignData?.refinedInstruction}
            campaignName={campaignName}
            templateId={selectedTemplateId}
            onBulkGenerationComplete={handleBulkGenerationComplete}
            sessionId={sessionId}
            editMode={editMode}
            existingCampaignId={existingCampaignData?.campaignId}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full">
      <div className="w-48 border-r bg-muted/30 py-4 px-2">
        <StepIndicator steps={STEPS} currentStep={currentStep as number} orientation="vertical" className="mb-6" />
      </div>
      <div className="flex-1 px-6 py-4 overflow-auto">{renderStep()}</div>
    </div>
  );
}
