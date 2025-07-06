/**
 * This module provides functions for generating personalized donor emails using AI.
 * It includes capabilities for incorporating donation history, communication history,
 * and organization-specific guidelines into the email generation process.
 *
 * The module exports:
 * - EmailGenerationService: Service class for generating emails
 * - generateSmartDonorEmails: High-level function for email generation
 */

export { EmailGenerationService } from "./service";

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
  EmailGeneratorTool,
} from "./types";

// Export the high-level smart email generation function
export { generateSmartDonorEmails } from "./smart-email-generator";
