import { CommunicationHistory as RawCommunicationHistory } from '@/app/lib/data/communications';
import { DonationWithDetails } from '../../data/donations';
import { DonorNameFields } from '../donor-name-formatter';
import { PersonResearchResult } from '../../services/person-research/types';
import { type DonorNote } from '@/app/lib/db/schema';

/**
 * Token usage information from AI API calls
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Aggregated token usage for email generation
 */
export interface EmailGenerationTokenUsage {
  emailGeneration: TokenUsage;
  total: TokenUsage;
}

export interface Organization {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  slug: string | null;
  imageUrl: string | null;
  createdBy: string | null;
  websiteUrl: string | null;
  websiteSummary?: string | null; // Keep for backward compatibility
  rawWebsiteSummary?: string | null; // Optional for backward compatibility
  websiteSummaryParagraphs?: Array<{ id: string; content: string }>; // Parsed version
  writingInstructions: string | null;
  updatedAt: Date;
}

export interface DonationInfo {
  id?: string; // Auto-generated e.g., donation-01
  amount: number;
  date: Date;
  project: {
    id: number;
    name: string;
    description: string | null;
    goal: number | null;
    status: string;
  } | null;
}

// Comprehensive donor statistics interface
export interface DonorStatistics {
  totalDonations: number;
  totalAmount: number;
  firstDonation: { date: Date; amount: number } | null;
  lastDonation: { date: Date; amount: number } | null;
  donationsByProject: {
    projectId: number | null;
    projectName: string | null;
    totalAmount: number;
  }[];
}

export interface DonorInfo extends DonorNameFields {
  id: number;
  email: string;
  notes?: DonorNote[] | null; // User notes about the donor
  donationHistory?: DonationInfo[]; // Will be processed to add IDs
}

export interface FormattedCommunicationMessage {
  id: string; // e.g., comm-01-02 (threadIndex-messageIndex)
  content: string;
}

export interface GenerateEmailOptions {
  donor: DonorInfo;
  organizationName: string;
  organization: Organization | null;
  organizationWritingInstructions?: string;
  personalWritingInstructions?: string;
  communicationHistory: RawCommunicationHistory[]; // Will be processed
  donationHistory?: DonationWithDetails[]; // Will be processed
  donorStatistics?: DonorStatistics; // Comprehensive donor statistics
  personResearch?: PersonResearchResult; // Person research results for personalization
  personalMemories?: string[];
  organizationalMemories?: string[];
  currentDate?: string; // Added for today's date
  emailSignature?: string; // User's email signature
  staffName?: string; // Name of the staff member sending the email
}

export interface EmailPiece {
  piece: string;
  references: string[]; // List of IDs like "donation-01", "comm-01-02", "summary-paragraph-03"
  addNewlineAfter: boolean; // Whether to add a newline after this piece
}

// New simplified email format
export interface NewEmailFormat {
  subject: string;
  reasoning: string;
  emailContent: string;
}

// Legacy email format (current)
export interface LegacyEmailFormat {
  donorId: number;
  subject: string;
  structuredContent: EmailPiece[];
  referenceContexts: Record<string, string>; // Map of reference IDs to their context
  tokenUsage: TokenUsage;
}

// Combined format for backward compatibility
export interface GeneratedEmail {
  donorId: number;
  subject: string;

  // Legacy format fields (for backward compatibility - optional for new emails)
  structuredContent?: EmailPiece[];
  referenceContexts?: Record<string, string>; // Map of reference IDs to their context

  // New format fields (for new generation)
  emailContent?: string; // Plain text email content
  reasoning?: string; // AI's reasoning for the email generation
  response?: string; // User-facing summary of what was delivered

  tokenUsage: TokenUsage; // Add token usage tracking for individual email generation
}

// Re-exporting RawCommunicationHistory if its definition is needed by consumers of these types.
// Or, if it's only used internally for processing, it might not need to be re-exported here.
export type { RawCommunicationHistory };

// Type for communication history structure based on existing usage
// h.content?.map((c: { content: string }) => c.content)
// This implies CommunicationHistory is an array of items,
// and each item 'h' has a 'content' property which is an array of objects,
// and each of those objects 'c' has a 'content' string.
// Let's refine this if possible, but for now, this matches the input.
// We can refer to elements of RawCommunicationHistory as RawCommunicationThread.
export interface RawCommunicationContentItem {
  content: string;
}
export interface RawCommunicationThread {
  // Assuming it might have other properties, but for formatting we only used 'content'
  content?: RawCommunicationContentItem[];
  // Potentially other fields like 'id', 'date', 'type' from the original CommunicationHistory
}

export interface EmailGeneratorTool {
  generateEmails: (
    donors: DonorInfo[],
    refinedInstruction: string,
    organizationName: string,
    organization: Organization | null,
    organizationWritingInstructions?: string,
    personalWritingInstructions?: string,
    communicationHistories?: Record<number, RawCommunicationThread[]>,
    donationHistories?: Record<number, DonationWithDetails[]>,
    donorStatistics?: Record<number, DonorStatistics>,
    personResearchResults?: Record<number, PersonResearchResult>,
    personalMemories?: string[],
    organizationalMemories?: string[],
    currentDate?: string,
    staffName?: string
  ) => Promise<GeneratedEmail[]>;
}

/**
 * Helper function to create empty token usage
 */
export function createEmptyTokenUsage(): TokenUsage {
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };
}

/**
 * Helper function to add token usage together
 */
export function addTokenUsage(usage1: TokenUsage, usage2: TokenUsage): TokenUsage {
  return {
    promptTokens: usage1.promptTokens + usage2.promptTokens,
    completionTokens: usage1.completionTokens + usage2.completionTokens,
    totalTokens: usage1.totalTokens + usage2.totalTokens,
  };
}

/**
 * Helper function to create empty email generation token usage
 */
export function createEmptyEmailGenerationTokenUsage(): EmailGenerationTokenUsage {
  return {
    emailGeneration: createEmptyTokenUsage(),
    total: createEmptyTokenUsage(),
  };
}
