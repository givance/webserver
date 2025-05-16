"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect } from "react";
import { useDonors } from "@/app/hooks/use-donors";
import { useOrganization } from "@/app/hooks/use-organization";
import { useCommunications } from "@/app/hooks/use-communications";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmailDisplay } from "../components/EmailDisplay";
import { toast } from "sonner";
import { useDonations } from "@/app/hooks/use-donations";
import { DonationInfo } from "@/app/lib/utils/email-generator/types";

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
}

interface ThreadMessage {
  id: number;
  content: string;
  datetime: Date;
  threadId: number;
}

interface CommunicationHistoryItem {
  content: string;
  datetime: string;
}

interface ReferenceContext {
  [key: string]: {
    content: string;
    type: "donation" | "communication" | "summary";
    datetime?: string;
  };
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
  const [communicationHistory, setCommunicationHistory] = useState<Record<number, CommunicationHistoryItem[]>>({});
  const [donationHistory, setDonationHistory] = useState<Record<number, DonationInfo[]>>({});
  const [referenceContexts, setReferenceContexts] = useState<Record<number, Record<string, string>>>({});

  const { getDonorQuery } = useDonors();
  const { getOrganization } = useOrganization();
  const { getThread, listCommunicationThreads, generateEmails, isGeneratingEmails } = useCommunications();
  const { listDonations } = useDonations();

  // Pre-fetch donor data for all selected donors
  const donorQueries = selectedDonors.map((id) => getDonorQuery(id));
  const orgQuery = getOrganization();

  // Fetch communication history for each donor
  useEffect(() => {
    const fetchCommunicationHistory = async () => {
      const history: Record<number, CommunicationHistoryItem[]> = {};

      for (const donorId of selectedDonors) {
        const { data: threads } = await listCommunicationThreads({
          donorId,
          includeDonors: true,
          includeLatestMessage: true,
          limit: 10, // Get last 10 threads
        });

        if (threads?.threads) {
          const messages: CommunicationHistoryItem[] = [];
          for (const thread of threads.threads) {
            const { data: threadData } = await getThread({
              id: thread.id,
              includeMessages: true,
            });

            // Get messages from the thread content
            if (threadData?.content) {
              messages.push(
                ...threadData.content.map((msg) => ({
                  content: msg.content,
                  datetime: new Date(msg.datetime).toISOString(),
                }))
              );
            }
          }
          history[donorId] = messages;
        }
      }

      setCommunicationHistory(history);
    };

    fetchCommunicationHistory();
  }, [selectedDonors, listCommunicationThreads, getThread]);

  // Fetch donation history for each donor
  useEffect(() => {
    const fetchDonationHistory = async () => {
      const history: Record<number, DonationInfo[]> = {};

      for (const donorId of selectedDonors) {
        const { data: donations } = await listDonations({
          donorId,
          includeProject: true,
          limit: 30,
        });

        if (donations?.donations) {
          history[donorId] = donations.donations.map((d) => ({
            id: String(d.id),
            amount: d.amount,
            date: d.date instanceof Date ? d.date : new Date(d.date || d.createdAt),
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
        }
      }

      setDonationHistory(history);
    };

    fetchDonationHistory();
  }, [selectedDonors, listDonations]);

  // Function to build reference contexts from email content
  const buildReferenceContexts = (
    email: GeneratedEmail,
    donorHistory: CommunicationHistoryItem[],
    donorDonations: DonationInfo[],
    websiteSummary: string | null
  ): Record<string, string> => {
    const contexts: Record<string, string> = {};

    // Collect all unique references
    const allRefs = new Set(email.structuredContent.flatMap((piece) => piece.references));

    allRefs.forEach((ref) => {
      if (ref.startsWith("comm-")) {
        // Find the corresponding communication in history
        const [_, threadIndex, messageIndex] = ref.split("-").map(Number);
        const historyItem = donorHistory[threadIndex - 1];
        if (historyItem) {
          contexts[ref] = `Previous message (${new Date(historyItem.datetime).toLocaleDateString()}): ${
            historyItem.content
          }`;
        }
      } else if (ref.startsWith("summary-paragraph-")) {
        // Find the corresponding paragraph in website summary
        const paragraphIndex = parseInt(ref.split("-")[2]) - 1;
        const paragraphs = websiteSummary?.split(/\n\s*\n/) || [];
        if (paragraphs[paragraphIndex]) {
          contexts[ref] = `Organization summary: ${paragraphs[paragraphIndex].trim()}`;
        }
      } else if (ref.startsWith("donation-")) {
        // Find the corresponding donation
        const donationIndex = parseInt(ref.split("-")[1]) - 1;
        const donation = donorDonations[donationIndex];
        if (donation) {
          const amount = (donation.amount / 100).toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
          });
          const date = new Date(donation.date).toLocaleDateString();
          const project = donation.project ? ` to ${donation.project.name}` : "";
          contexts[ref] = `Donation on ${date}: ${amount}${project}`;
        }
      }
    });

    return contexts;
  };

  const handleSubmitInstruction = async () => {
    if (!instruction.trim()) return;

    setIsGenerating(true);
    setChatMessages((prev) => [...prev, { role: "user", content: instruction }]);

    try {
      // Prepare donor data for the API call
      const donorData = selectedDonors.map((donorId) => {
        const donor = donorQueries.find((q) => q.data?.id === donorId)?.data;
        if (!donor) throw new Error(`Donor data not found for ID: ${donorId}`);

        return {
          id: donor.id,
          firstName: donor.firstName,
          lastName: donor.lastName,
          email: donor.email,
          history: communicationHistory[donorId] || [],
          donationHistory: donationHistory[donorId] || [],
        };
      });

      const org = orgQuery.data;
      if (!org) throw new Error("Organization data not found");

      // Generate emails using the hook
      const emails = await generateEmails({
        instruction,
        donors: donorData,
        organizationName: org.name,
        organizationWritingInstructions: org.writingInstructions ?? undefined,
      });

      if (emails) {
        setGeneratedEmails(emails);

        // Build reference contexts for each email
        const newReferenceContexts: Record<number, Record<string, string>> = {};
        (emails as GeneratedEmail[]).forEach((email: GeneratedEmail) => {
          newReferenceContexts[email.donorId] = buildReferenceContexts(
            email,
            communicationHistory[email.donorId] || [],
            donationHistory[email.donorId] || [],
            org.websiteSummary
          );
        });
        setReferenceContexts(newReferenceContexts);

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
    <div className="grid grid-cols-2 gap-4 h-[600px]">
      {/* Left side: Generated Emails */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Generated Emails</h3>
        <ScrollArea className="h-[500px]">
          <div className="space-y-4">
            {generatedEmails.map((email) => {
              const donor = donorQueries.find((q) => q.data?.id === email.donorId)?.data;
              if (!donor) return null;

              return (
                <EmailDisplay
                  key={email.donorId}
                  donorName={`${donor.firstName} ${donor.lastName}`}
                  donorEmail={donor.email}
                  subject={email.subject}
                  content={email.structuredContent}
                  referenceContexts={referenceContexts[email.donorId] || {}}
                />
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Right side: Chat Interface */}
      <div className="flex flex-col h-full">
        <h3 className="text-lg font-medium mb-4">Chat Interface</h3>

        {/* Chat Messages */}
        <ScrollArea className="flex-1 mb-4">
          <div className="space-y-4">
            {chatMessages.map((message, index) => (
              <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    message.role === "user" ? "bg-primary text-primary-foreground ml-4" : "bg-muted mr-4"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="space-y-4">
          <Textarea
            value={instruction}
            onChange={(e) => onInstructionChange(e.target.value)}
            placeholder="Enter your instructions for email generation..."
            className="min-h-[100px]"
          />
          <div className="flex justify-between">
            <Button variant="outline" onClick={onBack}>
              Back
            </Button>
            <div className="space-x-2">
              <Button onClick={handleSubmitInstruction} disabled={isGenerating || !instruction.trim()}>
                {isGenerating ? "Generating..." : "Generate Emails"}
              </Button>
              <Button onClick={onNext} disabled={generatedEmails.length === 0}>
                Next
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
