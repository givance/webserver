"use client";

import { useState } from "react";
import { SelectDonorsStep } from "../steps/SelectDonorsStep";
import { WriteInstructionStep } from "../steps/WriteInstructionStep";
import { GenerateEmailsStep } from "../steps/GenerateEmailsStep";
import { ReviewAndSendStep } from "../steps/ReviewAndSendStep";
import { StepIndicator } from "@/components/ui/step-indicator";

const STEPS = ["Select Donors", "Write Instructions", "Generate Emails", "Review & Send"] as const;

interface CommunicateStepsProps {
  onClose: () => void;
}

export function CommunicateSteps({ onClose }: CommunicateStepsProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedDonors, setSelectedDonors] = useState<number[]>([]);
  const [instruction, setInstruction] = useState("");
  const [generatedEmails, setGeneratedEmails] = useState<Array<{ donorId: number; content: string }>>([]);

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
    <div className="flex flex-col h-full">
      <div className="mb-8">
        <StepIndicator steps={STEPS} currentStep={currentStep} className="mb-6" />
        <h1 className="text-2xl font-bold">{STEPS[currentStep]}</h1>
      </div>
      <div className="flex-1">{renderStep()}</div>
    </div>
  );
}
