"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, ArrowRight, ArrowLeft, Check, Loader2 } from "lucide-react";
import { useCommunications } from "@/app/hooks/use-communications";
import { toast } from "react-hot-toast";

interface CampaignNameStepProps {
  selectedDonors: number[];
  campaignName: string;
  onCampaignNameChange: (campaignName: string) => void;
  onBack: () => void;
  onNext: () => void;
  sessionId?: number;
  onSessionIdChange?: (sessionId: number) => void;
  templateId?: number;
}

export function CampaignNameStep({
  selectedDonors,
  campaignName,
  onCampaignNameChange,
  onBack,
  onNext,
  sessionId,
  onSessionIdChange,
  templateId,
}: CampaignNameStepProps) {
  console.log("[CampaignNameStep] Component mounted/updated with props:", {
    selectedDonorsCount: selectedDonors?.length,
    campaignName,
    sessionId,
    templateId,
    hasOnSessionIdChange: !!onSessionIdChange,
  });

  const [localCampaignName, setLocalCampaignName] = useState(campaignName);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedName, setLastSavedName] = useState(campaignName);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { saveDraft } = useCommunications();
  console.log("[CampaignNameStep] saveDraft mutation available:", !!saveDraft);

  // Auto-save logic with debouncing
  useEffect(() => {
    console.log("[CampaignNameStep] Auto-save effect triggered", {
      localCampaignName,
      lastSavedName,
      sessionId,
      selectedDonorsCount: selectedDonors.length,
      templateId,
      isEmpty: !localCampaignName.trim(),
      isSame: localCampaignName === lastSavedName,
    });

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Don't auto-save if empty or same as last saved
    if (!localCampaignName.trim() || localCampaignName === lastSavedName) {
      console.log("[CampaignNameStep] Skipping auto-save - empty or unchanged");
      return;
    }

    console.log("[CampaignNameStep] Setting up auto-save timeout");

    // Set up new timeout for auto-save (1 second delay)
    saveTimeoutRef.current = setTimeout(async () => {
      console.log("[CampaignNameStep] Auto-save timeout fired, starting save");
      setIsSaving(true);
      try {
        const payload = {
          sessionId,
          campaignName: localCampaignName.trim(),
          selectedDonorIds: selectedDonors || [],
          templateId,
        };
        console.log("[CampaignNameStep] Calling saveDraft.mutateAsync with payload:", payload);

        // Extra validation
        if (!payload.selectedDonorIds || payload.selectedDonorIds.length === 0) {
          console.warn("[CampaignNameStep] Warning: selectedDonorIds is empty!");
        }

        const result = await saveDraft.mutateAsync(payload);

        console.log("[CampaignNameStep] saveDraft result:", result);

        // Update session ID if this was a new draft
        if (!sessionId && result.sessionId && onSessionIdChange) {
          console.log("[CampaignNameStep] Updating sessionId from", sessionId, "to", result.sessionId);
          onSessionIdChange(result.sessionId);
        }

        setLastSavedName(localCampaignName.trim());
        console.log("[CampaignNameStep] Auto-save successful, lastSavedName updated to:", localCampaignName.trim());
      } catch (error) {
        console.error("[CampaignNameStep] Failed to auto-save draft:", error);
        toast.error("Failed to save draft. Please try again.");
      } finally {
        setIsSaving(false);
      }
    }, 1000);

    // Cleanup on unmount
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [localCampaignName, selectedDonors, sessionId, templateId, lastSavedName, saveDraft, onSessionIdChange]);

  const handleNext = () => {
    if (!localCampaignName.trim()) {
      setError("Campaign name is required");
      return;
    }
    if (localCampaignName.trim().length > 255) {
      setError("Campaign name must be 255 characters or less");
      return;
    }

    setError("");
    onCampaignNameChange(localCampaignName.trim());
    onNext();
  };

  const handleCampaignNameChange = (value: string) => {
    console.log("[CampaignNameStep] handleCampaignNameChange called with:", value);
    setLocalCampaignName(value);
    if (error) {
      setError("");
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-medium">Name Your Campaign</h3>
        <p className="text-sm text-muted-foreground">Give your campaign a descriptive name for easy identification.</p>
      </div>

      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Selected Donors
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            <p className="text-sm font-medium">Total Donors Selected</p>
            <p className="text-2xl font-bold">{selectedDonors.length}</p>
            <p className="text-sm text-muted-foreground">
              You will be creating personalized emails for {selectedDonors.length} donor
              {selectedDonors.length !== 1 ? "s" : ""}.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Campaign Name Input */}
      <Card>
        <CardHeader>
          <CardTitle>Campaign Name</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="campaignName">Campaign Name</Label>
            <Input
              id="campaignName"
              placeholder="e.g., 'End of Year Appeal 2024'"
              value={localCampaignName}
              onChange={(e) => handleCampaignNameChange(e.target.value)}
              className={error ? "border-red-500" : ""}
              maxLength={255}
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{localCampaignName.length}/255 characters</p>
              {isSaving && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Saving...</span>
                </div>
              )}
              {!isSaving && lastSavedName === localCampaignName.trim() && localCampaignName.trim() !== "" && (
                <div className="flex items-center gap-1 text-sm text-green-600">
                  <Check className="h-3 w-3" />
                  <span>Saved</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Suggestions:</p>
            <div className="flex flex-wrap gap-2">
              {[
                "Holiday Thank You Campaign",
                "Q4 Donor Outreach",
                "New Donor Welcome Series",
                "Annual Report Follow-up",
                "Event Invitation Campaign",
              ].map((suggestion) => (
                <Button
                  key={suggestion}
                  variant="outline"
                  size="sm"
                  onClick={() => handleCampaignNameChange(suggestion)}
                  className="text-xs"
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button onClick={handleNext} disabled={!localCampaignName.trim()}>
          Continue
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
