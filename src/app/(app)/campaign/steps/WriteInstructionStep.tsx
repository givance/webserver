'use client';

import { useCommunications } from '@/app/hooks/use-communications';
import { useDonors } from '@/app/hooks/use-donors';
import { useOrganization } from '@/app/hooks/use-organization';
import { useProjects } from '@/app/hooks/use-projects';
import { useStaff } from '@/app/hooks/use-staff';
import { useEmailReview } from '@/app/hooks/use-email-review';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@clerk/nextjs';
import { ArrowLeft, ArrowRight, MessageSquare, RefreshCw, X } from 'lucide-react';
import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { toast } from 'sonner';
import '../styles.css';
import {
  handleEmailStatusChange,
  handleGenerateMore,
  handleRegenerateEmails,
  handleSubmitInstruction,
} from './write-instruction-step/handlers';
import { processEmailResult } from './write-instruction-step/handlers/emailResultHandler';
import {
  clearEmailState,
  clearEmailStateForRegeneration,
  updateEmailStateWithNewEmails,
  updateChatStateWithNewMessage,
  setEmailGenerationLoading,
  clearInstructionInput,
  updateEmailStatus as updateEmailStatusInState,
} from './write-instruction-step/utils/stateManagement';

// Import extracted components, hooks, and types
import {
  BulkGenerationDialog,
  ChatInterface,
  EmailPreviewPanel,
  IsolatedMentionsInput,
  RegenerateDialog,
  useDonorUtils,
  useWriteInstructionStep,
  WriteInstructionStepProps,
} from './write-instruction-step';
import { GENERATE_MORE_COUNT } from './write-instruction-step/constants';

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
  const [regenerateOption, setRegenerateOption] = useState<'all' | 'unapproved'>('all');
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [isEmailListExpanded, setIsEmailListExpanded] = useState(false);
  const [previousInstruction, setPreviousInstruction] = useState<string | undefined>(
    initialRefinedInstruction || (editMode && instruction ? instruction : undefined)
  );

  // Signature state (simplified)
  const [customSignature, setCustomSignature] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);

  // Consolidated hook
  const { emailGeneration, emailState, chatState, instructionInput, donorState } =
    useWriteInstructionStep(
      initialGeneratedEmails,
      editMode,
      initialChatHistory,
      sessionId,
      campaignName,
      selectedDonors,
      templateId,
      instruction,
      onInstructionChange,
      templatePrompt
    );

  // Data hooks
  const { getOrganization } = useOrganization();
  const {
    launchCampaign,
    updateEmailStatus,
    smartEmailGeneration,
    smartEmailGenerationStream,
    getSession,
  } = useCommunications();
  const { listProjects } = useProjects();
  const { listStaff, getPrimaryStaff } = useStaff();
  const { userId } = useAuth();
  const { getDonorsQuery } = useDonors();
  const { reviewEmails } = useEmailReview();

  // State to trigger email review after generation
  const [emailsToReview, setEmailsToReview] = useState<number[]>([]);

  // Data fetching
  const memoizedSelectedDonors = useMemo(() => selectedDonors, [selectedDonors]);
  const { data: donorsData } = getDonorsQuery(memoizedSelectedDonors);
  const { data: organization } = getOrganization();
  const { data: staffData } = listStaff({ limit: 100, isRealPerson: true });
  const { data: primaryStaff } = getPrimaryStaff();
  const { data: projectsData, isLoading: isLoadingProjects } = listProjects({
    active: true,
    limit: 100,
  });

  // Query session data for email review
  const { data: sessionDataForReview, refetch: refetchSession } = getSession(
    { sessionId: sessionId! },
    {
      enabled: false, // We'll manually refetch when needed
      staleTime: 0, // Always fetch fresh data
      cacheTime: 0, // Don't cache
      refetchOnMount: false,
      onSuccess: (data: any) => {
        console.log('📦 SESSION DATA FETCHED:', {
          hasData: !!data,
          generatedEmailsCount: data?.emails?.length || 0,
          firstEmail: data?.emails?.[0],
          dataStructure: data ? Object.keys(data) : 'no data',
        });
      },
      onError: (error: any) => {
        console.error('❌ Failed to fetch session data:', error);
      },
    }
  );

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
    return selectedStaff?.signature || `Best,\n${selectedStaff?.firstName || 'Staff'}`;
  }, [selectedStaff]);

  const donorUtils = useDonorUtils(donorsData || []);

  const mentionsInputPlaceholder = useMemo(() => {
    if (isLoadingProjects) return 'Loading projects...';
    if (projectMentions.length > 0) {
      return `Enter instructions... (Type @ for ${projectMentions.length} projects). Cmd/Ctrl + Enter to send.`;
    }
    return 'Enter your instructions... Press Cmd/Ctrl + Enter to send.';
  }, [isLoadingProjects, projectMentions.length]);

  const sessionData = useMemo(
    () => ({
      chatHistory: chatState.chatMessages,
      generatedEmails: emailState.allGeneratedEmails,
      referenceContexts: emailState.referenceContexts,
    }),
    [chatState.chatMessages, emailState.allGeneratedEmails, emailState.referenceContexts]
  );

  // Handlers (refactored to use individual stateless functions)
  const handleSubmitInstructionCallback = useCallback(
    async (instructionToSubmit?: string) => {
      // Get the instruction value before clearing
      const finalInstruction = instructionToSubmit || instructionInput.localInstruction;

      // Add user message to chat FIRST
      chatState.setChatMessages((prev) => [
        ...prev,
        {
          role: 'user' as const,
          content: finalInstruction,
        },
      ]);

      // Clear input immediately - both local and parent
      clearInstructionInput(instructionInput);
      onInstructionChange(''); // Explicitly clear parent state too

      // Set loading state
      setEmailGenerationLoading(emailGeneration, 'generating', true);

      // Clear existing email state
      clearEmailState(emailState, chatState);

      // Track if streaming was used
      let streamingWasUsed = false;

      try {
        const response = await handleSubmitInstruction(
          {
            emailGeneration,
            emailState,
            chatState,
            instructionInput,
            organization,
            donorsData: donorsData || [],
            currentSignature,
            sessionId,
            previousInstruction,
            onInstructionChange,
            smartEmailGenerationStream,
            onStreamUpdate: async (update) => {
              // Mark that streaming was used
              streamingWasUsed = true;

              // Update streaming status
              emailGeneration.setStreamingStatus(update.status);

              // Handle different statuses
              if (update.status === 'generated' && update.result) {
                // Step 2: Show generated emails
                console.log('📧 Emails generated via streaming, updating UI...');

                // Refetch session to get the generated emails
                if (sessionId) {
                  const sessionResult = await refetchSession();
                  if (sessionResult.data?.emails && sessionResult.data.emails.length > 0) {
                    // Update email state with the fetched emails
                    updateEmailStateWithNewEmails(
                      emailState,
                      sessionResult.data.emails.map((email) => ({
                        ...email,
                        referenceContexts:
                          (email.referenceContexts as Record<string, string>) || {},
                        emailContent: email.emailContent || undefined,
                        reasoning: email.reasoning || undefined,
                        response: email.response || undefined,
                      })),
                      false // Replace existing emails, don't append
                    );
                  }
                }
              } else if (update.status === 'refined' && update.result) {
                // Step 4: Replace with refined emails (for now, same emails)
                console.log('✨ Emails refined via streaming, updating UI...');

                // Refetch session again to simulate refinement
                if (sessionId) {
                  const sessionResult = await refetchSession();
                  if (sessionResult.data?.emails && sessionResult.data.emails.length > 0) {
                    // Replace email state with the refined emails
                    updateEmailStateWithNewEmails(
                      emailState,
                      sessionResult.data.emails.map((email) => ({
                        ...email,
                        referenceContexts:
                          (email.referenceContexts as Record<string, string>) || {},
                        emailContent: email.emailContent || undefined,
                        reasoning: email.reasoning || undefined,
                        response: email.response || undefined,
                      })),
                      false // Replace existing emails, don't append
                    );
                  }
                }
              }
            },
          },
          finalInstruction
        );

        console.log('📝 RAW RESPONSE FROM HANDLE SUBMIT:', {
          response,
          responseKeys: Object.keys(response),
          resultKeys: response.result ? Object.keys(response.result) : 'no result',
        });

        if (response.success && response.result) {
          // Skip normal processing if streaming was used, as updates were handled in streaming callbacks
          if (streamingWasUsed) {
            console.log('📡 Streaming was used, skipping normal result processing');
            // Only update chat history with the assistant response
            const processedResult = processEmailResult(response.result);
            if (processedResult.type === 'email' && processedResult.emailResult) {
              const { responseMessage } = processedResult.emailResult;
              chatState.setChatMessages((prev) => [
                ...prev,
                {
                  role: 'assistant' as const,
                  content: responseMessage,
                },
              ]);
            }
          } else {
            // Process the result and update state (normal flow)
            const processedResult = processEmailResult(response.result);

            if (processedResult.type === 'agentic' && processedResult.agenticResult) {
              // Handle agentic flow - add only the assistant's response
              const assistantMessages = processedResult.agenticResult!.conversationMessages.filter(
                (msg) => msg.role === 'assistant'
              );
              if (assistantMessages.length > 0) {
                chatState.setChatMessages((prev) => [
                  ...prev,
                  assistantMessages[assistantMessages.length - 1],
                ]);
              }
            } else if (processedResult.type === 'email' && processedResult.emailResult) {
              // Handle email generation
              const { emails, refinedInstruction, updatedChatMessages, responseMessage } =
                processedResult.emailResult;

              console.log('📧 EMAIL GENERATION RESULT:', {
                type: processedResult.type,
                emailCount: emails?.length || 0,
                hasEmails: !!emails && emails.length > 0,
                sessionId: sessionId,
                fullResult: processedResult,
                rawResponse: response,
              });

              // Add assistant's response to our existing chat
              chatState.setChatMessages((prev) => {
                const newMessages = [
                  ...prev,
                  {
                    role: 'assistant' as const,
                    content: responseMessage,
                  },
                ];
                // Save chat history immediately without setTimeout to avoid race conditions
                chatState.saveChatHistory(newMessages, refinedInstruction);
                return newMessages;
              });

              // Update email state
              updateEmailStateWithNewEmails(emailState, emails);

              // Only collapse chat if emails were actually generated
              if (
                processedResult.emailResult?.emails &&
                processedResult.emailResult.emails.length > 0
              ) {
                setIsChatCollapsed(true);
                setIsEmailListExpanded(true);
              }

              // Trigger email review after generation
              // processedResult.type will be 'email' (from processEmailResult) when emails are generated
              // processedResult.type will be 'agentic' when in agentic flow (no emails)
              // We trigger review when type is 'email' even if the emails array is empty
              // because emails are saved on backend but not returned in response

              console.log('🔍 REVIEW CHECK:', {
                hasSessionId: !!sessionId,
                sessionId: sessionId,
                processedResultType: processedResult.type,
                hasEmailResult: !!processedResult.emailResult,
                isAgenticResult: !!processedResult.agenticResult,
                shouldTriggerReview: sessionId && processedResult.type === 'email',
              });

              // Trigger review if we have a session and this is email generation (not agentic)
              if (sessionId && processedResult.type === 'email') {
                console.log(
                  '✅ Email generation complete (emails saved on backend), triggering review'
                );
                console.log('⏰ Setting timeout to trigger review...');
                // Trigger the session query which will fetch email IDs and review them
                setTimeout(async () => {
                  console.log('🚀 TRIGGERING REVIEW NOW');
                  console.log('🔄 Refetching session data...');
                  const sessionResult = await refetchSession();
                  console.log('📦 Refetch result:', {
                    success: sessionResult.isSuccess,
                    hasData: !!sessionResult.data,
                    emailCount: sessionResult.data?.emails?.length || 0,
                  });

                  if (sessionResult.data?.emails && sessionResult.data.emails.length > 0) {
                    const emailIds = sessionResult.data.emails
                      .map((email: any) => email.id)
                      .filter((id: any) => id !== undefined);

                    console.log('🎯 Directly calling review with email IDs:', emailIds);
                    if (emailIds.length > 0) {
                      try {
                        const reviewResult = await reviewEmails({ emailIds });
                        console.log('✅ Email review completed successfully:', reviewResult);
                      } catch (error) {
                        console.error('❌ Error reviewing emails:', error);
                      }
                    }
                  }
                }, 1000); // Small delay to ensure emails are saved
              } else {
                console.log('❌ NOT triggering review:', {
                  reason: !sessionId ? 'No sessionId' : 'Agentic flow - no emails yet',
                });
              }
            }
          } // End of normal processing else block
        } else {
          // Handle error
          toast.error(response.error || 'Failed to generate emails');
        }
      } catch (error) {
        console.error('Error in handleSubmitInstructionCallback:', error);
        toast.error('An unexpected error occurred');
      } finally {
        setEmailGenerationLoading(emailGeneration, 'generating', false);
        // Reset streaming status
        emailGeneration.setStreamingStatus('idle');
      }
    },
    [
      emailGeneration,
      emailState,
      chatState,
      instructionInput,
      donorsData,
      organization,
      previousInstruction,
      currentSignature,
      sessionId,
      onInstructionChange,
      reviewEmails,
      refetchSession,
      smartEmailGenerationStream,
    ]
  );

  const handleBulkGeneration = async () => {
    if (isStartingBulkGeneration || !userId) return;
    if (emailState.allGeneratedEmails.length === 0 && chatState.chatMessages.length === 0) {
      toast.error('Please generate emails first before launching the campaign.');
      return;
    }

    setIsStartingBulkGeneration(true);
    try {
      const response = await launchCampaign({
        campaignId: sessionId!,
        campaignName,
        chatHistory: chatState.chatMessages,
        selectedDonorIds: selectedDonors,
        templateId,
        signature: currentSignature,
      });

      if (!response?.sessionId) throw new Error('Failed to launch campaign');

      toast.success(editMode ? 'Campaign updated and launched!' : 'Campaign launched!');
      setShowBulkGenerationDialog(false);
      setTimeout(() => onBulkGenerationComplete(response.sessionId), 1000);
    } catch (error) {
      console.error('Error starting bulk generation:', error);
      toast.error('Failed to start bulk generation');
    } finally {
      setIsStartingBulkGeneration(false);
    }
  };

  const handleNextClick = useCallback(() => {
    if (emailState.generatedEmails.length === 0) {
      toast.error('Please generate emails first before proceeding');
      return;
    }
    onSessionDataChange?.(sessionData);
    setShowBulkGenerationDialog(true);
  }, [emailState.generatedEmails, onSessionDataChange, sessionData]);

  const handlePreviewEditCallback = useCallback(
    (
      donorId: number,
      newSubject: string,
      newContent: Array<{ piece: string; references: string[]; addNewlineAfter: boolean }>
    ) => {
      // For preview mode, we need to update the local state without calling the backend
      // Find the email in the state and update it
      const emailIndex = emailState.allGeneratedEmails.findIndex(
        (email) => email.donorId === donorId
      );
      if (emailIndex !== -1) {
        const updatedEmails = [...emailState.allGeneratedEmails];
        updatedEmails[emailIndex] = {
          ...updatedEmails[emailIndex],
          subject: newSubject,
          structuredContent: newContent,
        };
        emailState.setAllGeneratedEmails(updatedEmails);
        toast.success('Email updated successfully');
      }
    },
    [emailState]
  );

  const handlePreviewEnhanceCallback = useCallback(
    async (donorId: number, enhanceInstruction: string) => {
      // For preview mode, we can use the smartEmailGeneration API with generate_with_new_message mode
      // if we have a sessionId, otherwise we show a message that enhancement is not available
      if (!sessionId) {
        toast.error('Enhancement not available in preview mode');
        return;
      }

      try {
        setEmailGenerationLoading(emailGeneration, 'generating', true);

        const response = await smartEmailGeneration({
          sessionId,
          mode: 'generate_with_new_message',
          newMessage: enhanceInstruction,
        });

        if (response.success) {
          toast.success('Email enhanced successfully');
          // The cache invalidation should trigger a refresh of the data
        } else {
          toast.error('Failed to enhance email');
        }
      } catch (error) {
        console.error('Error enhancing email:', error);
        toast.error('Failed to enhance email');
      } finally {
        setEmailGenerationLoading(emailGeneration, 'generating', false);
        // Reset streaming status
        emailGeneration.setStreamingStatus('idle');
      }
    },
    [sessionId, emailGeneration, smartEmailGeneration]
  );

  const handleEmailStatusChangeCallback = useCallback(
    async (emailId: number, status: 'PENDING_APPROVAL' | 'APPROVED') => {
      // Set loading state
      emailState.setIsUpdatingStatus(true);

      try {
        const response = await handleEmailStatusChange(
          { emailState, sessionId },
          emailId,
          status,
          updateEmailStatus
        );

        if (response.success) {
          // Update state based on response
          if (response.isPreviewMode) {
            updateEmailStatusInState(emailState, emailId, status);
          } else if (response.donorId) {
            updateEmailStatusInState(emailState, response.donorId, status);
          }

          // Show success message
          toast.success(status === 'APPROVED' ? 'Email approved' : 'Email marked as pending');
        } else {
          // Handle error
          toast.error(response.error || 'Failed to update email status');
        }
      } catch (error) {
        console.error('Error in handleEmailStatusChangeCallback:', error);
        toast.error('An unexpected error occurred');
      } finally {
        emailState.setIsUpdatingStatus(false);
      }
    },
    [emailState, sessionId, updateEmailStatus]
  );

  const handleRegenerateEmailsCallback = useCallback(
    async (onlyUnapproved: boolean) => {
      try {
        emailGeneration.setIsRegenerating(true);

        const response = await handleRegenerateEmails(
          { emailGeneration, emailState, chatState, sessionId },
          onlyUnapproved
        );

        if (response.success) {
          toast.success(
            `Successfully regenerated ${response.donorIdsToRegenerate.length} emails${
              response.onlyUnapproved ? ' (unapproved only)' : ''
            }`
          );
        } else {
          toast.error(response.error || 'Failed to regenerate emails');
        }
      } catch (error) {
        console.error('Error in handleRegenerateEmailsCallback:', error);
        toast.error('Failed to regenerate emails. Please try again.');
      } finally {
        emailGeneration.setIsRegenerating(false);
      }
    },
    [emailGeneration, emailState, chatState, sessionId]
  );

  const handleGenerateMoreCallback = useCallback(async () => {
    // Set loading state
    setEmailGenerationLoading(emailGeneration, 'generating_more', true);

    try {
      const response = await handleGenerateMore({
        emailGeneration,
        emailState,
        chatState,
        instructionInput,
        organization,
        donorsData: donorsData || [],
        currentSignature,
        sessionId,
        previousInstruction,
        selectedDonors,
      });

      if (response.success && response.result) {
        // Update email state with new emails (append to existing)
        updateEmailStateWithNewEmails(emailState, response.result.emails, true);
        // Don't update chat history - just silently generate more

        // Trigger review for newly generated emails
        console.log('🔍 GENERATE MORE - REVIEW CHECK:', {
          hasSessionId: !!sessionId,
          responseSuccess: response.success,
          hasResult: !!response.result,
        });

        if (sessionId && response.success) {
          console.log('✅ Additional emails generated, triggering review');
          setTimeout(async () => {
            console.log('🚀 TRIGGERING REVIEW FOR ADDITIONAL EMAILS');
            console.log('🔄 Refetching session data...');
            const sessionResult = await refetchSession();
            console.log('📦 Refetch result:', {
              success: sessionResult.isSuccess,
              hasData: !!sessionResult.data,
              emailCount: sessionResult.data?.emails?.length || 0,
            });

            if (sessionResult.data?.emails && sessionResult.data.emails.length > 0) {
              const emailIds = sessionResult.data.emails
                .map((email: any) => email.id)
                .filter((id: any) => id !== undefined);

              console.log('🎯 Directly calling review with email IDs:', emailIds);
              if (emailIds.length > 0) {
                try {
                  const reviewResult = await reviewEmails({ emailIds });
                  console.log('✅ Email review completed successfully:', reviewResult);
                } catch (error) {
                  console.error('❌ Error reviewing emails:', error);
                }
              }
            }
          }, 1000); // Small delay to ensure emails are saved
        }
      } else {
        // Handle error
        toast.error(response.error || 'Failed to generate more emails');
      }
    } catch (error) {
      console.error('Error in handleGenerateMoreCallback:', error);
      toast.error('An unexpected error occurred');
    } finally {
      setEmailGenerationLoading(emailGeneration, 'generating_more', false);
    }
  }, [
    emailGeneration,
    emailState,
    chatState,
    instructionInput,
    organization,
    donorsData,
    currentSignature,
    sessionId,
    previousInstruction,
    selectedDonors,
    reviewEmails,
    refetchSession,
  ]);

  const emailListViewerEmails = useMemo(() => {
    return emailState.allGeneratedEmails
      .map((email) => ({
        ...email,
        status: emailState.emailStatuses[email.donorId] || 'PENDING_APPROVAL',
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
          {(emailState.allGeneratedEmails.length > 0 || chatState.chatMessages.length > 0) && (
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
          <div
            className={cn(
              'flex flex-col h-full border-r overflow-hidden transition-all duration-300 ease-in-out',
              isChatCollapsed ? 'w-0 opacity-0' : 'w-full lg:w-1/2'
            )}
          >
            <div className="flex-1 min-h-0 overflow-hidden">
              <ChatInterface
                chatMessages={chatState.chatMessages}
                suggestedMemories={chatState.suggestedMemories}
                isChatCollapsed={isChatCollapsed}
                chatEndRef={chatState.chatEndRef}
                isGenerating={emailGeneration.isGenerating}
                isGeneratingMore={emailGeneration.isGeneratingMore}
                isRegenerating={emailGeneration.isRegenerating}
                streamingStatus={emailGeneration.streamingStatus}
              />
            </div>

            <div
              className={cn(
                'border-t bg-background flex-shrink-0 transition-all duration-300 ease-in-out',
                isChatCollapsed && 'opacity-0 pointer-events-none'
              )}
            >
              <IsolatedMentionsInput
                initialValue={instructionInput.localInstruction}
                placeholder={mentionsInputPlaceholder}
                projectMentions={projectMentions}
                onSubmit={handleSubmitInstructionCallback}
                onValueChange={instructionInput.handleInstructionValueChange}
                isGenerating={emailGeneration.isGenerating}
                onKeyDown={() => {}}
              />
              <div className="flex justify-end gap-2 px-4 py-2 border-t">
                <Button
                  onClick={() => setShowRegenerateDialog(true)}
                  disabled={
                    emailGeneration.isRegenerating ||
                    emailGeneration.isGenerating ||
                    emailState.allGeneratedEmails.length === 0
                  }
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1 h-7 text-xs"
                >
                  <RefreshCw className="h-3 w-3" />
                  Regenerate
                </Button>
                <Button
                  onClick={() => handleSubmitInstructionCallback()}
                  disabled={emailGeneration.isGenerating || !instructionInput.hasInputContent}
                  variant="default"
                  size="sm"
                  className="h-7 text-xs"
                >
                  {emailGeneration.isGenerating ? 'Generating...' : 'Generate Emails'}
                </Button>
              </div>
            </div>
          </div>

          {/* Email Preview Side */}
          <div
            className={cn(
              'flex flex-col h-full bg-muted/5 overflow-hidden relative transition-all duration-300 ease-in-out',
              isChatCollapsed ? 'flex-1' : 'flex-1 lg:w-1/2'
            )}
          >
            <div className="h-full overflow-hidden">
              <EmailPreviewPanel
                isGenerating={emailGeneration.isGenerating}
                allGeneratedEmails={emailState.allGeneratedEmails}
                templatePrompt={props.templatePrompt}
                emailListViewerEmails={emailListViewerEmails}
                emailListViewerDonors={donorUtils.emailListViewerDonors}
                referenceContexts={emailState.referenceContexts}
                handleEmailStatusChange={handleEmailStatusChangeCallback}
                isUpdatingStatus={emailState.isUpdatingStatus}
                sessionId={sessionId}
                handlePreviewEdit={handlePreviewEditCallback}
                handlePreviewEnhance={handlePreviewEnhanceCallback}
                isGeneratingMore={emailGeneration.isGeneratingMore}
                totalRemainingDonors={donorState.totalRemainingDonors}
                isEmailListExpanded={isEmailListExpanded}
                setIsEmailListExpanded={setIsEmailListExpanded}
                staffData={staffData}
                primaryStaff={primaryStaff}
                canGenerateMore={donorState.canGenerateMore}
                onGenerateMore={handleGenerateMoreCallback}
                generateMoreCount={GENERATE_MORE_COUNT}
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
          await handleRegenerateEmailsCallback(onlyUnapproved);
          setShowRegenerateDialog(false);
        }}
      />
    </div>
  );
}

const arePropsEqual = (
  prevProps: WriteInstructionStepProps,
  nextProps: WriteInstructionStepProps
): boolean => {
  return (
    prevProps.sessionId === nextProps.sessionId &&
    prevProps.editMode === nextProps.editMode &&
    prevProps.selectedDonors === nextProps.selectedDonors &&
    prevProps.initialGeneratedEmails === nextProps.initialGeneratedEmails
  );
};

export const WriteInstructionStep = React.memo(WriteInstructionStepComponent, arePropsEqual);
