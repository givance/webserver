"use client";

import { StepIndicator } from "@/components/ui/step-indicator";
import { useRouter } from "next/navigation";
import { useState, useCallback } from "react";
import { CampaignNameStep } from "../steps/CampaignNameStep";
import { SelectDonorsStep } from "../steps/SelectDonorsStep";
import { SelectTemplateStep } from "../steps/SelectTemplateStep";
import { WriteInstructionStep } from "../steps/WriteInstructionStep";
import { toast } from "react-hot-toast";

const STEPS = ["Select Donors", "Campaign Name", "Select Template", "Write Instructions"] as const;
type Step = (typeof STEPS)[number];

interface CampaignStepsProps {
  onClose: () => void;
}

export function CampaignSteps({ onClose }: CampaignStepsProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedDonors, setSelectedDonors] = useState<number[]>([]);
  const [campaignName, setCampaignName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | undefined>(undefined);
  const [templatePrompt, setTemplatePrompt] = useState<string>("");
  const [instruction, setInstruction] = useState("");
  const [sessionData, setSessionData] = useState<{
    chatHistory: Array<{ role: "user" | "assistant"; content: string }>;
    finalInstruction: string;
    previewDonorIds: number[];
  } | null>(null);
  // Add state to persist chat history and generated emails
  const [persistedChatHistory, setPersistedChatHistory] = useState<
    Array<{ role: "user" | "assistant"; content: string }>
  >([]);
  const [persistedGeneratedEmails, setPersistedGeneratedEmails] = useState<any[]>([]);
  const [persistedReferenceContexts, setPersistedReferenceContexts] = useState<Record<number, Record<string, string>>>(
    {}
  );
  const [persistedPreviewDonorIds, setPersistedPreviewDonorIds] = useState<number[]>([]);
  const router = useRouter();

  const handleDonorsSelected = (donorIds: number[]) => {
    setSelectedDonors(donorIds);
    // Removed automatic step advancement - user must click Next button explicitly
  };

  const handleCampaignNameSet = (name: string) => {
    setCampaignName(name);
    setCurrentStep(2);
  };

  const handleTemplateSelected = (templateId: number | null, templatePrompt?: string) => {
    setSelectedTemplateId(templateId ?? undefined);
    if (templatePrompt) {
      setInstruction(templatePrompt);
    }
    setCurrentStep(3);
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
            onNext={() => setCurrentStep(1)}
          />
        );
      case 1:
        return (
          <CampaignNameStep
            selectedDonors={selectedDonors}
            campaignName={campaignName}
            onCampaignNameChange={handleCampaignNameSet}
            onBack={() => setCurrentStep(0)}
            onNext={() => setCurrentStep(2)}
          />
        );
      case 2:
        return (
          <SelectTemplateStep
            selectedTemplateId={selectedTemplateId}
            onTemplateSelected={handleTemplateSelected}
            onBack={() => setCurrentStep(1)}
            onNext={() => setCurrentStep(3)}
          />
        );
      case 3:
        return (
          <WriteInstructionStep
            instruction={instruction}
            onInstructionChange={setInstruction}
            onBack={() => setCurrentStep(2)}
            onNext={() => {
              /* This is the final step, onNext could trigger a summary view or be disabled */
            }}
            selectedDonors={selectedDonors}
            onSessionDataChange={handleSessionDataChange}
            templatePrompt={templatePrompt}
            initialChatHistory={persistedChatHistory}
            initialGeneratedEmails={persistedGeneratedEmails}
            initialReferenceContexts={persistedReferenceContexts}
            initialPreviewDonorIds={persistedPreviewDonorIds}
            campaignName={campaignName}
            templateId={selectedTemplateId}
            onBulkGenerationComplete={handleBulkGenerationComplete}
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
