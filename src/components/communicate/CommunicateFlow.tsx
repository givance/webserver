import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, ChevronRight } from "lucide-react";
import { useState } from "react";
import { SelectDonorsStep } from "@/app/(app)/communicate/steps/SelectDonorsStep";
import { ComposeMessageStep } from "@/app/(app)/communicate/steps/ComposeMessageStep";
import { ReviewAndSendStep } from "@/app/(app)/communicate/steps/ReviewAndSendStep";
import { useDonors } from "@/app/hooks/use-donors";

const STEPS = [
  { id: 1, title: "Select Donors" },
  { id: 2, title: "Compose Message" },
  { id: 3, title: "Review & Send" },
] as const;

interface CommunicateFlowProps {
  onClose: () => void;
}

export function CommunicateFlow({ onClose }: CommunicateFlowProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedDonors, setSelectedDonors] = useState<number[]>([]);
  const [messageContent, setMessageContent] = useState("");
  const [subject, setSubject] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { listDonors } = useDonors();
  const { data: donorsData, isLoading: isDonorsLoading } = listDonors({
    limit: 100, // Increase limit to show more donors
  });

  const handleNext = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSend = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // TODO: Implement send functionality
      // Example:
      // await sendMessages({
      //   donors: selectedDonors,
      //   subject,
      //   content: messageContent,
      // });

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send messages");
    } finally {
      setIsLoading(false);
    }
  };

  if (error) {
    return (
      <div className="text-red-500 p-4 text-center">
        <p>{error}</p>
        <Button variant="outline" onClick={() => setError(null)} className="mt-2">
          Try Again
        </Button>
      </div>
    );
  }

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <SelectDonorsStep selectedDonors={selectedDonors} onDonorsSelected={setSelectedDonors} onNext={handleNext} />
        );
      case 2:
        return (
          <ComposeMessageStep
            content={messageContent}
            onChange={setMessageContent}
            subject={subject}
            onSubjectChange={setSubject}
            onBack={handleBack}
            onNext={handleNext}
          />
        );
      case 3:
        return (
          <ReviewAndSendStep
            generatedEmails={selectedDonors.map((donorId) => ({
              donorId,
              content: messageContent.replace("[Donor Name]", ""), // This will be replaced with actual donor name in the component
            }))}
            onBack={handleBack}
            onFinish={handleSend}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Step Indicator */}
      <div className="flex justify-between">
        {STEPS.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <div
              className={`flex items-center justify-center w-8 h-8 rounded-full border-2 
                ${
                  currentStep > step.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : currentStep === step.id
                    ? "border-primary text-primary"
                    : "border-muted-foreground text-muted-foreground"
                }`}
            >
              {currentStep > step.id ? <Check className="w-4 h-4" /> : step.id}
            </div>
            <span className={`ml-2 ${currentStep >= step.id ? "text-foreground" : "text-muted-foreground"}`}>
              {step.title}
            </span>
            {index < STEPS.length - 1 && (
              <ChevronRight
                className={`w-4 h-4 mx-2 ${currentStep > step.id ? "text-primary" : "text-muted-foreground"}`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Current Step Content */}
      <Card className="p-6">{renderCurrentStep()}</Card>

      {/* Navigation Buttons */}
      <div className="flex justify-between">
        {currentStep > 1 && (
          <Button variant="outline" onClick={handleBack}>
            Back
          </Button>
        )}
        {currentStep < STEPS.length ? (
          <Button
            onClick={handleNext}
            disabled={
              (currentStep === 1 && selectedDonors.length === 0) ||
              (currentStep === 2 && (!subject.trim() || !messageContent.trim()))
            }
            className="ml-auto"
          >
            Next
          </Button>
        ) : (
          <Button onClick={handleSend} disabled={isLoading} className="ml-auto">
            {isLoading ? "Sending..." : "Send Messages"}
          </Button>
        )}
      </div>
    </div>
  );
}
