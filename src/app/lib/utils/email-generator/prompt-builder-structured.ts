import { DonorInfo, Organization, RawCommunicationThread, DonorStatistics } from "./types";
import {
  formatDonationHistoryWithIds,
  formatCommunicationHistoryWithIds,
  // formatWebsiteSummaryWithIds is disabled - website summary feature is hidden
} from "./context-formatters";
import { DonationWithDetails } from "../../data/donations";
import { formatDonorName } from "../donor-name-formatter";
import { PersonResearchResult } from "../../services/person-research/types";

/**
 * Formats person research results with reference IDs for LLM context
 */
function formatPersonResearchWithIds(personResearch?: PersonResearchResult): {
  promptString: string;
  referenceIds: string[];
} {
  if (!personResearch) {
    return { promptString: "", referenceIds: [] };
  }

  const referenceIds: string[] = [];
  let promptString = "";

  // Add the main research answer
  const answerId = "research-answer";
  referenceIds.push(answerId);
  promptString += `Research Answer: ${personResearch.answer}\n`;

  // Add citations with reference IDs
  if (personResearch.citations && personResearch.citations.length > 0) {
    promptString += "\nResearch Sources:\n";
    personResearch.citations.forEach((citation, index) => {
      const citationId = `research-citation-${index + 1}`;
      referenceIds.push(citationId);
      promptString += `- ${citation.title}: ${citation.snippet} (${citation.url})\n`;
    });
  }

  // Add research topic and metadata
  promptString += `\nResearch Topic: ${personResearch.researchTopic}`;
  if (personResearch.personIdentity) {
    promptString += `\nIdentified as: ${personResearch.personIdentity.fullName}`;
    if (personResearch.personIdentity.profession) {
      promptString += ` (${personResearch.personIdentity.profession})`;
    }
    if (personResearch.personIdentity.location) {
      promptString += ` - ${personResearch.personIdentity.location}`;
    }
  }

  return { promptString, referenceIds };
}

/**
 * Builds the static system prompt that remains the same across all emails for an organization.
 * This includes all the formatting instructions, organization info, memories, and user instruction.
 */
export function buildStructuredSystemPrompt(
  organizationName: string,
  organization: Organization | null,
  organizationWritingInstructions?: string,
  personalWritingInstructions?: string,
  personalMemories: string[] = [],
  organizationalMemories: string[] = [],
  currentDate?: string
): string {
  // Website summary is disabled - not included in prompts
  // const { promptString: websiteSummaryPrompt } = formatWebsiteSummaryWithIds(organization);

  // Format current date if provided
  const dateContext = currentDate ? `Current Date: ${currentDate}\n` : "";

  const systemPrompt = `You are an expert in donor communications writing personalized emails.

CONTEXT:
Organization: ${organizationName}
${organization?.description ? `Organization Description: ${organization.description}\n` : ""}
${dateContext}
${organizationWritingInstructions ? `Writing Guidelines: ${organizationWritingInstructions}` : ""}
${personalWritingInstructions ? `Personal Writing Guidelines: ${personalWritingInstructions}` : ""}

${personalMemories.length > 0 ? `Personal Memories:\n${personalMemories.join("\n")}\n` : ""}
${organizationalMemories.length > 0 ? `Organization Memories:\n${organizationalMemories.join("\n")}\n` : ""}

REQUIREMENTS:
- Write a reengagement email for a mid-level donor ($250-$999) who hasn't donated in 12-48 months
- Subject line: Personal, emotional, under 50 characters
- Tone: Warm, personal, confident
- Length: 120-150 words
- If needed, reference specific donation amounts and dates from the history when available
- Use the current date context for time-sensitive references and seasonal messaging
- DO NOT include any signature or closing in the email - this will be automatically added by the system
- When talking about the donor's impact, you should use their past donation history to reference the impact they've had.
- When requesting donations, include a real donation URL (e.g., https://example.org/donate) instead of placeholder text like "[donation link]".

IMPORTANT INSTRUCTIONS:
- For the "piece" field: Write natural email text WITHOUT any reference IDs, numbers, or markers (like [donation-context], [comm-02-01], ¹, ², 1, 2, etc.)
- For the "references" field: Include the context IDs that informed each piece (e.g., ["donation-context", "comm-01-02"])
- For "addNewlineAfter": Use true for paragraph breaks, false for continuing sentences
- DO NOT use "-", "--" or "—" in the email ever.
- DO NOT include any closing, signature, or sign-off (like "Best regards", "Sincerely", etc.) - the system will automatically add the appropriate signature
- DO NOT include footnote numbers, superscript numbers, or any reference markers in the email text
- PRIORITY: If there are User Notes about the donor, those should take precedence over Organization Memories or Writing Guidelines if there's any conflict. User Notes contain specific instructions about this individual donor that should be followed. Personal Writing Guidelines should take precedence over Organization Writing Guidelines if there's any conflict.
- Try to be as specific as possible, avoid general statements.
- Do not mention small amount donations unless the user has specifically asked for it. Do not say "small" or "small amount" in the email.
- DONATION CONTEXT: When referencing donations, use "donation-context" as the reference ID which contains ALL donation information. This allows you to mention multiple donations, specific amounts, dates, and projects from the donor's complete giving history.
- DONATION LINKS: When including donation links, always use actual URLs (like https://example.org/donate) rather than placeholder text like "[donation link]" or "click here". Never use bracketed placeholder text. The system will automatically convert URLs into trackable links. Example: "Please donate here: https://example.org/donate" NOT "Please donate here: [donation link]".

If the requirements or the important instructions conflicts with the task below, follow the task instruction.
`;

  return systemPrompt;
}

/**
 * Builds the dynamic donor-specific context that changes for each email.
 */
export function buildStructuredDonorContext(
  refinedInstruction: string,
  donor: DonorInfo,
  communicationHistoryInput: RawCommunicationThread[] = [],
  donationHistoryInput: DonationWithDetails[] = [],
  donorStatistics?: DonorStatistics,
  personResearch?: PersonResearchResult,
  originalInstruction?: string
): string {
  const { promptString: donationHistoryPrompt } = formatDonationHistoryWithIds(donationHistoryInput);
  const { promptString: communicationHistoryPrompt } = formatCommunicationHistoryWithIds(communicationHistoryInput);
  const { promptString: personResearchPrompt } = formatPersonResearchWithIds(personResearch);

  // Format donor statistics if available
  let statisticsPrompt = "";
  if (donorStatistics) {
    const totalAmount = (donorStatistics.totalAmount / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });

    statisticsPrompt = `\nDonor Statistics:
- Total Donations: ${donorStatistics.totalDonations}
- Total Amount Donated: ${totalAmount}`;

    if (donorStatistics.firstDonation) {
      const firstAmount = (donorStatistics.firstDonation.amount / 100).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
      });
      const firstDate = new Date(donorStatistics.firstDonation.date).toLocaleDateString();
      statisticsPrompt += `\n- First Donation: ${firstAmount} on ${firstDate}`;
    }

    if (donorStatistics.lastDonation) {
      const lastAmount = (donorStatistics.lastDonation.amount / 100).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
      });
      const lastDate = new Date(donorStatistics.lastDonation.date).toLocaleDateString();
      statisticsPrompt += `\n- Most Recent Donation: ${lastAmount} on ${lastDate}`;
    }

    if (donorStatistics.donationsByProject.length > 0) {
      statisticsPrompt += `\n- Donations by Project:`;
      donorStatistics.donationsByProject.forEach((project) => {
        const projectAmount = (project.totalAmount / 100).toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
        });
        const projectName = project.projectName || "General Fund";
        statisticsPrompt += `\n  • ${projectName}: ${projectAmount}`;
      });
    }
  }

  // Extract unique projects from donation history
  let projectsPrompt = "";
  if (donationHistoryInput && donationHistoryInput.length > 0) {
    const uniqueProjects = new Map<number, DonationWithDetails["project"]>();

    donationHistoryInput.forEach((donation) => {
      if (donation.project && donation.project.id) {
        uniqueProjects.set(donation.project.id, donation.project);
      }
    });

    if (uniqueProjects.size > 0) {
      projectsPrompt = "\nProjects Donated To:";
      uniqueProjects.forEach((project) => {
        if (project) {
          projectsPrompt += `\n- ${project.name}`;
          if (project.description) {
            projectsPrompt += `\n  Description: ${project.description}`;
          }
          if (project.notes) {
            projectsPrompt += `\n  Notes: ${project.notes}`;
          }
        }
      });
      projectsPrompt += "\n";
    }
  }

  // Build the task section with both instructions if original is provided
  let taskSection = "";
  if (originalInstruction && originalInstruction.trim() !== refinedInstruction.trim()) {
    taskSection = `ORIGINAL USER INSTRUCTION: ${originalInstruction}

REFINED INSTRUCTION: ${refinedInstruction}`;
  } else {
    taskSection = `TASK: ${refinedInstruction}`;
  }

  return `${taskSection}

Donor: ${formatDonorName(donor)} (${donor.email})
${donor.notes ? `\nUser Notes about this Donor: ${donor.notes}` : ""}${statisticsPrompt}
${projectsPrompt}
${donationHistoryPrompt ? `Donation History:\n${donationHistoryPrompt}\n` : ""}

${communicationHistoryPrompt ? `Past Communications:\n${communicationHistoryPrompt}\n` : ""}

${
  /* Person research removed from prompts
personResearchPrompt ? `Person Research:\n${personResearchPrompt}\n` : ""
*/ ""
}`;
}

/**
 * Builds a focused prompt for generateObject that doesn't include JSON formatting instructions
 * since the AI SDK handles structured output automatically.
 * Now uses caching for the system prompt and returns both parts separately.
 */
export function buildStructuredEmailPrompt(
  donor: DonorInfo,
  refinedInstruction: string,
  organizationName: string,
  organization: Organization | null,
  organizationWritingInstructions?: string,
  personalWritingInstructions?: string,
  communicationHistoryInput: RawCommunicationThread[] = [],
  donationHistoryInput: DonationWithDetails[] = [],
  donorStatistics?: DonorStatistics,
  personResearch?: PersonResearchResult,
  personalMemories: string[] = [],
  organizationalMemories: string[] = [],
  currentDate?: string,
  originalInstruction?: string
): {
  systemPrompt: string;
  donorContext: string;
} {
  const systemPrompt = buildStructuredSystemPrompt(
    organizationName,
    organization,
    organizationWritingInstructions,
    personalWritingInstructions,
    personalMemories,
    organizationalMemories,
    currentDate
  );

  const donorContext = buildStructuredDonorContext(
    refinedInstruction,
    donor,
    communicationHistoryInput,
    donationHistoryInput,
    donorStatistics,
    personResearch,
    originalInstruction
  );

  console.log(donorContext);

  return {
    systemPrompt,
    donorContext,
  };
}
