import { DonorInfo, Organization, RawCommunicationThread } from "./types";
import {
  formatDonationHistoryWithIds,
  formatCommunicationHistoryWithIds,
  formatWebsiteSummaryWithIds,
} from "./context-formatters";
import { DonationWithDetails } from "../../data/donations";

/**
 * Builds a focused prompt for generateObject that doesn't include JSON formatting instructions
 * since the AI SDK handles structured output automatically.
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
  currentDate?: string
): string {
  const { promptString: donationHistoryPrompt } = formatDonationHistoryWithIds(donationHistoryInput);
  const { promptString: communicationHistoryPrompt } = formatCommunicationHistoryWithIds(communicationHistoryInput);
  const { promptString: websiteSummaryPrompt } = formatWebsiteSummaryWithIds(organization);

  // Format current date if provided
  const dateContext = currentDate ? `Current Date: ${currentDate}\n` : "";

  return `You are an expert in donor communications writing personalized emails.

CONTEXT:
Organization: ${organizationName}
${dateContext}${organizationWritingInstructions ? `Writing Guidelines: ${organizationWritingInstructions}` : ""}

Donor: ${donor.firstName} ${donor.lastName} (${donor.email})

${personalMemories.length > 0 ? `Personal Memories:\n${personalMemories.join("\n")}\n` : ""}
${organizationalMemories.length > 0 ? `Organization Memories:\n${organizationalMemories.join("\n")}\n` : ""}

${websiteSummaryPrompt ? `Organization Summary:\n${websiteSummaryPrompt}\n` : ""}

${donationHistoryPrompt ? `Donation History:\n${donationHistoryPrompt}\n` : ""}

${communicationHistoryPrompt ? `Past Communications:\n${communicationHistoryPrompt}\n` : ""}

TASK: ${instruction}

REQUIREMENTS:
- Write a reengagement email for a mid-level donor ($250-$999) who hasn't donated in 12-48 months
- Subject line: Personal, emotional, under 50 characters
- Email structure: Opening acknowledgment → Emotional impact → Time anchor → Clear ask → Call to action → Signature
- Tone: Warm, personal, confident
- Length: 120-150 words
- Reference specific donation amounts and dates from the history when available
- Use the current date context for time-sensitive references and seasonal messaging

IMPORTANT INSTRUCTIONS:
1. For the "piece" field: Write natural email text WITHOUT any reference IDs like [donation-01] or [comm-02-01]
2. For the "references" field: Include the context IDs that informed each piece (e.g., ["donation-1", "summary-paragraph-2"])
3. For "addNewlineAfter": Use true for paragraph breaks, false for continuing sentences
4. Create at least 5 content pieces for a complete email structure

Generate a compelling, personalized email that will re-engage this donor.`;
}
