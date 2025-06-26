/**
 * Type definitions for WhatsApp AI service
 */

export interface WhatsAppAIRequest {
  message: string;
  organizationId: string;
  staffId: number;
  fromPhoneNumber: string;
  isTranscribed?: boolean; // Flag to indicate if this message was transcribed from voice
}

export interface WhatsAppAIResponse {
  response: string;
  tokensUsed: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// Type definitions for donor data
export interface DonorSearchResult {
  id: number;
  firstName: string;
  lastName: string;
  displayName: string | null;
  email: string;
  phone: string | null;
  isCouple: boolean;
  totalDonations: number;
  donationCount: number;
}

export interface DonorDetailsResult {
  id: number;
  firstName: string;
  lastName: string;
  displayName: string | null;
  email: string;
  phone: string | null;
  address: string | null;
  state: string | null;
  isCouple: boolean;
  hisFirstName: string | null;
  hisLastName: string | null;
  herFirstName: string | null;
  herLastName: string | null;
  notes: string | Array<{ createdAt: string; createdBy: string; content: string }> | null;
  currentStageName: string | null;
  highPotentialDonor: boolean | null;
  assignedStaff: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  totalDonations: number;
  donationCount: number;
  lastDonationDate: Date | null;
}

export interface DonationHistoryResult {
  id: number;
  date: Date;
  amount: number;
  currency: string;
  projectName: string;
  projectId: number;
}

export interface DonorStatisticsResult {
  totalDonors: number;
  totalDonations: number;
  totalDonationAmount: number;
  averageDonationAmount: number;
  highPotentialDonors: number;
  couplesCount: number;
  individualsCount: number;
}

export interface TopDonorsResult {
  id: number;
  firstName: string;
  lastName: string;
  displayName: string | null;
  email: string;
  totalDonations: number;
  donationCount: number;
  lastDonationDate: Date | null;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface SQLError {
  message: string;
  type: string;
  suggestion?: string;
}

export interface SQLToolResult {
  error?: boolean;
  errorType?: string;
  errorMessage?: string;
  suggestion?: string;
  feedback?: string;
  failedQuery?: string;
  retryAttempt?: number;
  instructions?: string;
  [key: string]: any;
}

export interface ClarificationToolResult {
  clarificationAsked: boolean;
  question: string;
  context: string;
}