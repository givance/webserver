"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Mail } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@clerk/nextjs";
import { useCommunications } from "@/app/hooks/use-communications";

interface BulkGenerateEmailsStepProps {
  selectedDonors: number[];
  jobName: string;
  sessionData: {
    chatHistory: Array<{ role: "user" | "assistant"; content: string }>;
    finalInstruction: string;
    previewDonorIds: number[];
  };
  templateId?: number;
  onBack: () => void;
  onComplete: (sessionId: number) => void;
}

export function BulkGenerateEmailsStep({
  selectedDonors,
  jobName,
  sessionData,
  templateId,
  onBack,
  onComplete,
}: BulkGenerateEmailsStepProps) {
  const [isStarting, setIsStarting] = useState(false);
  const { userId } = useAuth();
  const { createSession } = useCommunications();

  const handleStartGeneration = async () => {
    if (!userId) {
      toast.error("User not authenticated");
      return;
    }

    setIsStarting(true);
    try {
      // Call API to start bulk generation
      const result = await createSession({
        jobName: jobName,
        instruction: sessionData.finalInstruction,
        chatHistory: sessionData.chatHistory,
        selectedDonorIds: selectedDonors,
        previewDonorIds: sessionData.previewDonorIds,
        refinedInstruction: sessionData.finalInstruction,
        templateId: templateId,
      });

      if (!result?.sessionId) {
        throw new Error("Failed to create session");
      }

      toast.success("Bulk email generation started! Redirecting to communication jobs...");

      // Redirect immediately after starting the generation
      setTimeout(() => {
        onComplete(result.sessionId);
      }, 1000);
    } catch (error) {
      console.error("Error starting bulk generation:", error);
      toast.error("Failed to start bulk generation");
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-medium">Bulk Email Generation</h3>
        <p className="text-sm text-muted-foreground">
          Generate personalized emails for all {selectedDonors.length} selected donors using your refined instruction.
        </p>
      </div>

      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Generation Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">Total Donors</p>
              <p className="text-2xl font-bold">{selectedDonors.length}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Preview Donors</p>
              <p className="text-2xl font-bold">{sessionData.previewDonorIds.length}</p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Final Instruction</p>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm">{sessionData.finalInstruction}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Ready to Generate
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              Click &quot;Start Bulk Generation&quot; to begin generating personalized emails for all selected donors.
              You&apos;ll be redirected to the communication jobs page where you can monitor the progress.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-between items-center pt-4">
        <Button variant="outline" onClick={onBack} disabled={isStarting}>
          Back
        </Button>

        <Button onClick={handleStartGeneration} disabled={isStarting}>
          {isStarting ? "Starting..." : "Start Bulk Generation"}
        </Button>
      </div>
    </div>
  );
}
