import * as React from "react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface StepIndicatorProps {
  steps: readonly string[];
  currentStep: number;
  className?: string;
  orientation?: "horizontal" | "vertical";
  showOnlyNumbers?: boolean;
}

export function StepIndicator({
  steps,
  currentStep,
  className,
  orientation = "horizontal",
  showOnlyNumbers = false,
}: StepIndicatorProps) {
  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className={cn("flex gap-2", orientation === "vertical" ? "flex-col" : "items-center", className)}>
      {steps.map((step, index) => {
        const isActive = index === currentStep;
        const isCompleted = index < currentStep;

        return (
          <div key={step} className={cn("flex items-center gap-2", orientation === "vertical" ? "w-full" : "flex-1")}>
            <div
              className={cn(
                "flex items-center justify-center rounded-full w-6 h-6 text-xs font-medium transition-colors",
                isActive && "bg-primary text-primary-foreground",
                isCompleted && "bg-primary/80 text-primary-foreground",
                !isActive && !isCompleted && "bg-muted text-muted-foreground"
              )}
            >
              {index + 1}
            </div>
            {!showOnlyNumbers && (
              <span
                className={cn(
                  "text-sm font-medium transition-colors",
                  isActive && "text-foreground",
                  !isActive && "text-muted-foreground"
                )}
              >
                {step}
              </span>
            )}
            {index < steps.length - 1 && !showOnlyNumbers && (
              <div
                className={cn(
                  "flex-1 transition-colors",
                  orientation === "vertical" ? "hidden" : "block h-[1px]",
                  isCompleted ? "bg-primary/80" : "bg-border"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
