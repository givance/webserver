import type { DonorAnalysisInfo } from "./types";
import type { DonorJourney, DonorJourneyNode, DonorJourneyEdge } from "@/app/lib/data/organizations"; // Assuming DonorJourneyNode and DonorJourneyEdge are parts of or compatible with DonorJourney
import type { RawCommunicationThread, RawCommunicationContentItem } from "@/app/lib/utils/email-generator/types";
import type { DonationWithDetails } from "@/app/lib/data/donations";
// Potentially import other shared types like Organization if needed for context

const MAX_HISTORY_ITEMS = 20; // Max number of communication/donation items to include
const MAX_COMMUNICATION_LENGTH = 500; // Max characters for a single communication content

function formatDonorHistory(
  communicationHistory: RawCommunicationThread[],
  donationHistory: DonationWithDetails[]
): string {
  let historyStr = "\nRelevant Donor History:\n";

  if (donationHistory.length > 0) {
    historyStr += "\nRecent Donations (up to 5, newest first):\n";
    donationHistory.slice(0, 5).forEach((d: DonationWithDetails) => {
      historyStr += `- Donated ${(d.amount / 100).toFixed(2)} USD on ${new Date(d.date).toLocaleDateString()}${
        d.project ? " for project '" + d.project.name + "'" : ""
      }.\n`;
    });
  }

  if (communicationHistory.length > 0) {
    historyStr += "\nRecent Communications (up to 5 threads, 2 messages per thread, newest first):\n";
    communicationHistory.slice(0, 5).forEach((thread: RawCommunicationThread, threadIndex: number) => {
      if (thread.content && thread.content.length > 0) {
        historyStr += `  Thread ${threadIndex + 1}:\n`;
        thread.content.slice(0, 2).forEach((message: RawCommunicationContentItem, messageIndex: number) => {
          const truncatedContent =
            message.content.length > MAX_COMMUNICATION_LENGTH
              ? message.content.substring(0, MAX_COMMUNICATION_LENGTH) + "..."
              : message.content;
          // Cannot reliably determine sender or exact date from RawCommunicationContentItem
          // For now, just list content. If more detail is needed, RawCommunicationThread structure needs enrichment.
          historyStr += `    - Message ${messageIndex + 1}: ${truncatedContent}\n`;
        });
      }
    });
  }

  if (donationHistory.length === 0 && communicationHistory.length === 0) {
    historyStr += "No significant donation or communication history found.\n";
  }
  return historyStr;
}

function formatDonorJourneyGraph(donorJourneyGraph: DonorJourney): string {
  let graphStr = "\nDonor Journey Stages Definition:\n";
  donorJourneyGraph.nodes.forEach((node: DonorJourneyNode) => {
    // Typed node
    graphStr += `- Stage ID: ${node.id}, Label: ${node.label}, Description: ${node.properties?.description || "N/A"}\n`;
  });
  graphStr += "\nPossible Transitions (Edges):\n";
  donorJourneyGraph.edges.forEach((edge: DonorJourneyEdge) => {
    // Typed edge
    graphStr += `- From stage '${edge.source}' to stage '${edge.target}' (Condition/Trigger: ${edge.label || "N/A"})\n`;
  });
  return graphStr;
}

export function buildStageClassificationPrompt(
  donorInfo: DonorAnalysisInfo,
  donorJourneyGraph: DonorJourney,
  communicationHistory: RawCommunicationThread[],
  donationHistory: DonationWithDetails[]
): string {
  const donorHistoryStr = formatDonorHistory(communicationHistory, donationHistory);
  const journeyStagesStr = formatDonorJourneyGraph(donorJourneyGraph);

  return `
    You are an expert donor relationship analyst.
    Your task is to classify a donor into a specific stage of the donor journey.
    
    Donor Information:
    - ID: ${donorInfo.id}
    - Name: ${donorInfo.name}
    - Email: ${donorInfo.email}
    
    ${journeyStagesStr}
    ${donorHistoryStr}
    
    Based on the donor's information, their history, and the defined journey stages, which stage ID is most appropriate for this donor?
    
    Please respond with a JSON object containing the key "stageId" and the ID of the classified stage, and an optional "reasoning" field.
    Example: {"stageId": "some-stage-id", "reasoning": "The donor recently made their first donation and has engaged with initial welcome communications."}
  `;
}

export function buildStageTransitionPrompt(
  donorInfo: DonorAnalysisInfo,
  currentStageId: string,
  donorJourneyGraph: DonorJourney,
  communicationHistory: RawCommunicationThread[],
  donationHistory: DonationWithDetails[]
): string {
  const donorHistoryStr = formatDonorHistory(communicationHistory, donationHistory);
  const journeyGraphStr = formatDonorJourneyGraph(donorJourneyGraph);
  const currentStage = donorJourneyGraph.nodes.find((n: DonorJourneyNode) => n.id === currentStageId); // Typed n

  return `
    You are an expert donor relationship analyst.
    Your task is to determine if a donor should transition from their current stage to a new one.
    
    Donor Information:
    - ID: ${donorInfo.id}
    - Name: ${donorInfo.name}
    - Email: ${donorInfo.email}
    
    Current Stage:
    - ID: ${currentStageId}
    - Label: ${currentStage?.label || "Unknown"}
    - Description: ${currentStage?.properties?.description || "N/A"}

    ${journeyGraphStr}
    ${donorHistoryStr}
    
    Considering the donor's current stage, their recent history, and the available transitions in the donor journey:
    1. Can the donor transition to a new stage?
    2. If yes, which stage ID is the most appropriate next stage?
    
    Please respond with a JSON object containing "canTransition" (boolean), "nextStageId" (string, or null if no transition), and an optional "reasoning" field.
    Example: {"canTransition": true, "nextStageId": "next-stage-id", "reasoning": "The donor has met the criteria for moving to the engagement phase based on recent activity."}
    Example (no transition): {"canTransition": false, "nextStageId": null, "reasoning": "The donor has not yet met the conditions for any available transitions from their current stage."}
  `;
}

export function buildActionPredictionPrompt(
  donorInfo: DonorAnalysisInfo,
  currentStageId: string,
  donorJourneyGraph: DonorJourney,
  communicationHistory: RawCommunicationThread[],
  donationHistory: DonationWithDetails[]
): string {
  const donorHistoryStr = formatDonorHistory(communicationHistory, donationHistory);
  const journeyGraphStr = formatDonorJourneyGraph(donorJourneyGraph); // Includes stages and edges
  const currentStage = donorJourneyGraph.nodes.find((n: DonorJourneyNode) => n.id === currentStageId); // Typed n

  return `
    You are an expert donor engagement strategist.
    Your task is to predict 2-3 suitable next actions to take with a specific donor, given their current stage in the donor journey and their history.
    
    Donor Information:
    - ID: ${donorInfo.id}
    - Name: ${donorInfo.name}
    - Email: ${donorInfo.email}

    Current Stage:
    - ID: ${currentStageId}
    - Label: ${currentStage?.label || "Unknown"}
    - Description: ${currentStage?.properties?.description || "N/A"}
    
    ${journeyGraphStr}
    ${donorHistoryStr}
    
    Based on the donor's current stage, their history, and the overall donor journey, suggest 2-3 specific, actionable next steps.
    For each action, provide:
    - "type": (e.g., "email", "call", "meeting", "appeal", "event_invitation", "custom_message", "other")
    - "description": A brief summary of the action.
    - "explanation": Why this action is appropriate for this donor at this stage.
    - "instruction": Concrete guidance or key talking points for executing the action.
    
    Respond with a JSON object containing an "actions" array, where each element is an action object as described above.
    Example:
    {
      "actions": [
        {
          "type": "email",
          "description": "Send a personalized thank-you email for their recent donation.",
          "explanation": "Acknowledging their recent contribution promptly will strengthen their connection.",
          "instruction": "Draft an email mentioning their specific donation amount and date. Reference the project they supported if applicable. Express gratitude and briefly reiterate the impact of such donations."
        },
        {
          "type": "event_invitation",
          "description": "Invite to upcoming webinar on Q3 impact.",
          "explanation": "This donor is in an engagement stage and showing interest in organizational impact; an event invitation is a good next step.",
          "instruction": "Send the standard event invitation email, possibly with a short personal note highlighting a relevant topic from the webinar agenda."
        }
      ]
    }
  `;
}
