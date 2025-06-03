import { DonationWithDetails } from "../../data/donations";
import { DonationInfo, FormattedCommunicationMessage, Organization, RawCommunicationThread } from "./types";

/**
 * Formats donation history with unique IDs and prepares a string for the AI prompt.
 * Donations are sorted by date (most recent first) and all fetched donations are included in the prompt string.
 *
 * @param donations - Array of donation information.
 * @returns An object containing the formatted string for the prompt and the list of donations with assigned IDs.
 */
export function formatDonationHistoryWithIds(donations: DonationWithDetails[] = []): {
  promptString: string;
  donationsWithIds: DonationWithDetails[];
} {
  if (donations.length === 0) {
    return { promptString: "No previous donations.", donationsWithIds: [] };
  }

  const sortedDonations = [...donations].sort((a, b) => b.date.getTime() - a.date.getTime());

  const donationsWithIds = sortedDonations.map((donation, index) => ({
    ...donation,
    displayId: `donation-${index + 1}`,
  }));

  const recentDonationsForPrompt = donationsWithIds;

  const promptString = recentDonationsForPrompt
    .map((d) => {
      const date = d.date.toLocaleDateString();
      const amount = (d.amount / 100).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
      });
      const project = d.project ? ` to ${d.project.name}` : "";
      return `- [${d.displayId}] ${date}: ${amount}${project}`;
    })
    .join("\n");

  return { promptString, donationsWithIds };
}

/**
 * Formats communication history with unique IDs and prepares a string for the AI prompt.
 * Each message within each communication thread is assigned a unique ID.
 *
 * @param rawHistory - Array of raw communication threads.
 * @returns An object containing the formatted string for the prompt and a list of formatted messages with IDs.
 */
export function formatCommunicationHistoryWithIds(rawHistory: RawCommunicationThread[] = []): {
  promptString: string;
  formattedMessages: FormattedCommunicationMessage[];
} {
  if (rawHistory.length === 0) {
    return { promptString: "No past communications.", formattedMessages: [] };
  }

  const formattedMessages: FormattedCommunicationMessage[] = [];
  const promptLines: string[] = [];

  rawHistory.forEach((thread, threadIndex) => {
    if (thread.content && thread.content.length > 0) {
      thread.content.forEach((messageItem, messageIndex) => {
        const messageId = `comm-${threadIndex + 1}-${messageIndex + 1}`;
        formattedMessages.push({
          id: messageId,
          content: messageItem.content,
        });
        promptLines.push(`- [${messageId}] ${messageItem.content}`);
      });
    }
  });

  if (promptLines.length === 0) {
    return { promptString: "No past communications.", formattedMessages: [] };
  }

  return {
    promptString: promptLines.join("\n"),
    formattedMessages,
  };
}

/**
 * Splits the organization's website summary into paragraphs, assigns unique IDs,
 * and prepares a string for the AI prompt.
 *
 * @param organization - The organization object.
 * @returns An object containing the formatted string for the prompt and the list of summary paragraphs with IDs.
 *          Returns empty values if no summary is available.
 */
export function formatWebsiteSummaryWithIds(organization: Organization | null): {
  promptString: string;
  summaryParagraphs: Array<{ id: string; content: string }>;
} {
  // Try rawWebsiteSummary first, fall back to websiteSummary
  const rawSummary = organization?.rawWebsiteSummary ?? organization?.websiteSummary;
  if (!rawSummary || rawSummary.trim() === "") {
    return { promptString: "No website summary provided.", summaryParagraphs: [] };
  }

  const paragraphs = rawSummary
    .split(/\n\s*\n/) // Split by one or more newlines, effectively by paragraphs
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (paragraphs.length === 0) {
    return { promptString: "No website summary provided.", summaryParagraphs: [] };
  }

  const summaryParagraphs = paragraphs.map((content, index) => ({
    id: `summary-paragraph-${index + 1}`,
    content,
  }));

  const promptString = summaryParagraphs.map((p) => `- [${p.id}] ${p.content}`).join("\n");

  return { promptString, summaryParagraphs };
}
