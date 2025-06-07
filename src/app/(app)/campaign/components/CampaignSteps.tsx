"use client";

import { StepIndicator } from "@/components/ui/step-indicator";
import { useRouter } from "next/navigation";
import { useState, useCallback } from "react";
import { JobNameStep } from "../steps/JobNameStep";
import { SelectDonorsStep } from "../steps/SelectDonorsStep";
import { SelectTemplateStep } from "../steps/SelectTemplateStep";
import { WriteInstructionStep } from "../steps/WriteInstructionStep";

const STEPS = ["Select Donors", "Job Name", "Select Template", "Write Instructions"] as const;

interface CampaignStepsProps {
  onClose: () => void;
}

export function CampaignSteps({ onClose }: CampaignStepsProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedDonors, setSelectedDonors] = useState<number[]>([]);
  const [jobName, setJobName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
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

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleTemplateSelected = (templateId: number | null, prompt?: string) => {
    setSelectedTemplateId(templateId);
    setTemplatePrompt(prompt || "");
    // If a template is selected, pre-populate the instruction
    if (prompt) {
      setInstruction(prompt);
    }
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
    // Navigate to communication jobs page
    router.push(`/communication-jobs`);
    onClose();
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <SelectDonorsStep selectedDonors={selectedDonors} onDonorsSelected={setSelectedDonors} onNext={handleNext} />
        );
      case 1:
        return (
          <JobNameStep
            selectedDonors={selectedDonors}
            jobName={jobName}
            onJobNameChange={setJobName}
            onBack={handleBack}
            onNext={handleNext}
          />
        );
      case 2:
        return (
          <SelectTemplateStep
            selectedTemplateId={selectedTemplateId || undefined}
            onTemplateSelected={handleTemplateSelected}
            onBack={handleBack}
            onNext={handleNext}
          />
        );
      case 3:
        return (
          <WriteInstructionStep
            instruction={instruction}
            onInstructionChange={setInstruction}
            onBack={handleBack}
            onNext={handleNext}
            selectedDonors={selectedDonors}
            onSessionDataChange={handleSessionDataChange}
            templatePrompt={templatePrompt}
            initialChatHistory={persistedChatHistory}
            initialGeneratedEmails={persistedGeneratedEmails}
            initialReferenceContexts={persistedReferenceContexts}
            initialPreviewDonorIds={persistedPreviewDonorIds}
            jobName={jobName}
            templateId={selectedTemplateId || undefined}
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
        <StepIndicator steps={STEPS} currentStep={currentStep} orientation="vertical" className="mb-6" />
      </div>
      <div className="flex-1 px-6 py-4 overflow-auto">{renderStep()}</div>
    </div>
  );
}
