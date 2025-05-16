/**
 * This module provides functions for generating personalized donor emails using AI.
 * It includes capabilities for incorporating donation history, communication history,
 * and organization-specific guidelines into the email generation process.
 *
 * The primary functions exported are:
 * - generateDonorEmail: Generates a single email with structured content and references.
 * - generateDonorEmails: Generates multiple emails in batch.
 */

export { generateDonorEmail, generateDonorEmails } from "./service";

// Optionally, re-export key types if they are part of the public API of this module
export type {
  GeneratedEmail,
  EmailPiece,
  GenerateEmailOptions,
  DonorInfo,
  DonationInfo,
  Organization,
  RawCommunicationThread,
  RawCommunicationHistory, // from ./types which re-exports from @/app/lib/data/communications
} from "./types";
