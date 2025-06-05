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
let systemPromptCache: string | null = null;
let systemPromptCacheKey: string | null = null;

/**
 * Creates a cache key for the system prompt based on static parameters
 */
function createSystemPromptCacheKey(
  instruction: string,
  organizationName: string,
  organization: Organization | null,
  organizationWritingInstructions?: string,
  personalMemories: string[] = [],
  organizationalMemories: string[] = []
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
  });
}

/**
 * Builds the static system prompt that can be cached and reused.
 * This includes all the formatting instructions, organization info, memories, and user instruction.
 */
export function buildSystemPrompt(
  instruction: string,
  organizationName: string,
  organization: Organization | null,
  organizationWritingInstructions?: string,
  personalMemories: string[] = [],
  organizationalMemories: string[] = []
): string {
  const cacheKey = createSystemPromptCacheKey(
    instruction,
    organizationName,
    organization,
    organizationWritingInstructions,
    personalMemories,
    organizationalMemories
  );

  if (systemPromptCache && systemPromptCacheKey === cacheKey) {
    return systemPromptCache;
  }

  const { promptString: websiteSummaryPrompt } = formatWebsiteSummaryWithIds(organization);

  const systemPrompt = `You are an expert in donor communications, helping to write personalized emails.
Your task is to generate an email based on the provided context and instructions.
The output MUST be a valid JSON object with two fields:
1. "subject": A string containing a compelling subject line for the email
2. "content": An array of objects, where each object has:
   - "piece": A string segment of the email (like a sentence or paragraph), this doesn't have to be a paragraph all the time, it could be just a sentence. IMPORTANT: Do NOT include reference IDs in the text.
   - "references": An array of context IDs that informed that piece (e.g., ["donation-01", "summary-paragraph-02"])
   - "addNewlineAfter": A boolean indicating if a newline should be added after this piece. This field is used to control line breaks and paragramphs in the email. Do not blindly add newlines.

Example of the required JSON output format:
{
  "subject": "Your Impact on Families in Need",
  "content": [
    { "piece": "Dear John,", "references": [], "addNewlineAfter": true },
    { "piece": "Thank you for your continued support, especially your generous gift last month.", "references": ["donation-01"], "addNewlineAfter": true },
    { "piece": "Your contribution has helped us achieve our community outreach goals.", "references": ["summary-paragraph-03"], "addNewlineAfter": false },
    { "piece": "We would love for you to consider supporting our new youth initiative.", "references": ["comm-02-01"], "addNewlineAfter": true },
    { "piece": "Please let us know if you have any questions.", "references": [], "addNewlineAfter": true },
    { "piece": "Best regards,", "references": [], "addNewlineAfter": true },
    { "piece": "Sarah", "references": [], "addNewlineAfter": false }
  ]
}

IMPORTANT: Never include reference IDs (like [donation-01] or [comm-02-01]) in the "piece" text. The references array is used to track which context informed each piece, but the IDs should not appear in the actual email text.

Guidelines for the subject line:
1. Keep it under 50 characters
2. Make it compelling and specific to the email's content
3. Avoid spam trigger words like "free", "urgent", etc.
4. If referencing a specific project or impact, use that in the subject
5. Make it personal when appropriate

Instructions from Personal Memories: 
${personalMemories.join("\n")}

Instructions from Organization Memories: 
${organizationalMemories.join("\n")}

Organization: ${organizationName}
${organization?.description ? `Organization Description: ${organization.description}\n` : ""}${
    organizationWritingInstructions ? `Organization Writing Instructions: ${organizationWritingInstructions}\n` : ""
  }

Organization Website Summary (if available, paragraphs are prefixed with their IDs):
${websiteSummaryPrompt}

User Instruction for this email: ${instruction}

PRIORITY: If there are User Notes about the donor in the donor information below, those should take precedence over Organization Memories or Writing Instructions if there's any conflict. User Notes contain specific instructions about this individual donor that should be followed.

Instructions for Tone and Style:
	•	Tone: Warm, personal, and confident.
	•	Length: 120–150 words.
	•	Avoid: Generic language, multiple CTAs, or excessive formality.
	•	Assume you have access to: donor's name, past gift amount, date, and program impacted.

Write an email for a donor who following the user instruction above, it could be a reengagement email to a donor who hasn't donated in a while, or a new donor who just donated. Use the structure and examples below.

1. Subject Line (Do 1):
Make it personal + emotional. Include first name if available.

2. Opening Line (Do 1):
Thank the donor and mention the last gift amount and year. Acknowledge their past gift and its amount. When mentioning the past donation:
- Always mention the exact amount of the donation.
- Prefer to use a donation that is donated to a specific program, and mention that program.
- Prefer to mention a larger donation amount
- Prefer to mention a recent donation

3. Emotional Hook (Do 1):
Connect their past donation to real-world impact. Be very specific about the impact if you are to mention, and use the company's information to make it more specific.
Examples:
	•	Because of you, 43 families received clean water.
	•	Your support helped fund 12 medical treatments last year.
	•	You gave a student their first laptop.

4. Time Anchor (Do 1):
Mention exactly how long it's been since their last gift. Use the donation history to get the last gift amount and year.
Examples:
	•	It's been 18 months since your last donation.
	•	We haven't heard from you since 2022, but you've never been forgotten.

5. Ask (Do 1):
Make a clear, direct ask based on the user instruction. 
If asking for a new donation:
- make it clear what program needs support and why, if you are not asking for the general fund. 
- explicitly mention how much impact that amount can make, for example, supporting 2 poor families, etc. if you can find that information.

6. Signature (Do 1):

Now, generate the email strictly in the JSON format described above.`;

  systemPromptCache = systemPrompt;
  systemPromptCacheKey = cacheKey;
  return systemPrompt;
}

/**
 * Builds the dynamic donor-specific context that changes for each email.
 */
export function buildDonorContext(
  donor: DonorInfo,
  communicationHistoryInput: RawCommunicationThread[] = [],
  donationHistoryInput: DonationWithDetails[] = []
): string {
  const { promptString: donationHistoryPrompt } = formatDonationHistoryWithIds(donationHistoryInput);
  const { promptString: communicationHistoryPrompt } = formatCommunicationHistoryWithIds(communicationHistoryInput);

  return `Donor Information:
- Name: ${formatDonorName(donor)}
- Email: ${donor.email}
${donor.notes ? `- User Notes: ${donor.notes}` : ""}

Past Communications (if available, messages are prefixed with their IDs):
${communicationHistoryPrompt}

Donation History (if available, donations are prefixed with their IDs):
${donationHistoryPrompt}`;
}

/**
 * Builds the prompt for the AI to generate a personalized donor email.
 * This function now uses caching for the system prompt and returns both parts separately.
 *
 * @param donor - Donor information.
 * @param instruction - Specific instruction for the email.
 * @param organizationName - Name of the organization.
 * @param organization - Organization details.
 * @param organizationWritingInstructions - Optional writing guidelines for the organization.
 * @param communicationHistoryInput - Raw communication history for the donor.
 * @param donationHistoryInput - Raw donation history for the donor.
 * @returns Object with separate system prompt, donor context, and reference contexts.
 */
export function buildEmailPrompt(
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
): {
  systemPrompt: string;
  donorContext: string;
  referenceContexts: Record<string, string>;
} {
  const systemPrompt = buildSystemPrompt(
    instruction,
    organizationName,
    organization,
    organizationWritingInstructions,
    personalMemories,
    organizationalMemories
  );

  const donorContext = buildDonorContext(donor, communicationHistoryInput, donationHistoryInput);

  return {
    systemPrompt,
    donorContext,
    referenceContexts: {
      // Add any necessary reference contexts here
    },
  };
}

/**
 * Utility function to clear the system prompt cache if needed (for testing or updates).
 */
export function clearSystemPromptCache(): void {
  systemPromptCache = null;
  systemPromptCacheKey = null;
}
