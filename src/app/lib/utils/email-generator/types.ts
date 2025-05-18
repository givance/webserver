import { CommunicationHistory as RawCommunicationHistory } from "@/app/lib/data/communications";
import { DonationWithDetails } from "../../data/donations";

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

export interface DonorInfo {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  donationHistory?: DonationInfo[]; // Will be processed to add IDs
}

export interface FormattedCommunicationMessage {
  id: string; // e.g., comm-01-02 (threadIndex-messageIndex)
  content: string;
}

export interface GenerateEmailOptions {
  donor: DonorInfo;
  instruction: string;
  organizationName: string;
  organization: Organization | null;
  organizationWritingInstructions?: string;
  communicationHistory: RawCommunicationHistory[]; // Will be processed
  donationHistory?: DonationWithDetails[]; // Will be processed
  personalMemories?: string[];
  organizationalMemories?: string[];
}

export interface EmailPiece {
  piece: string;
  references: string[]; // List of IDs like "donation-01", "comm-01-02", "summary-paragraph-03"
  addNewlineAfter: boolean; // Whether to add a newline after this piece
}

export interface GeneratedEmail {
  donorId: number;
  subject: string; // The email subject line
  structuredContent: EmailPiece[];
  referenceContexts: Record<string, string>; // Map of reference IDs to their context
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

export interface InstructionRefinementInput {
  userInstruction: string;
  previousInstruction?: string;
  organizationWritingInstructions?: string;
  userFeedback?: string;
  userMemories: string[];
  organizationMemories: string[];
  dismissedMemories: string[];
}

export interface InstructionRefinementResult {
  refinedInstruction: string;
  reasoning: string;
  suggestedMemories?: string[];
}

export interface EmailGeneratorTool {
  generateEmails: (
    donors: DonorInfo[],
    refinedInstruction: string,
    organizationName: string,
    organization: Organization | null,
    organizationWritingInstructions?: string,
    communicationHistories?: Record<number, RawCommunicationThread[]>,
    donationHistories?: Record<number, DonationWithDetails[]>
  ) => Promise<GeneratedEmail[]>;
}
