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
  donationHistoryInput: DonationWithDetails[] = [],
  personalMemories: string[] = [],
  organizationalMemories: string[] = []
): string {
  const { promptString: donationHistoryPrompt } = formatDonationHistoryWithIds(donationHistoryInput);
  const { promptString: communicationHistoryPrompt } = formatCommunicationHistoryWithIds(communicationHistoryInput);
  const { promptString: websiteSummaryPrompt } = formatWebsiteSummaryWithIds(organization);

  // Constructing the detailed prompt with instructions for JSON output
  return `You are an expert in donor communications, helping to write personalized emails.
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

Donor Information:
- Name: ${donor.firstName} ${donor.lastName}
- Email: ${donor.email}

Past Communications (if available, messages are prefixed with their IDs):
${communicationHistoryPrompt}

User Instruction for this email: ${instruction}

Write a reengagement email for a mid-level donor who gave $250–$999 but hasn't donated in 12–48 months. Use the structure and examples below. Do everything listed.

⸻

1. Subject Line (Do 1):
Make it personal + emotional. Include first name if available.
Examples:
	•	We've missed you, Sarah.
	•	You helped change lives—will you do it again?
	•	Your past gift still matters.
	•	Look what you made possible.

⸻

2. Opening Line (Do 1):
Thank the donor and mention the last gift amount and year. Acknowledge their past gift and its amount. When mentioning the past donation:
- Always mention the exact amount of the donation.
- Prefer to use a donation that is donated to a specific program, and mention that program.
- Prefer to mention a larger donation amount
- Prefer to mention a recent donation

Donation History (if available, donations are prefixed with their IDs):
${donationHistoryPrompt}

Examples but use specific amounts and years from the donation history:
	•	Your $500 gift in 2021 helped launch our scholarship program.
	•	Thank you for your generous $350 donation two years ago.

⸻

3. Emotional Hook (Do 1):
Connect their past donation to real-world impact. Be very specific about the impact if you are to mention, and use the company's information to make it more specific.
Examples:
	•	Because of you, 43 families received clean water.
	•	Your support helped fund 12 medical treatments last year.
	•	You gave a student their first laptop.

⸻

4. Time Anchor (Do 1):
Mention exactly how long it's been since their last gift. Use the donation history to get the last gift amount and year.
Examples:
	•	It's been 18 months since your last donation.
	•	We haven't heard from you since 2022, but you've never been forgotten.

⸻

5. Ask (Do 1):
Make a clear, direct ask. Suggest the same or slightly higher amount.
- make it clear what program needs support and why, if you are not asking for the general fund. 
- explicitly mention how much impact that amount can make, for example, supporting 2 poor families, etc. if you can find that information.

⸻

6. Signature (Do 1):
Sign off with a real name + title, and a P.S. with a reminder or extra nudge.
Example:
Warmly,
Jiyun Hyo
Director of Development
P.S. Even a small gift today can reignite hope for a family in need.

⸻

Instructions for Tone and Style:
	•	Tone: Warm, personal, and confident.
	•	Length: 120–150 words.
	•	Avoid: Generic language, multiple CTAs, or excessive formality.
	•	Assume you have access to: donor's name, past gift amount, date, and program impacted.

Now, generate the email strictly in the JSON format described above.
JSON Email:`;
}
