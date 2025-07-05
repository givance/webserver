"use client";

import { useCommunications } from "@/app/hooks/use-communications";
import { useDonors } from "@/app/hooks/use-donors";
import { useOrganization } from "@/app/hooks/use-organization";
import { useProjects } from "@/app/hooks/use-projects";
import { useStaff } from "@/app/hooks/use-staff";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import { ArrowLeft, ArrowRight, RefreshCw, MessageSquare, X } from "lucide-react";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import "../styles.css";

// Import extracted components, hooks, and types
import {
  WriteInstructionStepProps,
  IsolatedMentionsInput,
  BulkGenerationDialog,
  RegenerateDialog,
  ChatInterface,
  EmailPreviewPanel,
  useWriteInstructionStep,
  useDonorUtils,
} from "./write-instruction-step";

function WriteInstructionStepComponent(props: WriteInstructionStepProps) {
  const {
    instruction,
    onInstructionChange,
    onBack,
    selectedDonors,
    onSessionDataChange,
    templatePrompt,
    initialChatHistory = [],
    initialGeneratedEmails = [],
    initialPreviewDonorIds = [],
    campaignName,
    templateId,
    onBulkGenerationComplete,
    editMode = false,
    sessionId,
    initialRefinedInstruction,
  } = props;


  // UI State
  const [showBulkGenerationDialog, setShowBulkGenerationDialog] = useState(false);
  const [isStartingBulkGeneration, setIsStartingBulkGeneration] = useState(false);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [regenerateOption, setRegenerateOption] = useState<"all" | "unapproved">("all");
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [isEmailListExpanded, setIsEmailListExpanded] = useState(false);
  const [previousInstruction, setPreviousInstruction] = useState<string | undefined>(
    initialRefinedInstruction || (editMode && instruction ? instruction : undefined)
  );

  // Signature state (simplified)
  const [selectedSignatureType, setSelectedSignatureType] = useState<"none" | "custom" | "staff">("none");
  const [customSignature, setCustomSignature] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);

  // Consolidated hook
  const {
    emailGeneration,
    emailState,
    chatState,
    instructionInput,
    previewDonors,
  } = useWriteInstructionStep(
    initialGeneratedEmails,
    editMode,
    initialChatHistory,
    sessionId,
    campaignName,
    selectedDonors,
    templateId,
    instruction,
    onInstructionChange,
    templatePrompt,
    initialPreviewDonorIds
  );

  // Data hooks
  const { getOrganization } = useOrganization();
  const { launchCampaign, updateEmailStatus, regenerateAllEmails } = useCommunications();
  const { listProjects } = useProjects();
  const { listStaff, getPrimaryStaff } = useStaff();
  const { userId } = useAuth();
  const { getDonorsQuery } = useDonors();

  // Data fetching
  const memoizedSelectedDonors = useMemo(() => selectedDonors, [selectedDonors]);
  const { data: donorsData } = getDonorsQuery(memoizedSelectedDonors);
  const { data: organization } = getOrganization();
  const { data: staffData } = listStaff({ limit: 100, isRealPerson: true });
  const { data: primaryStaff } = getPrimaryStaff();
  const { data: projectsData, isLoading: isLoadingProjects } = listProjects({ active: true, limit: 100 });

  // Computed values
  const projectMentions = useMemo(() => {
    if (!projectsData?.projects) return [];
    return projectsData.projects.map((project) => ({
      id: project.id.toString(),
      display: project.name,
    }));
  }, [projectsData]);

  const selectedStaff = useMemo(() => {
    if (!selectedStaffId || !staffData?.staff) return null;
    return staffData.staff.find((staff) => staff.id === selectedStaffId) || null;
  }, [selectedStaffId, staffData]);

  const currentSignature = useMemo(() => {
    switch (selectedSignatureType) {
      case "custom": return customSignature;
      case "staff": return selectedStaff?.signature || `Best,\n${selectedStaff?.firstName || "Staff"}`;
      default: return "";
    }
  }, [selectedSignatureType, customSignature, selectedStaff]);

  const donorUtils = useDonorUtils(donorsData || []);

  const mentionsInputPlaceholder = useMemo(() => {
    if (isLoadingProjects) return "Loading projects...";
    if (projectMentions.length > 0) {
      return `Enter instructions... (Type @ for ${projectMentions.length} projects). Cmd/Ctrl + Enter to send.`;
    }
    return "Enter your instructions... Press Cmd/Ctrl + Enter to send.";
  }, [isLoadingProjects, projectMentions.length]);

  const sessionData = useMemo(() => ({
    chatHistory: chatState.chatMessages,
    previewDonorIds: previewDonors.previewDonorIds,
    generatedEmails: emailState.allGeneratedEmails,
    referenceContexts: emailState.referenceContexts,
  }), [chatState.chatMessages, previewDonors.previewDonorIds, emailState.allGeneratedEmails, emailState.referenceContexts]);

  // Handlers (using dynamic imports to reduce bundle size)
  const handleSubmitInstruction = useCallback(async (instructionToSubmit?: string) => {
    const { createEmailGenerationHandlers } = await import("./write-instruction-step/handlers");
    const handlers = createEmailGenerationHandlers(
      emailGeneration,
      emailState,
      chatState,
      previewDonors,
      instructionInput,
      donorsData || [],
      organization,
      previousInstruction,
      currentSignature,
      sessionId,
      onInstructionChange
    );
    
    const { handleEmailResult } = await import("./write-instruction-step/handlers/emailResultHandler");
    await handlers.handleSubmitInstruction(instructionToSubmit);
    setIsChatCollapsed(true);
    setIsEmailListExpanded(true);
  }, [
    emailGeneration, emailState, chatState, previewDonors, instructionInput, 
    donorsData, organization, previousInstruction, currentSignature, sessionId, onInstructionChange
  ]);

  const handleBulkGeneration = async () => {
    if (isStartingBulkGeneration || !userId) return;
    if (emailState.allGeneratedEmails.length === 0 && chatState.chatMessages.length === 0) {
      toast.error("Please generate emails first before launching the campaign.");
      return;
    }

    setIsStartingBulkGeneration(true);
    try {
      const response = await launchCampaign.mutateAsync({
        campaignId: sessionId!,
        campaignName,
        instruction: "",
        chatHistory: chatState.chatMessages,
        selectedDonorIds: selectedDonors,
        previewDonorIds: previewDonors.previewDonorIds,
        templateId,
        signature: currentSignature,
      });

      if (!response?.sessionId) throw new Error("Failed to launch campaign");

      toast.success(editMode ? "Campaign updated and launched!" : "Campaign launched!");
      setShowBulkGenerationDialog(false);
      setTimeout(() => onBulkGenerationComplete(response.sessionId), 1000);
    } catch (error) {
      console.error("Error starting bulk generation:", error);
      toast.error("Failed to start bulk generation");
    } finally {
      setIsStartingBulkGeneration(false);
    }
  };

  const handleNextClick = useCallback(() => {
    if (emailState.generatedEmails.length === 0) {
      toast.error("Please generate emails first before proceeding");
      return;
    }
    onSessionDataChange?.(sessionData);
    setShowBulkGenerationDialog(true);
  }, [emailState.generatedEmails, onSessionDataChange, sessionData]);

  const handleEmailStatusChange = useCallback(async (emailId: number, status: "PENDING_APPROVAL" | "APPROVED") => {
    const { createEmailGenerationHandlers } = await import("./write-instruction-step/handlers");
    const handlers = createEmailGenerationHandlers(
      emailGeneration, emailState, chatState, previewDonors, instructionInput,
      donorsData || [], organization, previousInstruction, currentSignature, sessionId, onInstructionChange
    );
    await handlers.handleEmailStatusChange(emailId, status, updateEmailStatus);
  }, [emailGeneration, emailState, chatState, previewDonors, instructionInput, donorsData, organization, previousInstruction, currentSignature, sessionId, onInstructionChange, updateEmailStatus]);

  const handleRegenerateEmails = useCallback(async (onlyUnapproved: boolean) => {
    const { createEmailGenerationHandlers } = await import("./write-instruction-step/handlers");
    const handlers = createEmailGenerationHandlers(
      emailGeneration, emailState, chatState, previewDonors, instructionInput,
      donorsData || [], organization, previousInstruction, currentSignature, sessionId, onInstructionChange
    );
    await handlers.handleRegenerateEmails(onlyUnapproved, regenerateAllEmails);
  }, [emailGeneration, emailState, chatState, previewDonors, instructionInput, donorsData, organization, previousInstruction, currentSignature, sessionId, onInstructionChange, regenerateAllEmails]);

  const emailListViewerEmails = useMemo(() => {
    return emailState.allGeneratedEmails
      .map((email) => ({
        ...email,
        status: emailState.emailStatuses[email.donorId] || "PENDING_APPROVAL",
        emailContent: email.emailContent,
        reasoning: email.reasoning,
      }))
      .sort((a, b) => {
        const donorA = donorsData?.find((d) => d.id === a.donorId);
        const donorB = donorsData?.find((d) => d.id === b.donorId);
        if (!donorA || !donorB) return 0;
        const nameA = `${donorA.firstName} ${donorA.lastName}`.toLowerCase();
        const nameB = `${donorB.firstName} ${donorB.lastName}`.toLowerCase();
        return nameA.localeCompare(nameB);
      });
  }, [emailState.allGeneratedEmails, emailState.emailStatuses, donorsData]);

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onBack} size="sm" className="h-7 text-xs">
            <ArrowLeft className="w-3 h-3 mr-1" />
            Back
          </Button>
          {emailState.allGeneratedEmails.length > 0 && (
            <Button
              onClick={() => {
                const newChatCollapsed = !isChatCollapsed;
                setIsChatCollapsed(newChatCollapsed);
                setIsEmailListExpanded(newChatCollapsed);
              }}
              variant="outline"
              size="sm"
              className="h-7 text-xs"
            >
              {isChatCollapsed ? (
                <>
                  <MessageSquare className="h-3 w-3 mr-1" />
                  Show Chat
                </>
              ) : (
                <>
                  <X className="h-3 w-3 mr-1" />
                  Hide Chat
                </>
              )}
            </Button>
          )}
        </div>
        <Button
          onClick={handleNextClick}
          disabled={emailState.generatedEmails.length === 0 || emailGeneration.isGenerating}
          size="sm"
          className="h-7 text-xs"
        >
          Launch Campaign
          <ArrowRight className="w-3 h-3 ml-1" />
        </Button>
      </div>

      {/* Main Content */}
      <div className="h-[600px] bg-background border rounded-lg overflow-hidden">
        <div className="h-full flex">
          {/* Chat Side */}
          <div className={cn(
            "flex flex-col h-full border-r overflow-hidden transition-all duration-300 ease-in-out",
            isChatCollapsed ? "w-0 opacity-0" : "w-full lg:w-1/2"
          )}>
            <div className="flex-1 min-h-0 overflow-hidden">
              <ChatInterface
                chatMessages={chatState.chatMessages}
                suggestedMemories={chatState.suggestedMemories}
                isChatCollapsed={isChatCollapsed}
                chatEndRef={chatState.chatEndRef}
              />
            </div>

            <div className={cn(
              "border-t bg-background flex-shrink-0 transition-all duration-300 ease-in-out",
              isChatCollapsed && "opacity-0 pointer-events-none"
            )}>
              <IsolatedMentionsInput
                initialValue={instructionInput.localInstruction}
                placeholder={mentionsInputPlaceholder}
                projectMentions={projectMentions}
                onSubmit={handleSubmitInstruction}
                onValueChange={instructionInput.handleInstructionValueChange}
                isGenerating={emailGeneration.isGenerating}
                onKeyDown={() => {}}
              />
              <div className="flex justify-end gap-2 px-4 py-2 border-t">
                <Button
                  onClick={() => setShowRegenerateDialog(true)}
                  disabled={emailGeneration.isRegenerating || emailGeneration.isGenerating || emailState.allGeneratedEmails.length === 0}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1 h-7 text-xs"
                >
                  <RefreshCw className="h-3 w-3" />
                  Regenerate
                </Button>
                <Button
                  onClick={() => handleSubmitInstruction()}
                  disabled={emailGeneration.isGenerating || !instructionInput.hasInputContent}
                  variant="default"
                  size="sm"
                  className="h-7 text-xs"
                >
                  {emailGeneration.isGenerating ? "Generating..." : "Generate Emails"}
                </Button>
              </div>
            </div>
          </div>

          {/* Email Preview Side */}
          <div className={cn(
            "flex flex-col h-full bg-muted/5 overflow-hidden relative transition-all duration-300 ease-in-out",
            isChatCollapsed ? "flex-1" : "flex-1 lg:w-1/2"
          )}>
            <div className="h-full overflow-hidden">
              <EmailPreviewPanel
                isGenerating={emailGeneration.isGenerating}
                allGeneratedEmails={emailState.allGeneratedEmails}
                templatePrompt={props.templatePrompt}
                emailListViewerEmails={emailListViewerEmails}
                emailListViewerDonors={donorUtils.emailListViewerDonors}
                referenceContexts={emailState.referenceContexts}
                handleEmailStatusChange={handleEmailStatusChange}
                isUpdatingStatus={emailState.isUpdatingStatus}
                sessionId={sessionId}
                handlePreviewEdit={async () => {}}
                handlePreviewEnhance={async () => {}}
                isGeneratingMore={emailGeneration.isGeneratingMore}
                totalRemainingDonors={previewDonors.totalRemainingDonors}
                isEmailListExpanded={isEmailListExpanded}
                setIsEmailListExpanded={setIsEmailListExpanded}
                staffData={staffData}
                primaryStaff={primaryStaff}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <BulkGenerationDialog
        open={showBulkGenerationDialog}
        onOpenChange={setShowBulkGenerationDialog}
        selectedDonorsCount={selectedDonors.length}
        allGeneratedEmails={emailState.allGeneratedEmails}
        approvedCount={emailState.approvedCount}
        pendingCount={emailState.pendingCount}
        selectedSignatureType={selectedSignatureType}
        currentSignature={currentSignature}
        isStartingBulkGeneration={isStartingBulkGeneration}
        onConfirm={handleBulkGeneration}
      />

      <RegenerateDialog
        open={showRegenerateDialog}
        onOpenChange={setShowRegenerateDialog}
        regenerateOption={regenerateOption}
        onRegenerateOptionChange={setRegenerateOption}
        allGeneratedEmailsCount={emailState.allGeneratedEmails.length}
        approvedCount={emailState.approvedCount}
        pendingCount={emailState.pendingCount}
        isRegenerating={emailGeneration.isRegenerating}
        onConfirm={async (onlyUnapproved: boolean) => {
          await handleRegenerateEmails(onlyUnapproved);
          setShowRegenerateDialog(false);
        }}
      />
    </div>
  );
}

const arePropsEqual = (prevProps: WriteInstructionStepProps, nextProps: WriteInstructionStepProps): boolean => {
  return (
    prevProps.sessionId === nextProps.sessionId &&
    prevProps.editMode === nextProps.editMode &&
    prevProps.selectedDonors === nextProps.selectedDonors &&
    prevProps.initialGeneratedEmails === nextProps.initialGeneratedEmails
  );
};

export const WriteInstructionStep = React.memo(WriteInstructionStepComponent, arePropsEqual);