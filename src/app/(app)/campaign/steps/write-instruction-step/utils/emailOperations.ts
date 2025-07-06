import { toast } from "sonner";
import { GeneratedEmail, GenerateEmailsResponse, AgenticFlowResponse, EmailGenerationResult } from "../types";
import { GENERATE_MORE_COUNT } from "../constants";

export async function handleEmailGeneration(
  params: {
    finalInstruction: string;
    organization: any;
    previewDonorIds: number[];
    donorsData: any[];
    chatMessages: Array<{ role: "user" | "assistant"; content: string }>;
    previousInstruction?: string;
    currentSignature: string;
    generateEmailsForDonors: (params: any) => Promise<EmailGenerationResult | null>;
    sessionId?: number;
    saveEmailsToSession: (emails: GeneratedEmail[], sessionId: number) => Promise<void>;
  }
) {
  const {
    finalInstruction,
    organization,
    previewDonorIds,
    donorsData,
    chatMessages,
    previousInstruction,
    currentSignature,
    generateEmailsForDonors,
    sessionId,
    saveEmailsToSession,
  } = params;

  if (!finalInstruction.trim() || !organization) return null;

  // Create the updated chat messages that include the latest user message
  const updatedChatMessages = [...chatMessages, { role: "user" as const, content: finalInstruction }];

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

  const result = await generateEmailsForDonors({
    donors: donorData,
    organizationName: organization.name,
    organizationWritingInstructions: organization.writingInstructions ?? undefined,
    previousInstruction,
    currentDate,
    chatHistory: updatedChatMessages,
    signature: currentSignature,
  });


  if (result) {
    // Check if this is an agentic flow response
    if ("isAgenticFlow" in result && result.isAgenticFlow) {
      return { type: "agentic", result: result as AgenticFlowResponse, updatedChatMessages };
    } else {
      // Handle traditional email generation response
      const emailResult = result as GenerateEmailsResponse;

      // Save generated emails incrementally if we have a sessionId
      if (sessionId) {
        await saveEmailsToSession(emailResult.emails, sessionId);
      }

      const responseMessage = "I've generated personalized emails based on each donor's communication history and your organization's writing instructions. You can review them on the left side. Let me know if you'd like any adjustments to the tone, content, or style.";

      return { type: "traditional", result: emailResult, updatedChatMessages, responseMessage };
    }
  } else {
    throw new Error("Failed to generate emails");
  }
}

export async function handleGenerateMoreEmails(
  params: {
    organization: any;
    previousInstruction?: string;
    localInstructionRef: React.MutableRefObject<string>;
    allGeneratedEmails: GeneratedEmail[];
    previewDonorIds: number[];
    selectedDonors: number[];
    setPreviewDonorIds: (ids: number[]) => void;
    donorsData: any[];
    chatMessages: Array<{ role: "user" | "assistant"; content: string }>;
    currentSignature: string;
    generateEmailsForDonors: (params: any) => Promise<EmailGenerationResult | null>;
    sessionId?: number;
    saveEmailsToSession: (emails: GeneratedEmail[], sessionId: number) => Promise<void>;
  }
): Promise<{ emails: GeneratedEmail[]; responseMessage: string } | null> {
  const {
    organization,
    previousInstruction,
    localInstructionRef,
    allGeneratedEmails,
    previewDonorIds,
    selectedDonors,
    setPreviewDonorIds,
    donorsData,
    chatMessages,
    currentSignature,
    generateEmailsForDonors,
    sessionId,
    saveEmailsToSession,
  } = params;

  if (!organization) return null;

  // Continue generating emails using chat history

  // Get donors that haven't been generated yet
  const alreadyGeneratedDonorIds = new Set(allGeneratedEmails.map((email) => email.donorId));
  const remainingFromPreview = previewDonorIds.filter((id) => !alreadyGeneratedDonorIds.has(id));

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
      return null;
    }

    // Take next batch from remaining selected donors
    nextBatchDonors = remainingFromSelected.slice(0, Math.min(GENERATE_MORE_COUNT, remainingFromSelected.length));

    // Add these new donors to the preview set permanently
    setPreviewDonorIds([...previewDonorIds, ...nextBatchDonors]);
  }

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

  // Generate emails using the same chat history
  const result = await generateEmailsForDonors({
    donors: donorData,
    organizationName: organization.name,
    organizationWritingInstructions: organization.writingInstructions ?? undefined,
    previousInstruction,
    currentDate,
    chatHistory: chatMessages,
    signature: currentSignature,
  });

  if (result && !("isAgenticFlow" in result)) {
    const emailResult = result as GenerateEmailsResponse;

    // Save newly generated emails incrementally if we have a sessionId
    if (sessionId) {
      await saveEmailsToSession(emailResult.emails, sessionId);
    }

    const responseMessage = `I've generated ${emailResult.emails.length} more personalized emails. You now have ${allGeneratedEmails.length + emailResult.emails.length} emails total to review.`;

    toast.success(`Generated ${emailResult.emails.length} more emails successfully!`);
    return { emails: emailResult.emails, responseMessage };
  } else {
    throw new Error("Failed to generate more emails");
  }
}