import { DonorInfo, Organization, RawCommunicationThread } from "./types";
import {
  formatDonationHistoryWithIds,
  formatCommunicationHistoryWithIds,
  formatWebsiteSummaryWithIds,
} from "./context-formatters";
import { DonationWithDetails } from "../../data/donations";
import { formatDonorName } from "../donor-name-formatter";

/**
 * Cache for system prompt to avoid regenerating static content
 */
let structuredSystemPromptCache: string | null = null;
let structuredSystemPromptCacheKey: string | null = null;

/**
 * Creates a cache key for the system prompt based on static parameters
 */
function createStructuredSystemPromptCacheKey(
  instruction: string,
  organizationName: string,
  organization: Organization | null,
  organizationWritingInstructions?: string,
  personalMemories: string[] = [],
  organizationalMemories: string[] = [],
  currentDate?: string,
  emailSignature?: string
): string {
  const websiteSummary = organization?.websiteSummary || "";
  const orgDescription = organization?.description || "";
  return JSON.stringify({
    instruction,
    organizationName,
    orgDescription,
    organizationWritingInstructions: organizationWritingInstructions || "",
    websiteSummary,
    personalMemories,
    organizationalMemories,
    currentDate: currentDate || "",
    emailSignature: emailSignature || "",
  });
}

/**
 * Builds the static system prompt that can be cached and reused.
 * This includes all the formatting instructions, organization info, memories, and user instruction.
 */
export function buildStructuredSystemPrompt(
  instruction: string,
  organizationName: string,
  organization: Organization | null,
  organizationWritingInstructions?: string,
  personalMemories: string[] = [],
  organizationalMemories: string[] = [],
  currentDate?: string,
  emailSignature?: string
): string {
  const cacheKey = createStructuredSystemPromptCacheKey(
    instruction,
    organizationName,
    organization,
    organizationWritingInstructions,
    personalMemories,
    organizationalMemories,
    currentDate,
    emailSignature
  );

  if (structuredSystemPromptCache && structuredSystemPromptCacheKey === cacheKey) {
    return structuredSystemPromptCache;
  }

  const { promptString: websiteSummaryPrompt } = formatWebsiteSummaryWithIds(organization);

  // Format current date if provided
  const dateContext = currentDate ? `Current Date: ${currentDate}\n` : "";

  // Note: Email signatures are handled automatically by the system, so AI should not generate them
  const signatureContext = "";
  const signatureRequirement = "";

  const systemPrompt = `You are an expert in donor communications writing personalized emails.

CONTEXT:
Organization: ${organizationName}
${
  organization?.description ? `Organization Description: ${organization.description}\n` : ""
}${dateContext}${signatureContext}${
    organizationWritingInstructions ? `Writing Guidelines: ${organizationWritingInstructions}` : ""
  }

${personalMemories.length > 0 ? `Personal Memories:\n${personalMemories.join("\n")}\n` : ""}
${organizationalMemories.length > 0 ? `Organization Memories:\n${organizationalMemories.join("\n")}\n` : ""}

${websiteSummaryPrompt ? `Organization Summary:\n${websiteSummaryPrompt}\n` : ""}

TASK: ${instruction}

REQUIREMENTS:
- Write a reengagement email for a mid-level donor ($250-$999) who hasn't donated in 12-48 months
- Subject line: Personal, emotional, under 50 characters
- Email structure: Opening acknowledgment → Emotional impact → Time anchor → Clear ask → Call to action → Signature
- Tone: Warm, personal, confident
- Length: 120-150 words
- Reference specific donation amounts and dates from the history when available
- Use the current date context for time-sensitive references and seasonal messaging
- DO NOT include any signature or closing in the email - this will be automatically added by the system

IMPORTANT INSTRUCTIONS:
1. For the "piece" field: Write natural email text WITHOUT any reference IDs like [donation-01] or [comm-02-01]
2. For the "references" field: Include the context IDs that informed each piece (e.g., ["donation-1", "summary-paragraph-2"])
3. For "addNewlineAfter": Use true for paragraph breaks, false for continuing sentences
4. DO NOT use "-", "--" or "—" in the email ever.
5. DO NOT include any closing, signature, or sign-off (like "Best regards", "Sincerely", etc.) - the system will automatically add the appropriate signature
6. PRIORITY: If there are User Notes about the donor, those should take precedence over Organization Memories or Writing Guidelines if there's any conflict. User Notes contain specific instructions about this individual donor that should be followed.

If the requirements or the important instructions conflicts with the task, prioritize the task.

Generate a compelling, personalized email that will re-engage this donor.`;

  structuredSystemPromptCache = systemPrompt;
  structuredSystemPromptCacheKey = cacheKey;
  return systemPrompt;
}

/**
 * Builds the dynamic donor-specific context that changes for each email.
 */
export function buildStructuredDonorContext(
  donor: DonorInfo,
  communicationHistoryInput: RawCommunicationThread[] = [],
  donationHistoryInput: DonationWithDetails[] = []
): string {
  const { promptString: donationHistoryPrompt } = formatDonationHistoryWithIds(donationHistoryInput);
  const { promptString: communicationHistoryPrompt } = formatCommunicationHistoryWithIds(communicationHistoryInput);

  return `Donor: ${formatDonorName(donor)} (${donor.email})
${donor.notes ? `\nUser Notes about this Donor: ${donor.notes}` : ""}

${donationHistoryPrompt ? `Donation History:\n${donationHistoryPrompt}\n` : ""}

${communicationHistoryPrompt ? `Past Communications:\n${communicationHistoryPrompt}\n` : ""}`;
}

/**
 * Builds a focused prompt for generateObject that doesn't include JSON formatting instructions
 * since the AI SDK handles structured output automatically.
 * Now uses caching for the system prompt and returns both parts separately.
 */
export function buildStructuredEmailPrompt(
  donor: DonorInfo,
  instruction: string,
  organizationName: string,
  organization: Organization | null,
  organizationWritingInstructions?: string,
  communicationHistoryInput: RawCommunicationThread[] = [],
  donationHistoryInput: DonationWithDetails[] = [],
  personalMemories: string[] = [],
  organizationalMemories: string[] = [],
  currentDate?: string,
  emailSignature?: string
): {
  systemPrompt: string;
  donorContext: string;
} {
  const systemPrompt = buildStructuredSystemPrompt(
    instruction,
    organizationName,
    organization,
    organizationWritingInstructions,
    personalMemories,
    organizationalMemories,
    currentDate,
    emailSignature
  );

  const donorContext = buildStructuredDonorContext(donor, communicationHistoryInput, donationHistoryInput);

  return {
    systemPrompt,
    donorContext,
  };
}

/**
 * Utility function to clear the structured system prompt cache if needed (for testing or updates).
 */
export function clearStructuredSystemPromptCache(): void {
  structuredSystemPromptCache = null;
  structuredSystemPromptCacheKey = null;
}
