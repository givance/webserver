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
import { Users, Mail, Plus, RefreshCw, FileText, Edit2, Eye, ArrowLeft, ArrowRight } from "lucide-react";
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
  // Props for external button control
  onCanLaunchChange?: (canLaunch: boolean) => void;
  onLaunchHandlerChange?: (handler: (() => void) | null) => void;
}

// Configuration for preview donor count - can be changed later
const PREVIEW_DONOR_COUNT = 50;
const EMAILS_PER_PAGE = 10;
const GENERATE_MORE_COUNT = 50;

interface GeneratedEmail {
  id?: number; // ID from database after saving
  donorId: number;
  subject: string;
  // Legacy format fields (for backward compatibility - optional for new emails)
  structuredContent?: Array<{
    piece: string;
    references: string[];
    addNewlineAfter: boolean;
  }>;
  referenceContexts?: Record<string, string>;
  // New format fields (for new generation)
  emailContent?: string; // Plain text email content
  reasoning?: string; // AI's reasoning for the email generation
  response?: string; // User-facing summary of what was delivered
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
  onCanLaunchChange,
  onLaunchHandlerChange,
}: WriteInstructionStepProps) {
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

  // Batch fetch donor data for all selected donors (memoized to prevent unnecessary calls)
  const { getDonorsQuery } = useDonors();
  const memoizedSelectedDonors = useMemo(() => selectedDonors, [selectedDonors]);
  const { data: donorsData } = getDonorsQuery(memoizedSelectedDonors);
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
  // If we have saved preview donor IDs from database, use those. Otherwise, randomly select new ones.
  const initialPreviewDonors = useMemo(() => {
    if (selectedDonors.length > 0 && initialPreviewDonorIds.length === 0) {
      // Random selection for new campaigns - will be saved to database
      const shuffled = [...selectedDonors].sort(() => 0.5 - Math.random());
      return shuffled.slice(0, Math.min(PREVIEW_DONOR_COUNT, selectedDonors.length));
    }
    return initialPreviewDonorIds; // Use saved preview donor IDs from database
  }, [selectedDonors, initialPreviewDonorIds]);

  // Set preview donors only once when component mounts
  useEffect(() => {
    if (previewDonorIds.length === 0 && initialPreviewDonors.length > 0) {
      setPreviewDonorIds(initialPreviewDonors);
    }
  }, [initialPreviewDonors, previewDonorIds.length]);

  // Save preview donor IDs to database immediately when they're set (for persistence across page reloads)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Only save if these are newly set preview donor IDs (not loaded from database)
    const shouldSave = previewDonorIds.length > 0 && initialPreviewDonorIds.length === 0;

    if (shouldSave && sessionId && campaignName) {
      // Debounce the save operation
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await saveDraft.mutateAsync({
            sessionId,
            campaignName,
            selectedDonorIds: selectedDonors,
            templateId,
            instruction: instruction || "",
            chatHistory: chatMessages,
            previewDonorIds,
          });
          console.log("[WriteInstructionStep] Saved preview donor IDs to database:", previewDonorIds);
        } catch (error) {
          console.error("[WriteInstructionStep] Failed to save preview donor IDs:", error);
        }
      }, 1000);
    }

    // Cleanup function
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [
    previewDonorIds,
    initialPreviewDonorIds.length,
    sessionId,
    campaignName,
    selectedDonors,
    templateId,
    instruction,
    chatMessages,
    saveDraft,
  ]);

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
      saveDraft,
      chatMessages,
      instruction,
      previewDonorIds,
      previousInstruction,
      selectedDonors,
      templateId,
    ]
  );

  // Memoize session data to avoid unnecessary recalculations
  const sessionData = useMemo(
    () => ({
      chatHistory: chatMessages,
      previewDonorIds,
      generatedEmails: allGeneratedEmails,
      referenceContexts,
    }),
    [chatMessages, previewDonorIds, allGeneratedEmails, referenceContexts]
  );

  // Automatically persist session data whenever it changes (with throttling)
  useLayoutEffect(() => {
    if (onSessionDataChange && (chatMessages.length > 0 || allGeneratedEmails.length > 0)) {
      const currentDataString = JSON.stringify({
        chatHistory: sessionData.chatHistory,
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

      // Create the updated chat messages that include the latest user message
      const updatedChatMessages = [...chatMessages, { role: "user" as const, content: finalInstruction }];

      setChatMessages(updatedChatMessages);

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

        console.log("finalInstruction", finalInstruction);
        console.log("updatedChatMessages", updatedChatMessages);

        // Generate emails using the hook with signature - use updatedChatMessages to include the latest user message
        const result = await generateEmails.mutateAsync({
          instruction: finalInstruction,
          donors: donorData,
          organizationName: organization.name,
          organizationWritingInstructions: organization.writingInstructions ?? undefined,
          previousInstruction,
          currentDate, // Pass the current date
          chatHistory: updatedChatMessages, // Pass the updated chat history that includes the latest user message
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
                acc[email.donorId] = email.referenceContexts || {};
                return acc;
              }, {})
            );

            // Save generated emails incrementally if we have a sessionId
            if (sessionId) {
              const savePromises = emailResult.emails.map(async (email) => {
                try {
                  await saveGeneratedEmail.mutateAsync({
                    sessionId,
                    donorId: email.donorId,
                    subject: email.subject,
                    structuredContent: email.structuredContent,
                    referenceContexts: email.referenceContexts,
                    emailContent: email.emailContent,
                    reasoning: email.reasoning,
                    isPreview: true,
                  });
                  return email;
                } catch (error) {
                  console.error(`Failed to save email for donor ${email.donorId}:`, error);
                  return email;
                }
              });

              // Save all emails in parallel
              Promise.all(savePromises).catch((error) => {
                console.error(`Error saving some emails:`, error);
              });
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

            // Auto-switch to preview tab after email generation (removed since no tabs)
            // Preview is now always visible on the right side
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
      previewDonorIds,
      donorsData,
      organization,
      generateEmails,
      onInstructionChange,
      instruction,
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
      !hasAutoGeneratedFromTemplate &&
      !instruction.trim() // Only pre-fill if input is empty
    ) {
      // Only set the instruction, don't auto-generate
      onInstructionChange(templatePrompt);
      setHasAutoGeneratedFromTemplate(true); // Prevent re-setting on re-renders
    }
  }, [templatePrompt, chatMessages.length, hasAutoGeneratedFromTemplate, onInstructionChange, instruction]);

  // Handle generating more emails with the same prompt
  const handleGenerateMore = useCallback(async () => {
    if (isGeneratingMore || !organization) return;

    const finalInstruction = previousInstruction || instruction;
    if (!finalInstruction.trim()) {
      toast.error("No instruction available to generate more emails");
      return;
    }

    // Get donors that haven't been generated yet from the EXISTING preview set + selectedDonors
    // This ensures we maintain the same base set while allowing expansion
    const alreadyGeneratedDonorIds = new Set(allGeneratedEmails.map((email) => email.donorId));

    // First, check if there are any ungenerated donors from the current preview set
    const remainingFromPreview = previewDonorIds.filter((id) => !alreadyGeneratedDonorIds.has(id));

    // If we've exhausted the preview set, we can add more from selectedDonors
    // but we should add them to the preview set permanently to maintain consistency
    let nextBatchDonors: number[] = [];

    if (remainingFromPreview.length > 0) {
      // Use remaining from current preview set first
      nextBatchDonors = remainingFromPreview.slice(0, Math.min(GENERATE_MORE_COUNT, remainingFromPreview.length));
    } else {
      // If preview set is exhausted, add new donors from selectedDonors
      const remainingFromSelected = selectedDonors.filter(
        (id) => !alreadyGeneratedDonorIds.has(id) && !previewDonorIds.includes(id)
      );

      if (remainingFromSelected.length === 0) {
        toast.error("All selected donors have emails generated already");
        return;
      }

      // Take next batch from remaining selected donors (deterministic order, no random selection)
      nextBatchDonors = remainingFromSelected.slice(0, Math.min(GENERATE_MORE_COUNT, remainingFromSelected.length));

      // Add these new donors to the preview set permanently to maintain consistency
      setPreviewDonorIds((prev) => [...prev, ...nextBatchDonors]);
    }

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
        chatHistory: chatMessages, // Use current chat history as no new message is added in generate more
        signature: currentSignature, // Pass the selected signature
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
          newReferenceContexts[email.donorId] = email.referenceContexts || {};
          // Initialize all new emails as pending approval
          newStatuses[email.donorId] = "PENDING_APPROVAL";
        });
        setReferenceContexts(newReferenceContexts);
        setEmailStatuses(newStatuses);

        // Save newly generated emails incrementally if we have a sessionId
        if (sessionId) {
          const savePromises = emailResult.emails.map(async (email) => {
            try {
              await saveGeneratedEmail.mutateAsync({
                sessionId,
                donorId: email.donorId,
                subject: email.subject,
                structuredContent: email.structuredContent,
                referenceContexts: email.referenceContexts,
                emailContent: email.emailContent,
                reasoning: email.reasoning,
                response: email.response,
                isPreview: true,
              });
              return email;
            } catch (error) {
              console.error(`Failed to save email for donor ${email.donorId}:`, error);
              return email;
            }
          });

          // Save all emails in parallel
          Promise.all(savePromises);
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
    previewDonorIds, // Changed from selectedDonors to previewDonorIds
    selectedDonors, // Still need this for expanding the set
    donorsData,
    generateEmails,
    referenceContexts,
    chatMessages,
    saveChatHistory,
    saveGeneratedEmail,
    sessionId,
    emailStatuses,
    currentSignature,
  ]);

  // Handle regenerating all emails with same instructions without affecting chat history
  const handleRegenerateAllEmails = async (onlyUnapproved = false) => {
    if (isRegenerating || !organization) return;

    // Check if there are any generated emails to regenerate
    if (allGeneratedEmails.length === 0) {
      toast.error("No emails to regenerate. Please generate emails first.");
      return;
    }

    setIsRegenerating(true);
    setShowRegenerateDialog(false);

    try {
      // Determine which donors to regenerate - ONLY use donors from currently generated emails
      let donorsToRegenerate: number[] = [];
      let preservedEmails: GeneratedEmail[] = [];
      const preservedStatuses = { ...emailStatuses };
      const preservedContexts = { ...referenceContexts };

      if (onlyUnapproved) {
        // Only regenerate emails for donors with pending approval status from existing generated emails
        donorsToRegenerate = allGeneratedEmails
          .filter((email) => emailStatuses[email.donorId] !== "APPROVED")
          .map((email) => email.donorId);

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
        // For full regeneration, use ALL donors from currently generated emails
        donorsToRegenerate = allGeneratedEmails.map((email) => email.donorId);

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

      // Use the regenerateAllEmails API which handles backend generation and saving
      if (!sessionId) {
        throw new Error("No session ID available for regeneration");
      }

      const result = await regenerateAllEmails.mutateAsync({
        sessionId,
        instruction: "", // Use existing instruction from session
        chatHistory: chatMessages,
      });

      if (result?.success) {
        // Clear local state - data will be refetched automatically via TRPC invalidation
        if (onlyUnapproved) {
          // Keep approved emails in local state until refetch completes
          setAllGeneratedEmails(preservedEmails);
          setGeneratedEmails(preservedEmails);
          setEmailStatuses(preservedStatuses);
          setReferenceContexts(preservedContexts);
        } else {
          // Clear everything for full regeneration
          setAllGeneratedEmails([]);
          setGeneratedEmails([]);
          setReferenceContexts({});
          setEmailStatuses({});
        }

        // Preview is now always visible on the right side (no tab switching needed)

        toast.success(`Successfully started regeneration of emails! Refreshing...`);
      } else {
        throw new Error("Failed to start regeneration");
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

    // Check if we have either generated emails or a meaningful chat history
    if (allGeneratedEmails.length === 0 && chatMessages.length === 0) {
      toast.error("Please generate emails first before launching the campaign.");
      return;
    }

    // If we have no generated emails but have chat history, ensure there's at least one user message
    if (allGeneratedEmails.length === 0 && chatMessages.length > 0) {
      const hasUserMessage = chatMessages.some((msg) => msg.role === "user" && msg.content.trim().length > 0);
      if (!hasUserMessage) {
        toast.error("Please provide instructions and generate emails first.");
        return;
      }
    }

    const currentSessionData = {
      chatHistory: chatMessages,
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
        campaignId: sessionId!, // Required campaignId
        campaignName: campaignName,
        instruction: "", // Empty instruction - chat history will be used instead
        chatHistory: currentSessionData.chatHistory,
        selectedDonorIds: selectedDonors,
        previewDonorIds: currentSessionData.previewDonorIds,
        templateId: templateId,
        signature: currentSignature, // Pass the selected signature
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
  const handleNextClick = useCallback(() => {
    if (generatedEmails.length === 0) {
      toast.error("Please generate emails first before proceeding");
      return;
    }

    // Check if we have meaningful chat history (if no emails generated)
    if (generatedEmails.length === 0 && chatMessages.length === 0) {
      toast.error("Please generate emails first before proceeding.");
      return;
    }

    // Pass session data to parent before showing dialog
    if (onSessionDataChange) {
      onSessionDataChange({
        chatHistory: chatMessages,
        previewDonorIds,
        generatedEmails,
        referenceContexts,
      });
    }

    setShowBulkGenerationDialog(true);
  }, [generatedEmails, chatMessages, onSessionDataChange, previewDonorIds, referenceContexts]);

  // Handle mentions input change
  const handleMentionChange = useCallback(
    (event: any, newValue: string, newPlainTextValue: string, mentions: any[]) => {
      onInstructionChange(newValue);
    },
    [onInstructionChange]
  );

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

  // Check if we can generate more emails - use consistent logic with handleGenerateMore (memoized for performance)
  const {
    alreadyGeneratedDonorIds,
    remainingFromPreview,
    remainingFromSelected,
    totalRemainingDonors,
    canGenerateMore,
  } = useMemo(() => {
    const generatedIds = new Set(allGeneratedEmails.map((email) => email.donorId));
    const remainingPreview = previewDonorIds.filter((id) => !generatedIds.has(id));
    const remainingSelected = selectedDonors.filter((id) => !generatedIds.has(id) && !previewDonorIds.includes(id));
    const totalRemaining = remainingPreview.length + remainingSelected.length;

    return {
      alreadyGeneratedDonorIds: generatedIds,
      remainingFromPreview: remainingPreview,
      remainingFromSelected: remainingSelected,
      totalRemainingDonors: totalRemaining,
      canGenerateMore: totalRemaining > 0,
    };
  }, [allGeneratedEmails, previewDonorIds, selectedDonors]);

  // Count approved vs pending emails (memoized for performance)
  const { approvedCount, pendingCount } = useMemo(() => {
    const statuses = Object.values(emailStatuses);
    return {
      approvedCount: statuses.filter((status) => status === "APPROVED").length,
      pendingCount: statuses.filter((status) => status === "PENDING_APPROVAL").length,
    };
  }, [emailStatuses]);

  // TODO: Add signature refetch functionality for edit mode later

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Compact Navigation Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onBack} size="sm" className="h-7 text-xs">
            <ArrowLeft className="w-3 h-3 mr-1" />
            Back
          </Button>
          <h2 className="text-sm font-medium text-muted-foreground">{campaignName}</h2>
        </div>
        <Button onClick={handleNextClick} disabled={generatedEmails.length === 0 || isGenerating} size="sm" className="h-7 text-xs">
          Launch Campaign
          <ArrowRight className="w-3 h-3 ml-1" />
        </Button>
      </div>

      {/* Main Content - Claude Artifacts Style Layout - Fixed Height */}
      <div className="h-[600px] bg-background border rounded-lg overflow-hidden">
        <div className="h-full grid grid-cols-1 lg:grid-cols-2">
          {/* Left Side - Chat & Generate */}
          <div className="flex flex-col h-full border-r overflow-hidden">
            {/* Chat Messages - Scrollable */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <ScrollArea className="h-full w-full">
                <div className="p-4 space-y-3">
                  {chatMessages.length === 0 ? (
                    <div className="flex items-center justify-center min-h-[300px]">
                      <div className="text-center text-muted-foreground">
                        <div className="w-10 h-10 mx-auto bg-muted rounded-full flex items-center justify-center mb-2">
                          <Mail className="h-5 w-5" />
                        </div>
                        <p className="text-xs font-medium">Start your email generation</p>
                        <p className="text-[10px]">Write instructions below to generate personalized emails</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {chatMessages.map((message, index) => (
                        <div
                          key={index}
                          className={cn("flex flex-col space-y-1", {
                            "items-end": message.role === "user",
                          })}
                        >
                          <div
                            className={cn("rounded-lg px-3 py-2 max-w-[85%]", {
                              "bg-primary text-primary-foreground": message.role === "user",
                              "bg-muted": message.role === "assistant",
                            })}
                          >
                            <p className="text-xs whitespace-pre-wrap">{message.content}</p>
                          </div>
                          {message.role === "assistant" &&
                            suggestedMemories.length > 0 &&
                            index === chatMessages.length - 1 && (
                              <div className="w-full mt-3">
                                <SuggestedMemories memories={suggestedMemories} />
                              </div>
                            )}
                        </div>
                      ))}
                      <div ref={chatEndRef} />
                    </>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Input Area - Fixed at bottom */}
            <div className="border-t bg-background flex-shrink-0">
              {/* Input Box - Scrollable */}
              <div className="max-h-[120px] overflow-y-auto p-4 pb-2">
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
                  className="mentions-input min-h-[60px]"
                  onKeyDown={handleKeyDown}
                  style={{ fontSize: '13px' }}
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
              {/* Buttons - Bottom line */}
              <div className="flex justify-end gap-2 px-4 py-2 border-t">
                <Button
                  onClick={() => setShowRegenerateDialog(true)}
                  disabled={isRegenerating || isGenerating || allGeneratedEmails.length === 0}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1 h-7 text-xs"
                >
                  <RefreshCw className="h-3 w-3" />
                  Regenerate
                </Button>
                <Button
                  onClick={() => handleSubmitInstruction()}
                  disabled={isGenerating || !instruction.trim()}
                  variant="default"
                  size="sm"
                  className="h-7 text-xs"
                >
                  {isGenerating ? "Generating..." : "Generate Emails"}
                </Button>
              </div>
            </div>
          </div>

          {/* Right Side - Email Preview */}
          <div className="flex flex-col h-full bg-muted/5 overflow-hidden">
            {/* Content Area - Independently Scrollable */}
            <div className="h-full overflow-hidden">
              {isGenerating && (
                <div className="flex items-center justify-center h-full text-muted-foreground p-3">
                  <div className="flex flex-col items-center gap-2">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                    <div className="text-center">
                      <p className="text-xs font-medium">Generating personalized emails...</p>
                      <p className="text-xs text-muted-foreground">This may take a few moments</p>
                    </div>
                  </div>
                </div>
              )}
              {!isGenerating && allGeneratedEmails.length > 0 && (
                <div className="h-full overflow-hidden p-3 text-xs [&_button]:text-xs [&_button]:px-2 [&_button]:py-1 [&_button]:h-auto [&_p]:text-xs [&_span]:text-xs [&_div]:text-xs">
                  <EmailListViewer
                    emails={allGeneratedEmails
                      .map((email) => ({
                        ...email,
                        status: emailStatuses[email.donorId] || "PENDING_APPROVAL",
                        emailContent: email.emailContent,
                        reasoning: email.reasoning,
                      }))
                      .sort((a, b) => {
                        // Sort emails by donor name
                        const donorA = donorsData?.find((d) => d.id === a.donorId);
                        const donorB = donorsData?.find((d) => d.id === b.donorId);
                        if (!donorA || !donorB) return 0;
                        const nameA = `${donorA.firstName} ${donorA.lastName}`.toLowerCase();
                        const nameB = `${donorB.firstName} ${donorB.lastName}`.toLowerCase();
                        return nameA.localeCompare(nameB);
                      })}
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
                    showDonorTooltips={true}
                    emailsPerPage={EMAILS_PER_PAGE}
                    maxHeight="100%"
                    emptyStateTitle="No emails generated yet"
                    emptyStateDescription={
                      templatePrompt
                        ? "Generating emails from template..."
                        : "Use the chat interface to generate emails"
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
                            referenceContexts: emailToUpdate.referenceContexts || {},
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
                          chatHistory: chatMessages, // Use current chat history for enhancement context
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
                                      emailContent: enhancedEmail.emailContent,
                                      reasoning: enhancedEmail.reasoning,
                                      referenceContexts: enhancedEmail.referenceContexts,
                                    }
                                  : email
                              )
                            );

                            // If sessionId exists, save the enhanced email to backend
                            if (sessionId && emailToEnhance.id) {
                              try {
                                await updateEmail.mutateAsync({
                                  emailId: emailToEnhance.id,
                                  subject: enhancedEmail.subject,
                                  structuredContent: enhancedEmail.structuredContent || [],
                                  referenceContexts: enhancedEmail.referenceContexts || {},
                                });
                              } catch (error) {
                                console.error("Failed to save enhanced email to backend:", error);
                              }
                            }

                            toast.success("Email enhanced successfully!");
                          }
                        }
                      } catch (error) {
                        console.error("Error enhancing email:", error);
                        toast.error("Failed to enhance email. Please try again.");
                      }
                    }}
                    isGeneratingMore={isGeneratingMore}
                    remainingDonorsCount={totalRemainingDonors}
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
              )}
              {!isGenerating && allGeneratedEmails.length === 0 && (
                <div className="flex items-center justify-center h-full text-muted-foreground p-3">
                  <div className="text-center space-y-2">
                    <div className="w-10 h-10 mx-auto bg-muted rounded-full flex items-center justify-center">
                      <Mail className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-medium">No emails generated yet</p>
                      <p className="text-xs text-muted-foreground">
                        {templatePrompt
                          ? "Generating emails from template..."
                          : "Use the chat interface on the left to generate emails"}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bulk Generation Confirmation Dialog */}
      <Dialog open={showBulkGenerationDialog} onOpenChange={setShowBulkGenerationDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Confirm Campaign Launch
            </DialogTitle>
            <DialogDescription className="text-sm">
              You&apos;re about to launch a campaign to generate personalized emails for all selected donors based on
              your current instruction.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* Summary Card - more compact */}
            <div className="p-3 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-3 w-3" />
                <span className="text-sm font-medium">Campaign Summary</span>
              </div>
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
                  <p className="text-lg font-bold text-blue-600">{selectedDonors.length - allGeneratedEmails.length}</p>
                  <p className="text-xs text-muted-foreground">new emails</p>
                </div>
              </div>

              {selectedSignatureType !== "none" && currentSignature && (
                <div className="space-y-2 mt-3">
                  <p className="text-xs font-medium">Selected Signature</p>
                  <div className="bg-muted rounded p-2">
                    <div
                      className="prose prose-sm max-w-none text-xs"
                      dangerouslySetInnerHTML={{
                        __html:
                          currentSignature.length > 150 ? currentSignature.substring(0, 150) + "..." : currentSignature,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-800">
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
              size="sm"
            >
              Cancel
            </Button>
            <Button onClick={handleBulkGeneration} disabled={isStartingBulkGeneration} size="sm">
              {isStartingBulkGeneration ? "Launching..." : "Launch Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Regenerate Confirmation Dialog - more compact */}
      <Dialog open={showRegenerateDialog} onOpenChange={setShowRegenerateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Regenerate Emails
            </DialogTitle>
            <DialogDescription className="text-sm">Choose which emails you want to regenerate</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-sm">Regeneration Options</Label>
              <div className="space-y-2">
                <div
                  className={cn(
                    "flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-colors",
                    regenerateOption === "all" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                  )}
                  onClick={() => setRegenerateOption("all")}
                >
                  <input
                    type="radio"
                    checked={regenerateOption === "all"}
                    onChange={() => setRegenerateOption("all")}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium">Regenerate ALL emails ({allGeneratedEmails.length} total)</div>
                    <div className="text-xs text-muted-foreground">This will replace all existing emails</div>
                  </div>
                </div>

                <div
                  className={cn(
                    "flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-colors",
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
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium">Regenerate only unapproved emails ({pendingCount} emails)</div>
                    <div className="text-xs text-muted-foreground">
                      Keep your {approvedCount} approved emails unchanged
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-800">
                {regenerateOption === "all"
                  ? `This will regenerate all ${allGeneratedEmails.length} emails using the same instructions.`
                  : `This will regenerate ${pendingCount} unapproved emails. Your ${approvedCount} approved emails will remain unchanged.`}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRegenerateDialog(false)}
              disabled={isRegenerating}
              size="sm"
            >
              Cancel
            </Button>
            <Button
              onClick={() => handleRegenerateAllEmails(regenerateOption === "unapproved")}
              disabled={isRegenerating}
              size="sm"
            >
              {isRegenerating ? "Regenerating..." : "Regenerate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
