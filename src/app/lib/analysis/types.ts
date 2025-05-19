import type { DonorJourney } from "@/app/lib/data/organizations"; // Assuming this type exists
import type { Donor } from "@/app/(app)/donors/columns"; // Assuming Donor type
import type { RawCommunicationThread } from "@/app/lib/utils/email-generator/types"; // Reusing from email generator
import type { DonationWithDetails } from "@/app/lib/data/donations"; // Reusing from email generator

/**
 * Represents the necessary information for a donor for analysis tasks.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface DonorAnalysisInfo extends Pick<Donor, "id" | "name" | "email"> {
  // Potentially add other relevant donor fields if needed directly by services
  // e.g., currentStageId if fetched upfront
}

/**
 * Input for stage classification.
 */
export interface StageClassificationInput {
  donorInfo: DonorAnalysisInfo;
  donorJourneyGraph: DonorJourney; // The full journey graph
  communicationHistory: RawCommunicationThread[];
  donationHistory: DonationWithDetails[];
  // relevantMemories?: string[]; // Optional: if personal/org memories are used
}

/**
 * Output of stage classification.
 */
export interface StageClassificationOutput {
  donorId: string;
  classifiedStageId: string;
  reasoning?: string; // Optional explanation from LLM
}

/**
 * Input for stage transition classification.
 */
export interface StageTransitionInput extends StageClassificationInput {
  currentStageId: string;
}

/**
 * Output of stage transition classification.
 */
export interface StageTransitionOutput {
  donorId: string;
  canTransition: boolean;
  nextStageId?: string | null;
  reasoning?: string;
}

/**
 * Defines a predicted action for a donor.
 */
export interface PredictedAction {
  type: "email" | "call" | "meeting" | "appeal" | "event_invitation" | "custom_message" | "other";
  description: string; // e.g., "Send a personalized thank-you email for recent donation."
  explanation: string; // Why this action is recommended
  instruction: string; // How to perform the action, or key talking points
  // Optional: recommendedTiming?: string; // e.g., "within 24 hours", "next week"
  // Optional: emailSubject?: string; // If type is email
  // Optional: emailBodyTemplate?: string; // If type is email
}

/**
 * Input for action prediction.
 */
export interface ActionPredictionInput extends StageClassificationInput {
  currentStageId: string; // Stage after classification/transition
}

/**
 * Output of action prediction.
 */
export interface ActionPredictionOutput {
  donorId: string;
  predictedActions: PredictedAction[];
}

// General LLM response structures if needed for parsing raw AI output
export interface LLMStageClassificationResponse {
  stageId: string;
  reasoning?: string;
}

export interface LLMStageTransitionResponse {
  canTransition: boolean;
  nextStageId?: string | null;
  reasoning?: string;
}

export interface LLMActionPredictionResponse {
  actions: PredictedAction[];
}
