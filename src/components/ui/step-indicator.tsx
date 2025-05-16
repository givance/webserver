import * as React from "react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface StepIndicatorProps {
  steps: readonly string[];
  currentStep: number;
  className?: string;
}

export function StepIndicator({ steps, currentStep, className }: StepIndicatorProps) {
  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex justify-between text-sm">
        {steps.map((step, index) => (
          <div
            key={step}
            className={cn(
              "flex items-center gap-2",
              index === currentStep ? "text-primary font-medium" : "text-muted-foreground"
            )}
          >
            <div
              className={cn(
                "flex items-center justify-center w-6 h-6 rounded-full border text-xs",
                index === currentStep
                  ? "border-primary bg-primary text-primary-foreground"
                  : index < currentStep
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-muted-foreground"
              )}
            >
              {index + 1}
            </div>
            <span>{step}</span>
          </div>
        ))}
      </div>
      <Progress value={progress} className="h-1" />
    </div>
  );
}
