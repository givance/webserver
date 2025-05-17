"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect, useMemo } from "react";
import { useDonors } from "@/app/hooks/use-donors";
import { useOrganization } from "@/app/hooks/use-organization";
import { useCommunications } from "@/app/hooks/use-communications";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmailDisplay } from "../components/EmailDisplay";
import { toast } from "sonner";
import { useDonations } from "@/app/hooks/use-donations";
import type { DonationWithDetails } from "@/app/lib/data/donations";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { SuggestedMemories } from "../components/SuggestedMemories";

interface WriteInstructionStepProps {
  instruction: string;
  onInstructionChange: (instruction: string) => void;
  onBack: () => void;
  onNext: () => void;
  selectedDonors: number[];
}

interface GeneratedEmail {
  donorId: number;
  subject: string;
  structuredContent: Array<{
    piece: string;
    references: string[];
    addNewlineAfter: boolean;
  }>;
  referenceContexts: Record<string, string>;
}

interface ThreadMessage {
  id: number;
  content: string;
  datetime: Date;
  threadId: number;
}

interface ReferenceContext {
  [key: string]: {
    content: string;
    type: "donation" | "communication" | "summary";
    datetime?: string;
  };
}

interface GenerateEmailsResponse {
  emails: GeneratedEmail[];
  refinedInstruction: string;
  suggestedMemories?: string[];
}

export function WriteInstructionStep({
  instruction,
  onInstructionChange,
  onBack,
  onNext,
  selectedDonors,
}: WriteInstructionStepProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [generatedEmails, setGeneratedEmails] = useState<GeneratedEmail[]>([]);
  const [communicationHistory, setCommunicationHistory] = useState<
    Record<number, { content: string; datetime: string }[]>
  >({});
  const [donationHistory, setDonationHistory] = useState<Record<number, DonationWithDetails[]>>({});
  const [referenceContexts, setReferenceContexts] = useState<Record<number, Record<string, string>>>({});
  const [previousInstruction, setPreviousInstruction] = useState<string | undefined>();
  const [suggestedMemories, setSuggestedMemories] = useState<string[]>([]);

  const { getDonorQuery } = useDonors();
  const { getOrganization } = useOrganization();
  const { getThread, listThreads, generateEmails, isGeneratingEmails } = useCommunications();
  const { list: listDonations } = useDonations();

  // Pre-fetch donor data for all selected donors
  const donorQueries = selectedDonors.map((id) => getDonorQuery(id));
  const orgQuery = getOrganization();

  // Query threads for all selected donors
  const threadsQuery = listThreads(
    {
      donorId: selectedDonors[0], // We'll handle multiple donors in the effect
      includeDonors: true,
      includeLatestMessage: true,
      limit: selectedDonors.length * 10, // Increase limit to accommodate all donors
    },
    {
      enabled: selectedDonors.length > 0,
    }
  );

  // Query donations for all selected donors
  const donationsQuery = listDonations(
    {
      donorId: selectedDonors[0], // We'll handle multiple donors in the effect
      includeProject: true,
      limit: selectedDonors.length * 30, // Increase limit to accommodate all donors
    },
    {
      enabled: selectedDonors.length > 0,
    }
  );

  // Process thread data when queries complete
  useEffect(() => {
    const fetchCommunicationHistory = async () => {
      const history: Record<number, { content: string; datetime: string }[]> = {};

      if (threadsQuery.data?.threads) {
        for (const thread of threadsQuery.data.threads) {
          const donorId = thread.donors?.[0]?.donorId;
          if (!donorId) continue;

          if (!history[donorId]) {
            history[donorId] = [];
          }

          const threadData = await getThread({
            id: thread.id,
            includeMessages: true,
          });

          if (threadData.data?.content) {
            history[donorId].push(
              ...threadData.data.content.map((msg) => ({
                content: msg.content,
                datetime: new Date(msg.datetime).toISOString(),
              }))
            );
          }
        }
      }

      setCommunicationHistory(history);
    };

    fetchCommunicationHistory();
  }, [selectedDonors, threadsQuery.data, getThread]);

  // Process donation data when queries complete
  useEffect(() => {
    const fetchDonationHistory = async () => {
      const history: Record<number, DonationWithDetails[]> = {};

      if (donationsQuery.data?.donations) {
        for (const donation of donationsQuery.data.donations) {
          const donorId = donation.donorId;
          if (!history[donorId]) {
            history[donorId] = [];
          }

          history[donorId].push({
            ...donation,
            date: new Date(donation.date),
            createdAt: new Date(donation.createdAt),
            updatedAt: new Date(donation.updatedAt),
            donor: donation.donor
              ? {
                  ...donation.donor,
                  createdAt: new Date(donation.donor.createdAt),
                  updatedAt: new Date(donation.donor.updatedAt),
                }
              : undefined,
            project: donation.project
              ? {
                  ...donation.project,
                  createdAt: new Date(donation.project.createdAt),
                  updatedAt: new Date(donation.project.updatedAt),
                }
              : undefined,
          });
        }
      }

      setDonationHistory(history);
    };

    fetchDonationHistory();
  }, [selectedDonors, donationsQuery.data]);

  const handleSubmitInstruction = async () => {
    if (!instruction.trim()) return;

    setIsGenerating(true);
    // Clear existing emails, contexts, and memories when generating new ones
    setGeneratedEmails([]);
    setReferenceContexts({});
    setSuggestedMemories([]);
    setChatMessages((prev) => [...prev, { role: "user", content: instruction }]);

    try {
      // Prepare donor data for the API call
      const donorData = selectedDonors.map((donorId) => {
        const donor = donorQueries.find((q) => q.data?.id === donorId)?.data;
        if (!donor) throw new Error(`Donor data not found for ID: ${donorId}`);

        // Transform donation history to match expected format
        const transformedDonationHistory = (donationHistory[donorId] || []).map((d, index) => ({
          id: `donation-${index + 1}`,
          amount: d.amount,
          date: d.date,
          project: d.project
            ? {
                id: d.project.id,
                name: d.project.name,
                description: d.project.description || null,
                goal: d.project.goal || null,
                status: d.project.active ? "active" : "inactive",
              }
            : null,
        }));

        return {
          id: donor.id,
          firstName: donor.firstName,
          lastName: donor.lastName,
          email: donor.email,
          history: communicationHistory[donorId] || [],
          donationHistory: transformedDonationHistory,
        };
      });

      const org = orgQuery.data;
      if (!org) throw new Error("Organization data not found");

      // Generate emails using the hook
      const result = await generateEmails({
        instruction,
        donors: donorData,
        organizationName: org.name,
        organizationWritingInstructions: org.writingInstructions ?? undefined,
        previousInstruction,
      });

      if (result) {
        const typedResult = result as GenerateEmailsResponse;
        setGeneratedEmails(typedResult.emails);
        setPreviousInstruction(typedResult.refinedInstruction);
        setSuggestedMemories(typedResult.suggestedMemories || []);
        setReferenceContexts(
          typedResult.emails.reduce<Record<number, Record<string, string>>>((acc, email) => {
            acc[email.donorId] = email.referenceContexts;
            return acc;
          }, {})
        );

        setChatMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "I've generated personalized emails based on each donor's communication history and your organization's writing instructions. You can review them on the left side. Let me know if you'd like any adjustments to the tone, content, or style.",
          },
        ]);
      } else {
        throw new Error("Failed to generate emails");
      }
    } catch (error) {
      console.error("Error generating emails:", error);
      toast.error("Failed to generate emails. Please try again.");
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I apologize, but I encountered an error while generating the emails. Please try again.",
        },
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-4 h-full">
      {/* Left side: Generated Emails with Vertical Tabs */}
      <div className="flex flex-col h-full">
        <h3 className="text-lg font-medium mb-4">Generated Emails</h3>
        {generatedEmails.length > 0 ? (
          <Tabs defaultValue={generatedEmails[0]?.donorId?.toString()} orientation="vertical" className="flex-1">
            <div className="grid grid-cols-[220px_1fr] h-full border rounded-lg overflow-hidden">
              <div className="bg-muted/30 overflow-y-auto">
                <TabsList className="flex flex-col w-full space-y-1 p-2">
                  {generatedEmails.map((email) => {
                    const donor = donorQueries.find((q) => q.data?.id === email.donorId)?.data;
                    if (!donor) return null;

                    return (
                      <TabsTrigger
                        key={email.donorId}
                        value={email.donorId.toString()}
                        className={cn(
                          "w-full h-[80px] p-4 rounded-lg",
                          "flex flex-col items-start justify-center gap-1",
                          "text-left",
                          "transition-all duration-200",
                          "mr-2"
                        )}
                      >
                        <span className="font-medium truncate w-full">
                          {donor.firstName} {donor.lastName}
                        </span>
                        <span className="text-sm text-muted-foreground data-[state=active]:text-white/70 truncate w-full">
                          {donor.email}
                        </span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </div>

              <div className="flex flex-col">
                {generatedEmails.map((email) => {
                  const donor = donorQueries.find((q) => q.data?.id === email.donorId)?.data;
                  if (!donor) return null;

                  return (
                    <TabsContent
                      key={email.donorId}
                      value={email.donorId.toString()}
                      className="flex-1 m-0 data-[state=active]:flex flex-col h-full"
                    >
                      <ScrollArea className="flex-1 p-4">
                        <EmailDisplay
                          donorName={`${donor.firstName} ${donor.lastName}`}
                          donorEmail={donor.email}
                          subject={email.subject}
                          content={email.structuredContent}
                          referenceContexts={referenceContexts[email.donorId] || {}}
                        />
                      </ScrollArea>
                    </TabsContent>
                  );
                })}
              </div>
            </div>
          </Tabs>
        ) : (
          <div className="flex items-center justify-center flex-1 text-muted-foreground border rounded-lg">
            No emails generated yet
          </div>
        )}
      </div>

      {/* Right side: Chat Interface */}
      <div className="flex flex-col h-full">
        <h3 className="text-lg font-medium mb-4">Chat Interface</h3>
        <div className="flex flex-col flex-1 border rounded-lg overflow-hidden">
          {/* Chat Messages */}
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              {/* System message in gray box */}
              <div className="bg-[#18181B] text-white rounded-lg p-4 space-y-4">
                <p>Write the donors a fundraising email, to raise money for the widow and orphan program.</p>
                <p>If their past donation averages over $1K, ask them if they have time to talk on the phone.</p>
                <p>
                  If their past donation averages below $1K, ask them to donate their past average donation * 1.1,
                  online, at [https://donor.me](https://donor.me/).
                </p>
                <p>Use Yeshivish English in your communications.</p>
              </div>

              {chatMessages.map((message, index) => (
                <div
                  key={index}
                  className={cn("flex flex-col space-y-2", {
                    "items-end": message.role === "user",
                  })}
                >
                  <div
                    className={cn("rounded-lg px-3 py-2 max-w-[80%]", {
                      "bg-primary text-primary-foreground": message.role === "user",
                      "bg-muted": message.role === "assistant",
                    })}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>
                  {message.role === "assistant" &&
                    suggestedMemories.length > 0 &&
                    index === chatMessages.length - 1 && (
                      <div className="w-full mt-4">
                        <SuggestedMemories memories={suggestedMemories} />
                      </div>
                    )}
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Input Area */}
          <div className="p-4 border-t bg-background">
            <div className="space-y-4">
              <Textarea
                value={instruction}
                onChange={(e) => onInstructionChange(e.target.value)}
                placeholder="Enter your instructions for email generation..."
                className="min-h-[100px] resize-none"
              />
              <div className="flex justify-between">
                <Button variant="outline" onClick={onBack}>
                  Back
                </Button>
                <div className="space-x-2">
                  <Button
                    onClick={handleSubmitInstruction}
                    disabled={isGenerating || !instruction.trim()}
                    variant="default"
                  >
                    {isGenerating ? "Generating..." : "Generate Emails"}
                  </Button>
                  <Button onClick={onNext} disabled={generatedEmails.length === 0} variant="default">
                    Next
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
