"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useOrganization } from "@/app/hooks/use-organization";
import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export function DonorJourneySettings() {
  const { getDonorJourneyText, updateDonorJourneyText, processDonorJourney } = useOrganization();
  const { data: donorJourneyText, isLoading } = getDonorJourneyText();
  const [text, setText] = useState("");

  // Update text when donor journey text is loaded
  useEffect(() => {
    if (donorJourneyText) {
      setText(donorJourneyText);
    }
  }, [donorJourneyText]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
  };

  const handleSave = async () => {
    try {
      await updateDonorJourneyText(text);
      toast.success("Donor journey text saved successfully");
    } catch (error) {
      toast.error("Failed to save donor journey text");
    }
  };

  const handleGenerate = async () => {
    if (!text) {
      toast.error("Please enter donor journey text first");
      return;
    }

    try {
      await processDonorJourney(text);
      toast.success("Donor journey processed successfully");
    } catch (error) {
      console.error("Failed to process donor journey:", error);
      toast.error("Failed to process donor journey");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Donor Journey</CardTitle>
          <CardDescription>
            Describe your organization&apos;s donor journey. This will be used to generate a graph visualization of the
            journey.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <label htmlFor="donorJourneyText">Donor Journey Description</label>
              <Textarea
                id="donorJourneyText"
                value={text}
                onChange={handleTextChange}
                placeholder="Describe your organization's donor journey..."
                rows={8}
              />
            </div>
          </div>
          <div className="flex justify-end space-x-2">
            <Button onClick={handleSave} variant="outline">
              Save Text
            </Button>
            <Button onClick={handleGenerate}>Generate Graph</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
