"use client";

import { Button } from "@/components/ui/button";
import { useState, useEffect, useMemo, useRef } from "react";
import { useDonors } from "@/app/hooks/use-donors";
import { useOrganization } from "@/app/hooks/use-organization";
import { useCommunications } from "@/app/hooks/use-communications";
import { useProjects } from "@/app/hooks/use-projects";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmailDisplay } from "../components/EmailDisplay";
import { toast } from "sonner";
import { useDonations } from "@/app/hooks/use-donations";
import type { DonationWithDetails } from "@/app/lib/data/donations";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { SuggestedMemories } from "../components/SuggestedMemories";
import { MentionsInput, Mention } from "react-mentions";
import React from "react";
import "../styles.css";

interface WriteInstructionStepProps {
  instruction: string;
  onInstructionChange: (instruction: string) => void;
  onBack: () => void;
  onNext: () => void;
  selectedDonors: number[];
  ref?: React.RefObject<{ click: () => Promise<void> }>;
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

export const WriteInstructionStep = React.forwardRef<{ click: () => Promise<void> }, WriteInstructionStepProps>(
  function WriteInstructionStep({ instruction, onInstructionChange, onBack, onNext, selectedDonors }, ref) {
    const [isGenerating, setIsGenerating] = useState(false);
    const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
    const [generatedEmails, setGeneratedEmails] = useState<GeneratedEmail[]>([]);
    const [referenceContexts, setReferenceContexts] = useState<Record<number, Record<string, string>>>({});
    const [previousInstruction, setPreviousInstruction] = useState<string | undefined>();
    const [suggestedMemories, setSuggestedMemories] = useState<string[]>([]);
    const chatEndRef = useRef<HTMLDivElement>(null);

    const { getDonorQuery } = useDonors();
    const { getOrganization } = useOrganization();
    const { generateEmails } = useCommunications();
    const { listProjects } = useProjects();

    // Pre-fetch donor data for all selected donors
    const donorQueries = selectedDonors.map((id) => getDonorQuery(id));
    const { data: organization } = getOrganization();

    // Fetch projects for mentions
    const {
      data: projectsData,
      isLoading: isLoadingProjects,
      error: projectsError,
    } = listProjects({
      active: true,
      limit: 100, // Get all active projects
    });

    // Transform projects data for react-mentions
    const projectMentions = useMemo(() => {
      if (!projectsData?.projects) {
        return [];
      }

      return projectsData.projects.map((project) => ({
        id: project.id.toString(),
        display: project.name,
      }));
    }, [projectsData]);

    const scrollToBottom = () => {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
      if (chatMessages.length > 0) {
        scrollToBottom();
      }
    }, [chatMessages]);

    const handleSubmitInstruction = async () => {
      if (!instruction.trim() || !organization) return;

      setIsGenerating(true);
      // Clear existing emails and contexts
      setGeneratedEmails([]);
      setReferenceContexts({});
      setSuggestedMemories([]);
      setChatMessages((prev) => [...prev, { role: "user", content: instruction }]);

      // Clear the input box
      onInstructionChange("");

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
          };
        });

        // Generate emails using the hook
        const result = await generateEmails({
          instruction,
          donors: donorData,
          organizationName: organization.name,
          organizationWritingInstructions: organization.writingInstructions ?? undefined,
          previousInstruction,
        });

        if (result) {
          const typedResult = result as GenerateEmailsResponse;
          setGeneratedEmails(typedResult.emails);
          setPreviousInstruction(typedResult.refinedInstruction);

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

    // Expose the handleSubmitInstruction function through a ref
    React.useImperativeHandle(ref, () => ({
      click: handleSubmitInstruction,
    }));

    // Handle mentions input change
    const handleMentionChange = (event: any, newValue: string, newPlainTextValue: string, mentions: any[]) => {
      onInstructionChange(newValue);
    };

    // Handle keydown for submitting with Cmd/Ctrl + Enter
    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault(); // Prevent default form submission or newline
        if (!isGenerating && instruction.trim()) {
          handleSubmitInstruction();
        }
      }
    };

    return (
      <div className="grid grid-cols-2 gap-4 h-full">
        {/* Left side: Generated Emails with Vertical Tabs */}
        <div className="flex flex-col h-full min-h-0">
          <h3 className="text-lg font-medium mb-4">Generated Emails</h3>
          {isGenerating ? (
            <div className="flex items-center justify-center flex-1 text-muted-foreground border rounded-lg">
              <div className="flex flex-col items-center gap-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <p>Generating emails...</p>
              </div>
            </div>
          ) : generatedEmails.length > 0 ? (
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
                        <EmailDisplay
                          donorName={`${donor.firstName} ${donor.lastName}`}
                          donorEmail={donor.email}
                          subject={email.subject}
                          content={email.structuredContent}
                          referenceContexts={referenceContexts[email.donorId] || {}}
                        />
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
        <div className="flex flex-col h-full min-h-0">
          <h3 className="text-lg font-medium mb-4">Chat Interface</h3>
          <div className="flex flex-col flex-1 border rounded-lg overflow-hidden min-h-0">
            {/* Chat Messages */}
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-4 space-y-4">
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
                <div ref={chatEndRef} />
              </div>
            </ScrollArea>

            {/* Input Area */}
            <div className="p-4 border-t bg-background">
              <div className="space-y-4">
                <div className="relative">
                  <MentionsInput
                    value={instruction}
                    onChange={handleMentionChange}
                    placeholder={
                      isLoadingProjects
                        ? "Loading projects... Type @ to mention projects once loaded"
                        : projectMentions.length > 0
                        ? `Enter your instructions for email generation... (Type @ to mention projects - ${projectMentions.length} available). Press Cmd/Ctrl + Enter to send.`
                        : "Enter your instructions for email generation... Press Cmd/Ctrl + Enter to send."
                    }
                    className="mentions-input"
                    onKeyDown={handleKeyDown}
                  >
                    <Mention
                      trigger="@"
                      data={projectMentions}
                      markup="@[__display__](__id__)"
                      displayTransform={(id, display) => `@${display}`}
                      appendSpaceOnAdd={true}
                    />
                  </MentionsInput>
                </div>
                <div className="flex justify-between pt-4">
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
);
