"use client";

import { useState } from "react";
import { SelectDonorsStep } from "../steps/SelectDonorsStep";
import { JobNameStep } from "../steps/JobNameStep";
import { SelectTemplateStep } from "../steps/SelectTemplateStep";
import { WriteInstructionStep } from "../steps/WriteInstructionStep";
import { BulkGenerateEmailsStep } from "../steps/BulkGenerateEmailsStep";
import { GeneratedEmail } from "@/app/lib/utils/email-generator/types";
import { StepIndicator } from "@/components/ui/step-indicator";
import { useRouter } from "next/navigation";

const STEPS = ["Select Donors", "Job Name", "Select Template", "Write Instructions", "Bulk Generation"] as const;

interface CommunicateStepsProps {
  onClose: () => void;
}

export function CommunicateSteps({ onClose }: CommunicateStepsProps) {
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

  const handleBulkGenerationComplete = (sessionId: number) => {
    // Navigate to results page
    router.push(`/communicate/results/${sessionId}`);
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
            onSessionDataChange={setSessionData}
            templatePrompt={templatePrompt}
          />
        );
      case 4:
        return sessionData ? (
          <BulkGenerateEmailsStep
            selectedDonors={selectedDonors}
            jobName={jobName}
            sessionData={sessionData}
            templateId={selectedTemplateId || undefined}
            onBack={handleBack}
            onComplete={handleBulkGenerationComplete}
          />
        ) : null;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full">
      <div className="w-48 border-r bg-muted/30 py-4 px-2">
        <StepIndicator steps={STEPS} currentStep={currentStep} orientation="vertical" className="mb-6" />
      </div>
      <div className="flex-1 p-4 overflow-auto">{renderStep()}</div>
    </div>
  );
}
