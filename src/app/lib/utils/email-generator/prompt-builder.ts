import { DonorInfo, Organization, RawCommunicationThread } from "./types";
import {
  formatDonationHistoryWithIds,
  formatCommunicationHistoryWithIds,
  formatWebsiteSummaryWithIds,
} from "./context-formatters";
import { DonationWithDetails } from "../../data/donations";

/**
 * Builds the prompt for the AI to generate a personalized donor email.
 *
 * @param donor - Donor information.
 * @param instruction - Specific instruction for the email.
 * @param organizationName - Name of the organization.
 * @param organization - Organization details.
 * @param organizationWritingInstructions - Optional writing guidelines for the organization.
 * @param communicationHistoryInput - Raw communication history for the donor.
 * @param donationHistoryInput - Raw donation history for the donor.
 * @returns The complete prompt string for the AI.
 */
export function buildEmailPrompt(
  donor: DonorInfo,
  instruction: string,
  organizationName: string,
  organization: Organization | null,
  organizationWritingInstructions?: string,
  communicationHistoryInput: RawCommunicationThread[] = [],
  donationHistoryInput: DonationWithDetails[] = []
): string {
  console.log("donationHistoryInput", donationHistoryInput);
  const { promptString: donationHistoryPrompt } = formatDonationHistoryWithIds(donationHistoryInput);
  const { promptString: communicationHistoryPrompt } = formatCommunicationHistoryWithIds(communicationHistoryInput);
  const { promptString: websiteSummaryPrompt } = formatWebsiteSummaryWithIds(organization);

  // Constructing the detailed prompt with instructions for JSON output
  return `You are an expert in donor communications, helping to write personalized emails.
Your task is to generate an email based on the provided context and instructions.
The output MUST be a valid JSON object with two fields:
1. "subject": A string containing a compelling subject line for the email
2. "content": An array of objects, where each object has:
   - "piece": A string segment of the email (like a sentence or paragraph)
   - "references": An array of context IDs that informed that piece (e.g., ["donation-01", "summary-paragraph-02"])
   - "addNewlineAfter": A boolean indicating if a newline should be added after this piece

Example of the required JSON output format:
{
  "subject": "Your Impact on Families in Need",
  "content": [
    { "piece": "Dear John,", "references": [], "addNewlineAfter": true },
    { "piece": "Thank you for your continued support, especially your generous gift referenced by [donation-01].", "references": ["donation-01"], "addNewlineAfter": true },
    { "piece": "Your contribution has helped us achieve goals outlined in [summary-paragraph-03].", "references": ["summary-paragraph-03"], "addNewlineAfter": false },
    { "piece": "We would love for you to consider supporting our new initiative mentioned in our recent communication [comm-02-01].", "references": ["comm-02-01"], "addNewlineAfter": true },
    { "piece": "Please let us know if you have any questions.", "references": [], "addNewlineAfter": true },
    { "piece": "Best regards,", "references": [], "addNewlineAfter": true },
    { "piece": "Sarah", "references": [], "addNewlineAfter": false }
  ]
}

Guidelines for the subject line:
1. Keep it under 50 characters
2. Make it compelling and specific to the email's content
3. Avoid spam trigger words like "free", "urgent", etc.
4. If referencing a specific project or impact, use that in the subject
5. Make it personal when appropriate

Organization: ${organizationName}
${organizationWritingInstructions ? `Organization Writing Instructions: ${organizationWritingInstructions}\n` : ""}

Organization Website Summary (if available, paragraphs are prefixed with their IDs):
${websiteSummaryPrompt}

Donor Information:
- Name: ${donor.firstName} ${donor.lastName}
- Email: ${donor.email}

Donation History (if available, donations are prefixed with their IDs):
${donationHistoryPrompt}

Past Communications (if available, messages are prefixed with their IDs):
${communicationHistoryPrompt}

User Instruction for this email: ${instruction}

Guidelines for the email content (apply these to the "piece" texts):
1. Keep the total email length (sum of all pieces) under 200 words.
2. Write conversationally, as one person to another; be friendly and genuine.
3. Focus on donor impact, not organizational needs.
4. Use only factual information provided in the context – never fabricate stories or statistics.
5. Use active voice and a warm, personal tone. If past communications are available, try to match their tone.
6. Keep paragraphs (which may correspond to one or more "piece" objects) to 1-3 sentences maximum.
7. Include one clear call to action in one of the "piece" objects.
8. Reference past communications (using their IDs in "references") if relevant to the user instruction.
9. Write at a 4th-6th grade reading level.
10. Use contractions (e.g., "it's", "you're") to maintain a conversational tone.
11. If relevant to the user instruction, reference their donation history (using IDs in "references") and the projects they've supported.

Structure the email content (across multiple "piece" objects) with:
1. A personal greeting using the donor's first name (e.g., in the first "piece").
2. An opening that acknowledges their relationship/support.
3. A body focusing on specific impact or a real story (referencing context IDs).
4. A clear, single call to action.
5. A warm closing with gratitude.
6. A professional signature (e.g., Organization Name or a representative).

Now, generate the email strictly in the JSON format described above.
JSON Email:`;
}
