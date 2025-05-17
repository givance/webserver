/**
 * This module provides functions for generating personalized donor emails using AI.
 * It includes capabilities for incorporating donation history, communication history,
 * and organization-specific guidelines into the email generation process.
 *
 * The module exports:
 * - EmailGenerationService: Service class for generating emails
 * - InstructionRefinementAgent: Agent for refining email generation instructions
 * - generateSmartDonorEmails: High-level function combining both agents
 */

export { EmailGenerationService } from "./service";
export { InstructionRefinementAgent } from "./instruction-agent";

// Export types that are part of the public API
export type {
  GeneratedEmail,
  EmailPiece,
  GenerateEmailOptions,
  DonorInfo,
  DonationInfo,
  Organization,
  RawCommunicationThread,
  RawCommunicationHistory,
  InstructionRefinementInput,
  InstructionRefinementResult,
  EmailGeneratorTool,
} from "./types";

// Export the high-level smart email generation function
export { generateSmartDonorEmails } from "./smart-email-generator";
