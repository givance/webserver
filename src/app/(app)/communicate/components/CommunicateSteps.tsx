"use client";

import { useState } from "react";
import { SelectDonorsStep } from "../steps/SelectDonorsStep";
import { WriteInstructionStep } from "../steps/WriteInstructionStep";
import { GenerateEmailsStep } from "../steps/GenerateEmailsStep";
import { ReviewAndSendStep } from "../steps/ReviewAndSendStep";
import { GeneratedEmail } from "@/app/lib/utils/email-generator/types";
import { StepIndicator } from "@/components/ui/step-indicator";

const STEPS = ["Select Donors", "Write Instructions", "Generate Emails", "Review & Send"] as const;

interface CommunicateStepsProps {
  onClose: () => void;
}

export function CommunicateSteps({ onClose }: CommunicateStepsProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedDonors, setSelectedDonors] = useState<number[]>([]);
  const [instruction, setInstruction] = useState("");
  const [generatedEmails, setGeneratedEmails] = useState<GeneratedEmail[]>([]);

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

  const handleFinish = async () => {
    // TODO: Implement actual email sending logic
    console.log("Sending emails:", { selectedDonors, instruction, generatedEmails });
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
          <WriteInstructionStep
            instruction={instruction}
            onInstructionChange={setInstruction}
            onBack={handleBack}
            onNext={handleNext}
            selectedDonors={selectedDonors}
          />
        );
      case 2:
        return (
          <GenerateEmailsStep
            selectedDonors={selectedDonors}
            instruction={instruction}
            generatedEmails={generatedEmails}
            onEmailsGenerated={setGeneratedEmails}
            onBack={handleBack}
            onNext={handleNext}
          />
        );
      case 3:
        return <ReviewAndSendStep generatedEmails={generatedEmails} onBack={handleBack} onFinish={handleFinish} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full">
      <div className="w-48 border-r bg-muted/30 py-4 px-2">
        <StepIndicator steps={STEPS} currentStep={currentStep} orientation="vertical" className="mb-6" />
      </div>
      <div className="flex-1 p-4 overflow-hidden">{renderStep()}</div>
    </div>
  );
}
