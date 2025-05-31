"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Clock, AlertCircle, Users, Mail } from "lucide-react";
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

interface GenerationStatus {
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  totalDonors: number;
  completedDonors: number;
  sessionId?: number;
  errorMessage?: string;
}

export function BulkGenerateEmailsStep({
  selectedDonors,
  jobName,
  sessionData,
  templateId,
  onBack,
  onComplete,
}: BulkGenerateEmailsStepProps) {
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>({
    status: "PENDING",
    totalDonors: selectedDonors.length,
    completedDonors: 0,
  });
  const [isStarting, setIsStarting] = useState(false);
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);
  const { userId } = useAuth();
  const { createSession, getSessionStatus } = useCommunications();

  const progressPercentage =
    generationStatus.totalDonors > 0 ? (generationStatus.completedDonors / generationStatus.totalDonors) * 100 : 0;

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

      setGenerationStatus((prev) => ({
        ...prev,
        status: "IN_PROGRESS",
        sessionId: result.sessionId,
      }));

      // Start polling for status updates
      startStatusPolling(result.sessionId);

      toast.success("Bulk email generation started!");
    } catch (error) {
      console.error("Error starting bulk generation:", error);
      toast.error("Failed to start bulk generation");
      setGenerationStatus((prev) => ({
        ...prev,
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      }));
    } finally {
      setIsStarting(false);
    }
  };

  const startStatusPolling = (sessionId: number) => {
    const interval = setInterval(async () => {
      try {
        // Call API to get status
        const statusResult = await getSessionStatus({ sessionId });

        if (statusResult?.data) {
          setGenerationStatus((prev) => ({
            ...prev,
            status: statusResult.data.status as "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED",
            completedDonors: statusResult.data.completedDonors || 0,
            errorMessage: statusResult.data.errorMessage || undefined,
          }));

          if (statusResult.data.status === "COMPLETED") {
            clearInterval(interval);
            setPollInterval(null);
            toast.success("All emails generated successfully!");
            setTimeout(() => onComplete(sessionId), 1000);
          } else if (statusResult.data.status === "FAILED") {
            clearInterval(interval);
            setPollInterval(null);
            toast.error("Email generation failed");
          }
        }
      } catch (error) {
        console.error("Error polling status:", error);
        clearInterval(interval);
        setPollInterval(null);
        setGenerationStatus((prev) => ({
          ...prev,
          status: "FAILED",
          errorMessage: "Failed to get status updates",
        }));
      }
    }, 2000);

    setPollInterval(interval);
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [pollInterval]);

  const getStatusIcon = () => {
    switch (generationStatus.status) {
      case "PENDING":
        return <Clock className="h-5 w-5 text-muted-foreground" />;
      case "IN_PROGRESS":
        return <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />;
      case "COMPLETED":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "FAILED":
        return <AlertCircle className="h-5 w-5 text-red-500" />;
    }
  };

  const getStatusText = () => {
    switch (generationStatus.status) {
      case "PENDING":
        return "Ready to start bulk generation";
      case "IN_PROGRESS":
        return "Generating emails...";
      case "COMPLETED":
        return "All emails generated successfully!";
      case "FAILED":
        return `Generation failed: ${generationStatus.errorMessage}`;
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
            Generation Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            {getStatusIcon()}
            <span className="text-sm font-medium">{getStatusText()}</span>
          </div>

          {generationStatus.status === "IN_PROGRESS" && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress</span>
                <span>
                  {generationStatus.completedDonors} / {generationStatus.totalDonors}
                </span>
              </div>
              <Progress value={progressPercentage} className="w-full" />
            </div>
          )}

          {generationStatus.status === "COMPLETED" && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-800">
                All emails have been generated and saved. You&apos;ll be redirected to view the results shortly.
              </p>
            </div>
          )}

          {generationStatus.status === "FAILED" && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{generationStatus.errorMessage}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-between items-center pt-4">
        <Button variant="outline" onClick={onBack} disabled={generationStatus.status === "IN_PROGRESS"}>
          Back
        </Button>

        {generationStatus.status === "PENDING" && (
          <Button onClick={handleStartGeneration} disabled={isStarting}>
            {isStarting ? "Starting..." : "Start Bulk Generation"}
          </Button>
        )}

        {generationStatus.status === "FAILED" && (
          <Button onClick={handleStartGeneration} disabled={isStarting}>
            {isStarting ? "Retrying..." : "Retry Generation"}
          </Button>
        )}
      </div>
    </div>
  );
}
