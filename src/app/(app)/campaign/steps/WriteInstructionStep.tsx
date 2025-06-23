"use client";

import { useCommunications } from "@/app/hooks/use-communications";
import { useDonors } from "@/app/hooks/use-donors";
import { useOrganization } from "@/app/hooks/use-organization";
import { useProjects } from "@/app/hooks/use-projects";
import { useStaff } from "@/app/hooks/use-staff";
import { formatDonorName } from "@/app/lib/utils/donor-name-formatter";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Mail, Plus, RefreshCw, FileText, Edit2, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import React, { useCallback, useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import { Mention, MentionsInput } from "react-mentions";
import { toast } from "sonner";
import { useAuth } from "@clerk/nextjs";
import { EmailListViewer, BaseGeneratedEmail, BaseDonor } from "../components/EmailListViewer";
import { SuggestedMemories } from "../components/SuggestedMemories";
import { SignatureEditor, SignaturePreview } from "@/components/signature";
import "../styles.css";

interface WriteInstructionStepProps {
  instruction: string;
  onInstructionChange: (instruction: string) => void;
  onBack: () => void;
  onNext: () => void;
  selectedDonors: number[];
  onSessionDataChange?: (sessionData: {
    chatHistory: Array<{ role: "user" | "assistant"; content: string }>;
    finalInstruction: string;
    previewDonorIds: number[];
    generatedEmails?: GeneratedEmail[];
    referenceContexts?: Record<number, Record<string, string>>;
  }) => void;
  templatePrompt?: string; // Optional template prompt to pre-populate
  initialChatHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  initialGeneratedEmails?: GeneratedEmail[];
  initialReferenceContexts?: Record<number, Record<string, string>>;
  initialPreviewDonorIds?: number[];
  initialRefinedInstruction?: string; // The refined instruction from previous generation
  campaignName: string;
  templateId?: number;
  onBulkGenerationComplete: (sessionId: number) => void;
  // Edit mode props
  editMode?: boolean;
  sessionId?: number;
}

// Configuration for preview donor count - can be changed later
const PREVIEW_DONOR_COUNT = 50;
const EMAILS_PER_PAGE = 10;
const GENERATE_MORE_COUNT = 50;

interface GeneratedEmail {
  id?: number; // ID from database after saving
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

interface AgenticFlowResponse {
  isAgenticFlow: true;
  sessionId: string;
  needsUserInput: boolean;
  isComplete: boolean;
  conversation: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: Date | string;
    stepType?: "question" | "confirmation" | "generation" | "complete";
  }>;
  canProceed?: boolean;
}

type EmailGenerationResult = GenerateEmailsResponse | AgenticFlowResponse;

export function WriteInstructionStep({
  instruction,
  onInstructionChange,
  onBack,
  onNext,
  selectedDonors,
  onSessionDataChange,
  templatePrompt,
  initialChatHistory = [],
  initialGeneratedEmails = [],
  initialReferenceContexts = {},
  initialPreviewDonorIds = [],
  campaignName,
  templateId,
  onBulkGenerationComplete,
  editMode = false,
  sessionId,
  initialRefinedInstruction,
}: WriteInstructionStepProps) {
  console.log("[WriteInstructionStep] Component mounted/updated with props:", {
    campaignName,
    templateId,
    sessionId,
    editMode,
    selectedDonorsCount: selectedDonors?.length,
    initialRefinedInstruction,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [chatMessages, setChatMessages] =
    useState<Array<{ role: "user" | "assistant"; content: string }>>(initialChatHistory);
  const [generatedEmails, setGeneratedEmails] = useState<GeneratedEmail[]>(initialGeneratedEmails);
  const [referenceContexts, setReferenceContexts] =
    useState<Record<number, Record<string, string>>>(initialReferenceContexts);
  const [previousInstruction, setPreviousInstruction] = useState<string | undefined>(
    initialRefinedInstruction || (editMode && instruction ? instruction : undefined)
  );
  const [suggestedMemories, setSuggestedMemories] = useState<string[]>([]);
  const [previewDonorIds, setPreviewDonorIds] = useState<number[]>(initialPreviewDonorIds);
  const [hasAutoGeneratedFromTemplate, setHasAutoGeneratedFromTemplate] = useState(false);
  const [showBulkGenerationDialog, setShowBulkGenerationDialog] = useState(false);
  const [isStartingBulkGeneration, setIsStartingBulkGeneration] = useState(false);
  const [allGeneratedEmails, setAllGeneratedEmails] = useState<GeneratedEmail[]>(initialGeneratedEmails);
  const [isGeneratingMore, setIsGeneratingMore] = useState(false);
  const [activeTab, setActiveTab] = useState("chat");
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenerateOption, setRegenerateOption] = useState<"all" | "unapproved">("all");
  // Update emails when initialGeneratedEmails prop changes (important for edit mode)
  useEffect(() => {
    if (editMode && initialGeneratedEmails.length > 0) {
      console.log("[WriteInstructionStep] Updating emails from props:", initialGeneratedEmails.length);
      setAllGeneratedEmails(initialGeneratedEmails);
      setGeneratedEmails(initialGeneratedEmails);

      // Update email statuses
      const statuses: Record<number, "PENDING_APPROVAL" | "APPROVED"> = {};
      initialGeneratedEmails.forEach((email) => {
        statuses[email.donorId] = (email as any).status || "PENDING_APPROVAL";
      });
      setEmailStatuses(statuses);

      // Build reference contexts from emails
      const contexts: Record<number, Record<string, string>> = {};
      initialGeneratedEmails.forEach((email) => {
        if (email.referenceContexts) {
          contexts[email.donorId] = email.referenceContexts;
        }
      });
      setReferenceContexts(contexts);
    }
  }, [editMode, initialGeneratedEmails]);

  const [emailStatuses, setEmailStatuses] = useState<Record<number, "PENDING_APPROVAL" | "APPROVED">>(() => {
    // Initialize email statuses from existing emails
    const statuses: Record<number, "PENDING_APPROVAL" | "APPROVED"> = {};
    initialGeneratedEmails.forEach((email) => {
      // If email has a status property, use it, otherwise default to PENDING_APPROVAL
      statuses[email.donorId] = (email as any).status || "PENDING_APPROVAL";
    });
    return statuses;
  });
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Signature-related state
  const [selectedSignatureType, setSelectedSignatureType] = useState<"none" | "custom" | "staff">("none");
  const [customSignature, setCustomSignature] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);
  const [showSignatureEditor, setShowSignatureEditor] = useState(false);
  const [showSignaturePreview, setShowSignaturePreview] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const lastPersistedData = useRef<string>("");

  const { getOrganization } = useOrganization();
  const {
    generateEmails,
    createSession,
    launchCampaign,
    regenerateAllEmails,
    saveGeneratedEmail,
    saveDraft,
    updateEmailStatus,
    updateEmail,
  } = useCommunications();
  const { listProjects } = useProjects();
  const { listStaff, getPrimaryStaff } = useStaff();
  const { userId } = useAuth();

  // Batch fetch donor data for all selected donors
  const { getDonorsQuery } = useDonors();
  const { data: donorsData } = getDonorsQuery(selectedDonors);
  const { data: organization } = getOrganization();

  // Fetch staff data for signature selection
  const { data: staffData } = listStaff({
    limit: 100,
    isRealPerson: true,
  });

  // Get primary staff for email fallback
  const { data: primaryStaff } = getPrimaryStaff();

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

  // Get selected staff member for signature
  const selectedStaff = useMemo(() => {
    if (!selectedStaffId || !staffData?.staff) return null;
    return staffData.staff.find((staff) => staff.id === selectedStaffId) || null;
  }, [selectedStaffId, staffData]);

  // Get current signature based on selection
  const currentSignature = useMemo(() => {
    switch (selectedSignatureType) {
      case "custom":
        return customSignature;
      case "staff":
        return selectedStaff?.signature || `Best,\n${selectedStaff?.firstName || "Staff"}`;
      default:
        return "";
    }
  }, [selectedSignatureType, customSignature, selectedStaff]);

  // Generate random subset of donors for preview on component mount (memoized to prevent recalculation)
  const initialPreviewDonors = useMemo(() => {
    if (selectedDonors.length > 0 && initialPreviewDonorIds.length === 0) {
      const shuffled = [...selectedDonors].sort(() => 0.5 - Math.random());
      return shuffled.slice(0, Math.min(PREVIEW_DONOR_COUNT, selectedDonors.length));
    }
    return initialPreviewDonorIds;
  }, [selectedDonors, initialPreviewDonorIds]);

  // Set preview donors only once when component mounts
  useEffect(() => {
    if (previewDonorIds.length === 0 && initialPreviewDonors.length > 0) {
      setPreviewDonorIds(initialPreviewDonors);
    }
  }, [initialPreviewDonors, previewDonorIds.length]);

  // Function to save chat history - called after messages are sent/received
  const saveChatHistory = useCallback(
    async (messages?: Array<{ role: "user" | "assistant"; content: string }>, refinedInst?: string) => {
      if (!sessionId || !campaignName) {
        console.log("[WriteInstructionStep] Skipping chat history save - no sessionId or campaignName");
        return;
      }

      // Use provided messages or fall back to current state
      const messagesToSave = messages || chatMessages;
      const refinedToSave = refinedInst !== undefined ? refinedInst : previousInstruction;

      console.log("[WriteInstructionStep] Saving chat history and refined instruction", {
        sessionId,
        chatMessagesCount: messagesToSave.length,
        hasRefinedInstruction: !!refinedToSave,
        lastMessage: messagesToSave[messagesToSave.length - 1],
      });

      try {
        await saveDraft.mutateAsync({
          sessionId,
          campaignName,
          selectedDonorIds: selectedDonors,
          templateId,
          instruction: instruction || "",
          chatHistory: messagesToSave,
          refinedInstruction: refinedToSave,
          previewDonorIds,
        });
        console.log("[WriteInstructionStep] Successfully saved chat history with", messagesToSave.length, "messages");
      } catch (error) {
        console.error("[WriteInstructionStep] Failed to save chat history:", error);
      }
    },
    [
      sessionId,
      campaignName,
      selectedDonors,
      templateId,
      instruction,
      previewDonorIds,
      saveDraft,
      chatMessages,
      previousInstruction,
    ]
  );

  // Memoize session data to avoid unnecessary recalculations
  const sessionData = useMemo(
    () => ({
      chatHistory: chatMessages,
      finalInstruction: previousInstruction || instruction,
      previewDonorIds,
      generatedEmails: allGeneratedEmails,
      referenceContexts,
    }),
    [chatMessages, previousInstruction, instruction, previewDonorIds, allGeneratedEmails, referenceContexts]
  );

  // Automatically persist session data whenever it changes (with throttling)
  useLayoutEffect(() => {
    if (onSessionDataChange && (chatMessages.length > 0 || allGeneratedEmails.length > 0)) {
      const currentDataString = JSON.stringify({
        chatHistory: sessionData.chatHistory,
        finalInstruction: sessionData.finalInstruction,
        previewDonorIds: sessionData.previewDonorIds,
        generatedEmailsCount: sessionData.generatedEmails.length,
        referenceContextsKeys: Object.keys(sessionData.referenceContexts),
      });

      // Only persist if the data has actually changed
      if (currentDataString !== lastPersistedData.current) {
        lastPersistedData.current = currentDataString;
        onSessionDataChange(sessionData);
      }
    }
  }, [sessionData, onSessionDataChange, chatMessages.length, allGeneratedEmails.length]);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (chatMessages.length > 0) {
      scrollToBottom();
    }
  }, [chatMessages]);

  const handleSubmitInstruction = useCallback(
    async (instructionToSubmit?: string) => {
      const finalInstruction = instructionToSubmit || instruction;
      if (!finalInstruction.trim() || !organization) return;

      setIsGenerating(true);
      // Clear existing emails and contexts
      setGeneratedEmails([]);
      setAllGeneratedEmails([]);
      setReferenceContexts({});
      setSuggestedMemories([]);
      setChatMessages((prev) => {
        const newMessages = [...prev, { role: "user" as const, content: finalInstruction }];
        // Note: We'll save chat history after the assistant responds
        return newMessages;
      });

      // Clear the input box only if this is manual submission (not auto-generation)
      if (!instructionToSubmit) {
        onInstructionChange("");
      }

      try {
        // Prepare donor data for the API call - use only preview donors
        const donorData = previewDonorIds.map((donorId) => {
          const donor = donorsData?.find((d) => d.id === donorId);
          if (!donor) throw new Error(`Donor data not found for ID: ${donorId}`);

          return {
            id: donor.id,
            firstName: donor.firstName,
            lastName: donor.lastName,
            email: donor.email,
          };
        });

        // Get current date in a readable format
        const currentDate = new Date().toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });

        // Generate emails using the hook with signature
        const result = await generateEmails.mutateAsync({
          instruction: finalInstruction,
          donors: donorData,
          organizationName: organization.name,
          organizationWritingInstructions: organization.writingInstructions ?? undefined,
          previousInstruction,
          currentDate, // Pass the current date
          chatHistory: chatMessages, // Pass the full chat history to the refinement agent
          signature: currentSignature, // Pass the selected signature
        });

        if (result) {
          const typedResult = result as EmailGenerationResult;

          // Check if this is an agentic flow response
          if ("isAgenticFlow" in typedResult && typedResult.isAgenticFlow) {
            // Handle agentic flow response
            const agenticResult = typedResult as AgenticFlowResponse;

            // Add the conversation messages to chat
            const conversationMessages = agenticResult.conversation.map((msg) => ({
              role: msg.role,
              content: msg.content,
            }));

            setChatMessages((prev) => [...prev, ...conversationMessages]);

            // If it needs user input, we don't generate emails yet
            if (agenticResult.needsUserInput) {
              // TODO: Handle agentic conversation flow
              // For now, just show the conversation
              console.log("Agentic flow needs user input:", agenticResult);
              return;
            }
          } else {
            // Handle traditional email generation response
            const emailResult = typedResult as GenerateEmailsResponse;
            setAllGeneratedEmails(emailResult.emails);
            setGeneratedEmails(emailResult.emails);
            setPreviousInstruction(emailResult.refinedInstruction);

            // Initialize all emails as pending approval
            const initialStatuses: Record<number, "PENDING_APPROVAL" | "APPROVED"> = {};
            emailResult.emails.forEach((email) => {
              initialStatuses[email.donorId] = "PENDING_APPROVAL";
            });
            setEmailStatuses(initialStatuses);

            setReferenceContexts(
              emailResult.emails.reduce<Record<number, Record<string, string>>>((acc, email) => {
                acc[email.donorId] = email.referenceContexts;
                return acc;
              }, {})
            );

            // Save generated emails incrementally if we have a sessionId
            if (sessionId) {
              console.log(
                `[WriteInstructionStep] Saving ${emailResult.emails.length} generated emails to session ${sessionId}`
              );

              const savePromises = emailResult.emails.map(async (email) => {
                try {
                  console.log(`[WriteInstructionStep] Saving email for donor ${email.donorId}`);
                  const result = await saveGeneratedEmail.mutateAsync({
                    sessionId,
                    donorId: email.donorId,
                    subject: email.subject,
                    structuredContent: email.structuredContent,
                    referenceContexts: email.referenceContexts,
                    isPreview: true,
                  });

                  // The service only returns { success: boolean }, no email object
                  console.log(`[WriteInstructionStep] Successfully saved email for donor ${email.donorId}`);
                  return email;
                } catch (error) {
                  console.error(`[WriteInstructionStep] Failed to save email for donor ${email.donorId}:`, error);
                  return email;
                }
              });

              // Save all emails in parallel
              Promise.all(savePromises)
                .then((savedEmails) => {
                  console.log(`[WriteInstructionStep] Successfully saved ${emailResult.emails.length} emails to draft`);
                })
                .catch((error) => {
                  console.error(`[WriteInstructionStep] Error saving some emails:`, error);
                });
            } else {
              console.log(`[WriteInstructionStep] No sessionId available, skipping email save`);
            }

            const responseMessage = instructionToSubmit
              ? "I've generated personalized emails using your selected template. You can review them on the left side and make any adjustments to the content or style if needed."
              : "I've generated personalized emails based on each donor's communication history and your organization's writing instructions. You can review them on the left side. Let me know if you'd like any adjustments to the tone, content, or style.";

            setChatMessages((prev) => {
              const newMessages = [
                ...prev,
                {
                  role: "assistant" as const,
                  content: responseMessage,
                },
              ];

              // Save chat history after adding assistant message with the refined instruction
              setTimeout(() => saveChatHistory(newMessages, emailResult.refinedInstruction), 100);

              return newMessages;
            });

            // Auto-switch to preview tab after email generation
            setTimeout(() => {
              setActiveTab("preview");
            }, 500);
          }
        } else {
          throw new Error("Failed to generate emails");
        }
      } catch (error) {
        console.error("Error generating emails:", error);
        toast.error("Failed to generate emails. Please try again.");
        setChatMessages((prev) => {
          const newMessages = [
            ...prev,
            {
              role: "assistant" as const,
              content: "I apologize, but I encountered an error while generating the emails. Please try again.",
            },
          ];

          // Save chat history after error message
          setTimeout(() => saveChatHistory(newMessages), 100);

          return newMessages;
        });
      } finally {
        setIsGenerating(false);
      }
    },
    [
      instruction,
      previewDonorIds,
      donorsData,
      organization,
      generateEmails,
      onInstructionChange,
      previousInstruction,
      chatMessages,
      sessionId,
      saveGeneratedEmail,
      saveChatHistory,
      currentSignature,
    ]
  );

  // Pre-fill instruction from template when chat history is empty
  useEffect(() => {
    if (
      templatePrompt &&
      templatePrompt.trim() &&
      chatMessages.length === 0 && // Only pre-fill if no chat history
      !hasAutoGeneratedFromTemplate
    ) {
      // Only set the instruction, don't auto-generate
      onInstructionChange(templatePrompt);
      setHasAutoGeneratedFromTemplate(true); // Prevent re-setting on re-renders
    }
  }, [templatePrompt, chatMessages.length, hasAutoGeneratedFromTemplate, onInstructionChange]);

  // Handle generating more emails with the same prompt
  const handleGenerateMore = useCallback(async () => {
    if (isGeneratingMore || !organization) return;

    const finalInstruction = previousInstruction || instruction;
    if (!finalInstruction.trim()) {
      toast.error("No instruction available to generate more emails");
      return;
    }

    // Get donors that haven't been generated yet
    const alreadyGeneratedDonorIds = new Set(allGeneratedEmails.map((email) => email.donorId));
    const remainingDonors = selectedDonors.filter((id) => !alreadyGeneratedDonorIds.has(id));

    if (remainingDonors.length === 0) {
      toast.error("All selected donors have emails generated already");
      return;
    }

    // Select next batch of donors (up to GENERATE_MORE_COUNT)
    const nextBatchDonors = remainingDonors.slice(0, Math.min(GENERATE_MORE_COUNT, remainingDonors.length));

    setIsGeneratingMore(true);

    try {
      // Prepare donor data for the API call
      const donorData = nextBatchDonors.map((donorId) => {
        const donor = donorsData?.find((d) => d.id === donorId);
        if (!donor) throw new Error(`Donor data not found for ID: ${donorId}`);

        return {
          id: donor.id,
          firstName: donor.firstName,
          lastName: donor.lastName,
          email: donor.email,
        };
      });

      // Get current date in a readable format
      const currentDate = new Date().toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      // Generate emails using the same instruction
      const result = await generateEmails.mutateAsync({
        instruction: finalInstruction,
        donors: donorData,
        organizationName: organization.name,
        organizationWritingInstructions: organization.writingInstructions ?? undefined,
        previousInstruction,
        currentDate,
        chatHistory: chatMessages,
      });

      if (result && !("isAgenticFlow" in result)) {
        const emailResult = result as GenerateEmailsResponse;
        const newEmails = [...allGeneratedEmails, ...emailResult.emails];

        setAllGeneratedEmails(newEmails);
        setGeneratedEmails(newEmails);

        // Update reference contexts and initialize statuses
        const newReferenceContexts = { ...referenceContexts };
        const newStatuses = { ...emailStatuses };
        emailResult.emails.forEach((email) => {
          newReferenceContexts[email.donorId] = email.referenceContexts;
          // Initialize all new emails as pending approval
          newStatuses[email.donorId] = "PENDING_APPROVAL";
        });
        setReferenceContexts(newReferenceContexts);
        setEmailStatuses(newStatuses);

        // Save newly generated emails incrementally if we have a sessionId
        if (sessionId) {
          const savePromises = emailResult.emails.map(async (email) => {
            try {
              const result = await saveGeneratedEmail.mutateAsync({
                sessionId,
                donorId: email.donorId,
                subject: email.subject,
                structuredContent: email.structuredContent,
                referenceContexts: email.referenceContexts,
                isPreview: true,
              });

              // The service only returns { success: boolean }, no email object
              console.log(`[WriteInstructionStep] Successfully saved email for donor ${email.donorId}`);
              return email;
            } catch (error) {
              console.error(`Failed to save email for donor ${email.donorId}:`, error);
              return email;
            }
          });

          // Save all emails in parallel
          Promise.all(savePromises).then((savedEmails) => {
            console.log(`Saved ${emailResult.emails.length} more emails to draft`);
          });
        }

        setChatMessages((prev) => {
          const newMessages = [
            ...prev,
            {
              role: "assistant" as const,
              content: `I've generated ${emailResult.emails.length} more personalized emails. You now have ${newEmails.length} emails total to review.`,
            },
          ];

          // Save chat history after generating more emails
          setTimeout(() => saveChatHistory(newMessages), 100);

          return newMessages;
        });

        toast.success(`Generated ${emailResult.emails.length} more emails successfully!`);
      } else {
        throw new Error("Failed to generate more emails");
      }
    } catch (error) {
      console.error("Error generating more emails:", error);
      toast.error("Failed to generate more emails. Please try again.");
      setChatMessages((prev) => {
        const newMessages = [
          ...prev,
          {
            role: "assistant" as const,
            content: "I apologize, but I encountered an error while generating more emails. Please try again.",
          },
        ];

        // Save chat history after error
        setTimeout(() => saveChatHistory(newMessages), 100);

        return newMessages;
      });
    } finally {
      setIsGeneratingMore(false);
    }
  }, [
    isGeneratingMore,
    organization,
    previousInstruction,
    instruction,
    allGeneratedEmails,
    selectedDonors,
    donorsData,
    generateEmails,
    referenceContexts,
    chatMessages,
    saveChatHistory,
    saveGeneratedEmail,
    sessionId,
    emailStatuses,
  ]);

  // Handle regenerating all emails with same instructions without affecting chat history
  const handleRegenerateAllEmails = async (onlyUnapproved = false) => {
    if (isRegenerating || !organization) return;

    const finalInstruction = previousInstruction || instruction;
    console.log("[WriteInstructionStep] Regenerating with:", {
      previousInstruction,
      instruction,
      finalInstruction,
      onlyUnapproved,
    });

    if (!finalInstruction || finalInstruction.trim().length === 0) {
      toast.error("No instruction available for regeneration. Please generate emails first.");
      return;
    }

    setIsRegenerating(true);
    setShowRegenerateDialog(false);

    try {
      // Determine which donors to regenerate
      let donorsToRegenerate = previewDonorIds;
      let preservedEmails: GeneratedEmail[] = [];
      const preservedStatuses = { ...emailStatuses };
      const preservedContexts = { ...referenceContexts };

      if (onlyUnapproved) {
        // Only regenerate emails for donors with pending approval status
        donorsToRegenerate = previewDonorIds.filter((donorId) => emailStatuses[donorId] !== "APPROVED");

        // Preserve approved emails
        preservedEmails = allGeneratedEmails.filter((email) => emailStatuses[email.donorId] === "APPROVED");

        // Don't clear contexts for approved emails
        const newContexts: Record<number, Record<string, string>> = {};
        preservedEmails.forEach((email) => {
          newContexts[email.donorId] = referenceContexts[email.donorId] || {};
        });
        setReferenceContexts(newContexts);

        toast.info(
          `Regenerating ${donorsToRegenerate.length} unapproved emails, keeping ${preservedEmails.length} approved emails`
        );
      } else {
        // Clear everything for full regeneration
        setGeneratedEmails([]);
        setAllGeneratedEmails([]);
        setReferenceContexts({});
        setSuggestedMemories([]);
        setEmailStatuses({});
      }

      // Prepare donor data for the API call
      const donorData = donorsToRegenerate.map((donorId) => {
        const donor = donorsData?.find((d) => d.id === donorId);
        if (!donor) throw new Error(`Donor data not found for ID: ${donorId}`);

        return {
          id: donor.id,
          firstName: donor.firstName,
          lastName: donor.lastName,
          email: donor.email,
        };
      });

      // Get current date in a readable format
      const currentDate = new Date().toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      // Generate emails using the hook without affecting chat history
      const result = await generateEmails.mutateAsync({
        instruction: finalInstruction,
        donors: donorData,
        organizationName: organization.name,
        organizationWritingInstructions: organization.writingInstructions ?? undefined,
        previousInstruction,
        currentDate,
        chatHistory: chatMessages, // Pass existing chat history but don't modify it
      });

      if (result && !("isAgenticFlow" in result)) {
        const emailResult = result as GenerateEmailsResponse;

        if (onlyUnapproved) {
          // Combine preserved approved emails with newly generated ones
          const combinedEmails = [...preservedEmails, ...emailResult.emails];
          setAllGeneratedEmails(combinedEmails);
          setGeneratedEmails(combinedEmails);

          // Update statuses for new emails as pending
          const newStatuses = { ...preservedStatuses };
          emailResult.emails.forEach((email) => {
            newStatuses[email.donorId] = "PENDING_APPROVAL";
          });
          setEmailStatuses(newStatuses);

          // Merge reference contexts
          const combinedContexts = { ...preservedContexts };
          emailResult.emails.forEach((email) => {
            combinedContexts[email.donorId] = email.referenceContexts;
          });
          setReferenceContexts(combinedContexts);
        } else {
          // Full regeneration - replace everything
          setAllGeneratedEmails(emailResult.emails);
          setGeneratedEmails(emailResult.emails);

          // Initialize all as pending
          const newStatuses: Record<number, "PENDING_APPROVAL" | "APPROVED"> = {};
          emailResult.emails.forEach((email) => {
            newStatuses[email.donorId] = "PENDING_APPROVAL";
          });
          setEmailStatuses(newStatuses);

          setReferenceContexts(
            emailResult.emails.reduce<Record<number, Record<string, string>>>((acc, email) => {
              acc[email.donorId] = email.referenceContexts;
              return acc;
            }, {})
          );
        }

        setPreviousInstruction(emailResult.refinedInstruction);

        // Save generated emails incrementally if we have a sessionId
        if (sessionId) {
          console.log(
            `[WriteInstructionStep] Saving ${emailResult.emails.length} regenerated emails to session ${sessionId}`
          );

          const savePromises = emailResult.emails.map(async (email) => {
            try {
              const result = await saveGeneratedEmail.mutateAsync({
                sessionId,
                donorId: email.donorId,
                subject: email.subject,
                structuredContent: email.structuredContent,
                referenceContexts: email.referenceContexts,
                isPreview: true,
              });

              // The service only returns { success: boolean }, no email object
              console.log(`[WriteInstructionStep] Successfully saved email for donor ${email.donorId}`);
              return email;
            } catch (error) {
              console.error(
                `[WriteInstructionStep] Failed to save regenerated email for donor ${email.donorId}:`,
                error
              );
              return email;
            }
          });

          // Save all emails in parallel
          Promise.all(savePromises)
            .then((savedEmails) => {
              console.log(
                `[WriteInstructionStep] Successfully saved ${emailResult.emails.length} regenerated emails to draft`
              );
            })
            .catch((error) => {
              console.error(`[WriteInstructionStep] Error saving some regenerated emails:`, error);
            });
        }

        // Auto-switch to preview tab after email regeneration
        setTimeout(() => {
          setActiveTab("preview");
        }, 500);

        toast.success(`Successfully regenerated ${emailResult.emails.length} emails!`);
      } else {
        throw new Error("Failed to regenerate emails");
      }
    } catch (error) {
      console.error("Error regenerating emails:", error);
      toast.error("Failed to regenerate emails. Please try again.");
    } finally {
      setIsRegenerating(false);
    }
  };

  // Handle bulk generation
  const handleBulkGeneration = async () => {
    if (isStartingBulkGeneration) return;

    if (!userId) {
      toast.error("User not authenticated");
      return;
    }

    // Remove the check that prevents launching when no emails need generation
    // The backend will handle marking the campaign as COMPLETED if all emails exist

    const finalInstruction = previousInstruction || instruction;
    if (!finalInstruction || finalInstruction.trim().length === 0) {
      toast.error("No instruction provided. Please generate emails first.");
      return;
    }

    const currentSessionData = {
      chatHistory: chatMessages,
      finalInstruction: finalInstruction.trim(),
      previewDonorIds,
    };

    setIsStartingBulkGeneration(true);
    try {
      // Always use launchCampaign - it handles both new campaigns and existing drafts properly
      // The launchCampaign method will:
      // 1. Find existing draft with the same name if it exists
      // 2. Update the status appropriately (GENERATING or READY_TO_SEND)
      // 3. Trigger background jobs if needed
      // 4. Set completedDonors count correctly
      const response = await launchCampaign.mutateAsync({
        campaignName: campaignName,
        instruction: currentSessionData.finalInstruction,
        chatHistory: currentSessionData.chatHistory,
        selectedDonorIds: selectedDonors,
        previewDonorIds: currentSessionData.previewDonorIds,
        refinedInstruction: currentSessionData.finalInstruction,
        templateId: templateId,
      });

      if (!response?.sessionId) {
        throw new Error("Failed to launch campaign");
      }

      toast.success(
        editMode
          ? "Campaign updated and launched! Redirecting to communication jobs..."
          : "Campaign launched! Redirecting to communication jobs..."
      );

      setShowBulkGenerationDialog(false);

      // Redirect after starting the generation
      setTimeout(() => {
        onBulkGenerationComplete(response.sessionId);
      }, 1000);
    } catch (error) {
      console.error("Error starting bulk generation:", error);
      toast.error("Failed to start bulk generation");
    } finally {
      setIsStartingBulkGeneration(false);
    }
  };

  // Handle next button click - show confirmation dialog
  const handleNextClick = () => {
    if (generatedEmails.length === 0) {
      toast.error("Please generate emails first before proceeding");
      return;
    }

    const finalInstruction = previousInstruction || instruction;
    if (!finalInstruction || finalInstruction.trim().length === 0) {
      toast.error("No instruction provided. Please generate emails first.");
      return;
    }

    // Pass session data to parent before showing dialog
    if (onSessionDataChange) {
      onSessionDataChange({
        chatHistory: chatMessages,
        finalInstruction: finalInstruction.trim(),
        previewDonorIds,
        generatedEmails,
        referenceContexts,
      });
    }

    setShowBulkGenerationDialog(true);
  };

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

  // Handle email status change
  const handleEmailStatusChange = useCallback(
    async (emailId: number, status: "PENDING_APPROVAL" | "APPROVED") => {
      // Check if this is actually a donorId (preview mode)
      // In preview mode, we use donorId as the identifier
      const isPreviewMode = !allGeneratedEmails.some((e) => e.id === emailId);

      if (isPreviewMode) {
        // This is actually a donorId, just update local state
        setEmailStatuses((prev) => ({
          ...prev,
          [emailId]: status, // emailId is actually donorId here
        }));
        toast.success(status === "APPROVED" ? "Email approved" : "Email marked as pending");
        return;
      }

      if (!sessionId) return;

      setIsUpdatingStatus(true);
      try {
        await updateEmailStatus.mutateAsync({
          emailId,
          status,
        });

        // Update local state
        const email = allGeneratedEmails.find((e) => e.id === emailId);
        if (email) {
          setEmailStatuses((prev) => ({
            ...prev,
            [email.donorId]: status,
          }));
        }

        toast.success(status === "APPROVED" ? "Email approved" : "Email marked as pending");
      } catch (error) {
        console.error("Error updating email status:", error);
        toast.error("Failed to update email status");
      } finally {
        setIsUpdatingStatus(false);
      }
    },
    [sessionId, updateEmailStatus, allGeneratedEmails]
  );

  // Check if we can generate more emails
  const alreadyGeneratedDonorIds = new Set(allGeneratedEmails.map((email) => email.donorId));
  const remainingDonors = selectedDonors.filter((id) => !alreadyGeneratedDonorIds.has(id));
  const canGenerateMore = remainingDonors.length > 0;

  // Count approved vs pending emails
  const approvedCount = Object.values(emailStatuses).filter((status) => status === "APPROVED").length;
  const pendingCount = Object.values(emailStatuses).filter((status) => status === "PENDING_APPROVAL").length;

  return (
    <div className="flex flex-col h-full space-y-6">
      {/* Main Content with Tabs */}
      <div className="flex-1 min-h-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="chat" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Chat & Generate
            </TabsTrigger>
            <TabsTrigger value="preview" className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Email Preview ({allGeneratedEmails.length})
            </TabsTrigger>
          </TabsList>

          {/* Chat Tab */}
          <TabsContent value="chat" className="flex-1 min-h-0 mt-3">
            <div className="grid grid-cols-1 lg:grid-cols-1 gap-6 h-full">
              {/* Simplified Chat Interface */}
              <Card className="h-full flex flex-col">
                <CardContent className="flex-1 flex flex-col min-h-0 p-0">
                  <div className="flex flex-col flex-1 min-h-0">
                    {/* Chat Messages */}
                    <ScrollArea className="flex-1 min-h-0">
                      <div className="p-6 space-y-4">
                        {chatMessages.length === 0 ? (
                          <div className="text-center py-12 text-muted-foreground">
                            <p>Start by writing instructions for email generation below.</p>
                          </div>
                        ) : (
                          chatMessages.map((message, index) => (
                            <div
                              key={index}
                              className={cn("flex flex-col space-y-2", {
                                "items-end": message.role === "user",
                              })}
                            >
                              <div
                                className={cn("rounded-lg px-4 py-3 max-w-[80%]", {
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
                          ))
                        )}
                        <div ref={chatEndRef} />
                      </div>
                    </ScrollArea>

                    {/* Input Area */}
                    <div className="p-6 border-t bg-background">
                      <div className="space-y-4">
                        <div className="relative">
                          <MentionsInput
                            value={instruction}
                            onChange={handleMentionChange}
                            placeholder={
                              isLoadingProjects
                                ? "Loading projects... Type @ to mention projects once loaded"
                                : projectMentions.length > 0
                                ? `Enter your instructions for email generation or continue the conversation... (Type @ to mention projects - ${projectMentions.length} available). Press Cmd/Ctrl + Enter to send.`
                                : "Enter your instructions for email generation or continue the conversation... Press Cmd/Ctrl + Enter to send."
                            }
                            className="mentions-input min-h-[120px]"
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
                        <div className="flex justify-end gap-2">
                          <Button
                            onClick={() => setShowRegenerateDialog(true)}
                            disabled={isRegenerating || isGenerating}
                            variant="outline"
                            className="flex items-center gap-2"
                          >
                            <RefreshCw className="h-4 w-4" />
                            Regenerate
                          </Button>
                          <Button
                            onClick={() => handleSubmitInstruction()}
                            disabled={isGenerating || !instruction.trim()}
                            variant="default"
                          >
                            {isGenerating ? "Generating..." : "Generate Emails"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Preview Tab */}
          <TabsContent value="preview" className="flex-1 min-h-0 mt-3">
            <Card className="h-full flex flex-col">
              <CardContent className="flex-1 min-h-0 p-0">
                {isGenerating ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <div className="flex flex-col items-center gap-4">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                      <div className="text-center">
                        <p className="font-medium">Generating personalized emails...</p>
                        <p className="text-sm">This may take a few moments</p>
                      </div>
                    </div>
                  </div>
                ) : allGeneratedEmails.length > 0 ? (
                  <div className="h-full p-6">
                    <EmailListViewer
                      emails={allGeneratedEmails.map((email) => ({
                        ...email,
                        status: emailStatuses[email.donorId] || "PENDING_APPROVAL",
                      }))}
                      donors={
                        donorsData
                          ?.filter((donor) => !!donor)
                          .map((donor) => ({
                            id: donor.id,
                            firstName: donor.firstName,
                            lastName: donor.lastName,
                            email: donor.email,
                            assignedToStaffId: donor.assignedToStaffId,
                          })) || []
                      }
                      referenceContexts={referenceContexts}
                      showSearch={true}
                      showPagination={true}
                      showTracking={false}
                      showStaffAssignment={true}
                      showSendButton={false}
                      showEditButton={true}
                      emailsPerPage={EMAILS_PER_PAGE}
                      maxHeight="calc(100vh - 280px)"
                      emptyStateTitle="No emails generated yet"
                      emptyStateDescription={
                        templatePrompt
                          ? "Generating emails from template..."
                          : "Switch to the Chat & Generate tab to generate emails"
                      }
                      onEmailStatusChange={handleEmailStatusChange}
                      isUpdatingStatus={isUpdatingStatus}
                      sessionId={sessionId}
                      onPreviewEdit={async (donorId, newSubject, newContent) => {
                        // Update the local state with edited email
                        setAllGeneratedEmails((prev) =>
                          prev.map((email) =>
                            email.donorId === donorId
                              ? { ...email, subject: newSubject, structuredContent: newContent }
                              : email
                          )
                        );

                        // If we have a sessionId and the email has been saved (has an id), update it in the backend
                        const emailToUpdate = allGeneratedEmails.find((e) => e.donorId === donorId);
                        if (sessionId && emailToUpdate && emailToUpdate.id) {
                          try {
                            await updateEmail.mutateAsync({
                              emailId: emailToUpdate.id,
                              subject: newSubject,
                              structuredContent: newContent,
                              referenceContexts: emailToUpdate.referenceContexts,
                            });
                            toast.success("Email updated successfully!");
                          } catch (error) {
                            console.error("Failed to update email in backend:", error);
                            toast.error("Failed to save email changes. Changes are only saved locally.");
                          }
                        } else {
                          toast.success("Email updated locally!");
                        }
                      }}
                      onPreviewEnhance={async (donorId, enhanceInstruction) => {
                        // Find the email to enhance
                        const emailToEnhance = allGeneratedEmails.find((e) => e.donorId === donorId);
                        if (!emailToEnhance || !organization) return;

                        try {
                          toast.info("Enhancing email with AI...");

                          // Get donor data
                          const donor = donorsData?.find((d) => d.id === donorId);
                          if (!donor) return;

                          // Use the generate emails API with the enhancement instruction
                          const result = await generateEmails.mutateAsync({
                            instruction: `${
                              previousInstruction || instruction
                            }\n\nAdditional enhancement: ${enhanceInstruction}`,
                            donors: [
                              {
                                id: donor.id,
                                firstName: donor.firstName,
                                lastName: donor.lastName,
                                email: donor.email,
                              },
                            ],
                            organizationName: organization.name,
                            organizationWritingInstructions: organization.writingInstructions ?? undefined,
                            previousInstruction,
                            currentDate: new Date().toLocaleDateString("en-US", {
                              weekday: "long",
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            }),
                            chatHistory: chatMessages,
                            signature: currentSignature,
                          });

                          if (result && !("isAgenticFlow" in result)) {
                            const emailResult = result as GenerateEmailsResponse;
                            if (emailResult.emails.length > 0) {
                              const enhancedEmail = emailResult.emails[0];

                              // Update the email in state
                              setAllGeneratedEmails((prev) =>
                                prev.map((email) =>
                                  email.donorId === donorId
                                    ? {
                                        ...email,
                                        subject: enhancedEmail.subject,
                                        structuredContent: enhancedEmail.structuredContent,
                                        referenceContexts: enhancedEmail.referenceContexts,
                                      }
                                    : email
                                )
                              );

                              // Update reference contexts
                              setReferenceContexts((prev) => ({
                                ...prev,
                                [donorId]: enhancedEmail.referenceContexts,
                              }));

                              toast.success("Email enhanced successfully!");
                            }
                          }
                        } catch (error) {
                          console.error("Error enhancing email:", error);
                          toast.error("Failed to enhance email");
                        }
                      }}
                      // Pass regenerate functionality to EmailListViewer
                      showRegenerateButton={true}
                      onRegenerate={() => setShowRegenerateDialog(true)}
                      isRegenerating={isRegenerating}
                      canGenerateMore={canGenerateMore}
                      onGenerateMore={handleGenerateMore}
                      isGeneratingMore={isGeneratingMore}
                      remainingDonorsCount={remainingDonors.length}
                      generateMoreCount={GENERATE_MORE_COUNT}
                      getStaffName={(staffId) => {
                        if (!staffId || !staffData?.staff) return "Unassigned";
                        const staff = staffData.staff.find((s) => s.id === staffId);
                        return staff ? `${staff.firstName} ${staff.lastName}` : "Unknown Staff";
                      }}
                      getStaffDetails={(staffId) => {
                        if (!staffId || !staffData?.staff) return null;
                        return staffData.staff.find((s) => s.id === staffId) || null;
                      }}
                      primaryStaff={primaryStaff || null}
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <div className="text-center space-y-4">
                      <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center">
                        <Mail className="h-8 w-8" />
                      </div>
                      <div>
                        <p className="font-medium">No emails generated yet</p>
                        <p className="text-sm">
                          {templatePrompt
                            ? "Generating emails from template..."
                            : "Switch to the Chat & Generate tab to get started"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between pt-4 border-t">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={handleNextClick} disabled={generatedEmails.length === 0 || isGenerating}>
          Launch Campaign
        </Button>
      </div>

      {/* Bulk Generation Confirmation Dialog */}
      <Dialog open={showBulkGenerationDialog} onOpenChange={setShowBulkGenerationDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Confirm Campaign Launch
            </DialogTitle>
            <DialogDescription>
              You&apos;re about to launch a campaign to generate personalized emails for all selected donors based on
              your current instruction.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Summary Card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Users className="h-3 w-3" />
                  Campaign Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-0.5">
                    <p className="text-xs font-medium">Total Campaign</p>
                    <p className="text-lg font-bold">{selectedDonors.length}</p>
                    <p className="text-xs text-muted-foreground">donors</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs font-medium text-green-600">Already Reviewed</p>
                    <p className="text-lg font-bold text-green-600">{allGeneratedEmails.length}</p>
                    <p className="text-xs text-muted-foreground">
                      {approvedCount} approved, {pendingCount} pending
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs font-medium text-blue-600">To Be Generated</p>
                    <p className="text-lg font-bold text-blue-600">
                      {selectedDonors.length - allGeneratedEmails.length}
                    </p>
                    <p className="text-xs text-muted-foreground">new emails</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Final Instruction</p>
                  <div className="bg-muted rounded-lg">
                    <ScrollArea className="h-28 w-full">
                      <div className="p-3">
                        <p className="text-sm whitespace-pre-wrap">
                          {(previousInstruction || instruction || "").trim() || "No instruction provided"}
                        </p>
                      </div>
                    </ScrollArea>
                  </div>
                </div>

                {selectedSignatureType !== "none" && currentSignature && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Selected Signature</p>
                    <div className="bg-muted rounded-lg p-3">
                      <div
                        className="prose prose-sm max-w-none text-sm"
                        dangerouslySetInnerHTML={{
                          __html:
                            currentSignature.length > 200
                              ? currentSignature.substring(0, 200) + "..."
                              : currentSignature,
                        }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                {allGeneratedEmails.length > 0 ? (
                  <>
                    This will launch your campaign for all {selectedDonors.length} selected donors.{" "}
                    <strong>{approvedCount} approved emails</strong> will be kept exactly as they are.
                    {selectedDonors.length - allGeneratedEmails.length > 0 ? (
                      <>
                        {" "}
                        <strong>{selectedDonors.length - allGeneratedEmails.length} new emails</strong> will be
                        generated for the remaining donors.
                      </>
                    ) : (
                      <> All selected donors already have generated emails.</>
                    )}
                  </>
                ) : (
                  <>
                    This will launch your campaign to generate personalized emails for all {selectedDonors.length}{" "}
                    selected donors.
                  </>
                )}{" "}
                You&apos;ll be redirected to the communication jobs page where you can monitor the progress.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowBulkGenerationDialog(false)}
              disabled={isStartingBulkGeneration}
            >
              Cancel
            </Button>
            <Button onClick={handleBulkGeneration} disabled={isStartingBulkGeneration}>
              {isStartingBulkGeneration ? "Launching..." : "Launch Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Regenerate Confirmation Dialog */}
      <Dialog open={showRegenerateDialog} onOpenChange={setShowRegenerateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Regenerate Emails
            </DialogTitle>
            <DialogDescription>Choose which emails you want to regenerate</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-3">
              <Label>Regeneration Options</Label>
              <div className="space-y-2">
                <div
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                    regenerateOption === "all" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                  )}
                  onClick={() => setRegenerateOption("all")}
                >
                  <input
                    type="radio"
                    checked={regenerateOption === "all"}
                    onChange={() => setRegenerateOption("all")}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-medium">Regenerate ALL emails ({allGeneratedEmails.length} total)</div>
                    <div className="text-sm text-muted-foreground">This will replace all existing emails</div>
                  </div>
                </div>

                <div
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                    regenerateOption === "unapproved"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50",
                    pendingCount === 0 && "opacity-50 cursor-not-allowed"
                  )}
                  onClick={() => pendingCount > 0 && setRegenerateOption("unapproved")}
                >
                  <input
                    type="radio"
                    checked={regenerateOption === "unapproved"}
                    onChange={() => setRegenerateOption("unapproved")}
                    disabled={pendingCount === 0}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-medium">Regenerate only unapproved emails ({pendingCount} emails)</div>
                    <div className="text-sm text-muted-foreground">
                      Keep your {approvedCount} approved emails unchanged
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                {regenerateOption === "all"
                  ? `This will regenerate all ${allGeneratedEmails.length} emails using the same instructions.`
                  : `This will regenerate ${pendingCount} unapproved emails. Your ${approvedCount} approved emails will remain unchanged.`}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegenerateDialog(false)} disabled={isRegenerating}>
              Cancel
            </Button>
            <Button
              onClick={() => handleRegenerateAllEmails(regenerateOption === "unapproved")}
              disabled={isRegenerating || (regenerateOption === "unapproved" && pendingCount === 0)}
            >
              {isRegenerating ? "Regenerating..." : "Regenerate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
