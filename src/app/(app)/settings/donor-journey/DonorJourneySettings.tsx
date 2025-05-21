"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useOrganization } from "@/app/hooks/use-organization";
import { Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ReactFlowProvider } from "reactflow";
import "reactflow/dist/style.css";
import { DonorJourneyGraph } from "./DonorJourneyGraph";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export function DonorJourneySettings() {
  const { getDonorJourneyText, updateDonorJourneyText, processDonorJourney, getDonorJourney } = useOrganization();
  const { data: donorJourneyText, isLoading: isLoadingText } = getDonorJourneyText();
  const { data: donorJourney, isLoading: isLoadingJourney } = getDonorJourney();

  const [text, setText] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isSavingText, setIsSavingText] = useState(false);
  const [isProcessingJourney, setIsProcessingJourney] = useState(false);

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
    setIsSavingText(true);
    try {
      await updateDonorJourneyText(text);
      toast.success("Donor journey text saved successfully");
    } catch (error) {
      toast.error("Failed to save donor journey text");
    } finally {
      setIsSavingText(false);
    }
  };

  const handleGenerate = async () => {
    if (!text) {
      toast.error("Please enter donor journey text first");
      return;
    }
    setIsProcessingJourney(true);
    try {
      await processDonorJourney(text);
      toast.success("Donor journey processed successfully");
    } catch (error) {
      console.error("Failed to process donor journey:", error);
      toast.error("Failed to process donor journey");
    } finally {
      setIsProcessingJourney(false);
    }
  };

  const isLoading = isLoadingText || isLoadingJourney;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  // Get preview text (first 150 characters)
  const previewText = text.length > 150 ? text.slice(0, 150) + "..." : text;

  return (
    <div className="space-y-6">
      {donorJourney && donorJourney.nodes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Journey Visualization</CardTitle>
            <CardDescription>
              Visual representation of your donor journey. Drag nodes to rearrange them or use the layout controls.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReactFlowProvider>
              <DonorJourneyGraph journey={donorJourney} />
            </ReactFlowProvider>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Donor Journey Description</CardTitle>
          <CardDescription>
            Describe your organization&apos;s donor journey. This will be used to generate a graph visualization.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {isOpen ? "Full Description" : previewText || "No description provided"}
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="mt-4">
              <Textarea
                id="donorJourneyText"
                value={text}
                onChange={handleTextChange}
                placeholder="Describe your organization's donor journey..."
                rows={8}
              />
            </CollapsibleContent>
          </Collapsible>
          <div className="flex justify-end space-x-2">
            <Button onClick={handleSave} variant="outline" disabled={isSavingText || isProcessingJourney}>
              {isSavingText && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Text
            </Button>
            <Button onClick={handleGenerate} disabled={isProcessingJourney || isSavingText || !text}>
              {isProcessingJourney && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Generate Graph
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
