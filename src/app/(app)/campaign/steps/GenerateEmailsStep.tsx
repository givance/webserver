"use client";

import { useDonors } from "@/app/hooks/use-donors";
import { useOrganization } from "@/app/hooks/use-organization";
import { formatDonorName } from "@/app/lib/utils/donor-name-formatter";
import { GeneratedEmail } from "@/app/lib/utils/email-generator/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState } from "react";
import { EmailDisplay } from "../components/EmailDisplay";

interface GenerateEmailsStepProps {
  selectedDonors: number[];
  instruction: string;
  generatedEmails: GeneratedEmail[];
  onEmailsGenerated: (emails: GeneratedEmail[]) => void;
  onBack: () => void;
  onNext: () => void;
}

export function GenerateEmailsStep({
  selectedDonors,
  instruction,
  generatedEmails,
  onEmailsGenerated,
  onBack,
  onNext,
}: GenerateEmailsStepProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [sampleEmails, setSampleEmails] = useState<GeneratedEmail[]>([]);
  const [selectedSampleIndex, setSelectedSampleIndex] = useState<number | null>(null);

  const { getDonorQuery } = useDonors();
  const { getOrganization } = useOrganization();

  // Pre-fetch donor data for all selected donors
  const donorQueries = selectedDonors.map((id) => getDonorQuery(id));
  const orgQuery = getOrganization();

  // Simulate AI email generation
  const generateSampleEmails = async () => {
    setIsGenerating(true);
    try {
      const samples = selectedDonors.slice(0, 3).map((donorId, index) => {
        const donor = donorQueries[index].data;
        const org = orgQuery.data;

        return {
          donorId,
          subject: `Thank you for supporting ${org?.name}`,
          structuredContent: [
            {
              piece: `Dear ${donor?.firstName},`,
              references: [],
              addNewlineAfter: true,
            },
            {
              piece: `Thank you for your support of ${org?.name}. [Sample AI generated content would go here]`,
              references: [],
              addNewlineAfter: true,
            },
            {
              piece: "Best regards,",
              references: [],
              addNewlineAfter: true,
            },
            {
              piece: `${org?.name} Team`,
              references: [],
              addNewlineAfter: false,
            },
          ],
          referenceContexts: {}, // Add empty referenceContexts for sample emails
          tokenUsage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          },
        };
      });

      setSampleEmails(samples);
      setSelectedSampleIndex(0);
    } catch (error) {
      console.error("Error generating emails:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefineEmail = async () => {
    if (selectedSampleIndex === null) return;

    setIsGenerating(true);
    try {
      // In a real implementation, this would call your OpenAI endpoint with the refinement prompt
      const refinedEmail = {
        ...sampleEmails[selectedSampleIndex],
        structuredContent: [
          ...sampleEmails[selectedSampleIndex].structuredContent.slice(0, -2),
          {
            piece: `[This would be the AI-refined content based on prompt: ${aiPrompt}]`,
            references: [],
            addNewlineAfter: true,
          },
          ...sampleEmails[selectedSampleIndex].structuredContent.slice(-2),
        ],
      };

      const updatedSamples = [...sampleEmails];
      updatedSamples[selectedSampleIndex] = refinedEmail;

      setSampleEmails(updatedSamples);
      setAiPrompt("");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleNext = async () => {
    setIsGenerating(true);
    try {
      // In a real implementation, this would generate emails for all donors
      // using the preferred sample as a template
      const allEmails = selectedDonors.map((donorId, index) => {
        const donor = donorQueries[index].data;
        const org = orgQuery.data;

        return {
          donorId,
          subject: `Thank you for supporting ${org?.name}`,
          structuredContent: [
            {
              piece: `Dear ${donor?.firstName},`,
              references: [],
              addNewlineAfter: true,
            },
            {
              piece: `Thank you for your support of ${org?.name}. [AI generated content would go here]`,
              references: [],
              addNewlineAfter: true,
            },
            {
              piece: "Best regards,",
              references: [],
              addNewlineAfter: true,
            },
            {
              piece: `${org?.name} Team`,
              references: [],
              addNewlineAfter: false,
            },
          ],
          referenceContexts: {}, // Add empty referenceContexts as this is a placeholder implementation
          tokenUsage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          },
        };
      });

      onEmailsGenerated(allEmails);
      onNext();
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-lg font-medium">Generate and Refine Emails</h3>
        <p className="text-sm text-muted-foreground">
          First, we&apos;ll generate 5 sample emails. You can then refine them using AI until you&apos;re satisfied with
          the result.
        </p>
      </div>

      {sampleEmails.length === 0 ? (
        <Button onClick={generateSampleEmails} disabled={isGenerating}>
          {isGenerating ? "Generating..." : "Generate Sample Emails"}
        </Button>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h4 className="text-sm font-medium mb-2">Sample Emails</h4>
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {sampleEmails.map((email, index) => {
                  const donor = donorQueries[index].data;
                  if (!donor) return null;

                  return (
                    <div
                      key={email.donorId}
                      className={`cursor-pointer ${
                        selectedSampleIndex === index ? "ring-2 ring-primary rounded-lg" : ""
                      }`}
                      onClick={() => setSelectedSampleIndex(index)}
                    >
                      <EmailDisplay
                        donorName={formatDonorName(donor)}
                        donorEmail={donor.email}
                        subject={email.subject}
                        content={email.structuredContent}
                        referenceContexts={{}}
                        showSendButton={false}
                      />
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-medium">Refine Selected Email</h4>
            <div className="space-y-2">
              <Input
                placeholder="Enter instructions to refine the selected email..."
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
              />
              <Button
                onClick={handleRefineEmail}
                disabled={isGenerating || !aiPrompt.trim() || selectedSampleIndex === null}
              >
                {isGenerating ? "Refining..." : "Refine with AI"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center pt-4">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={handleNext} disabled={isGenerating || sampleEmails.length === 0}>
          Generate All Emails
        </Button>
      </div>
    </div>
  );
}
