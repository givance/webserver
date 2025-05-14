"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface WriteInstructionStepProps {
  instruction: string;
  onInstructionChange: (instruction: string) => void;
  onBack: () => void;
  onNext: () => void;
}

export function WriteInstructionStep({ instruction, onInstructionChange, onBack, onNext }: WriteInstructionStepProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-lg font-medium">Write Email Instructions</h3>
        <p className="text-sm text-muted-foreground">
          Describe how you want the emails to be written. Include any specific tone, style, or content requirements. The
          AI will use this instruction along with donor information to generate personalized emails.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="instruction" className="text-sm font-medium">
          Instructions
        </label>
        <Textarea
          id="instruction"
          value={instruction}
          onChange={(e) => onInstructionChange(e.target.value)}
          placeholder="Example: Write a friendly email thanking the donor for their past support and updating them about our recent project achievements. Keep it personal and mention their specific contribution if available."
          className="min-h-[200px]"
        />
      </div>

      <div className="flex justify-between items-center pt-4">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext} disabled={!instruction.trim()}>
          Next
        </Button>
      </div>
    </div>
  );
}
