/**
 * Base types for CRM integrations
 */

export interface CrmDonor {
  externalId: string;
  firstName: string;
  lastName: string;
  displayName?: string;
  email: string;
  phone?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  isCouple?: boolean;
  hisFirstName?: string;
  hisLastName?: string;
  herFirstName?: string;
  herLastName?: string;
  metadata?: Record<string, any>;
}

export interface CrmDonation {
  externalId: string;
  donorExternalId: string;
  amount: number; // In cents
  currency: string;
  date: Date;
  designation?: string; // Maps to project
  campaignExternalId?: string; // External ID of the campaign
  metadata?: Record<string, any>;
}

export interface CrmProject {
  externalId: string;
  name: string;
  description?: string;
  active: boolean;
  goal?: number; // In cents
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface CrmSyncResult {
  donors: {
    total: number; // Total fetched from Salesforce
    created: number; // New records created
    updated: number; // Existing records updated
    unchanged: number; // Existing records that had no changes
    failed: number;
    errors: Array<{ externalId: string; error: string }>;
    // Track actual donors in each category
    createdDonors?: Array<{ externalId: string; displayName: string }>;
    updatedDonors?: Array<{ externalId: string; displayName: string }>;
    unchangedDonors?: Array<{ externalId: string; displayName: string }>;
  };
  donations: {
    total: number; // Total fetched from Salesforce
    created: number; // New records created
    updated: number; // Existing records updated
    unchanged: number; // Existing records that had no changes
    failed: number;
    errors: Array<{ externalId: string; error: string }>;
    // Track actual donations in each category
    createdDonations?: Array<{ externalId: string; amount: number; date: Date }>;
    updatedDonations?: Array<{ externalId: string; amount: number; date: Date }>;
    unchangedDonations?: Array<{ externalId: string; amount: number; date: Date }>;
  };
  projects?: {
    total: number; // Total fetched from Salesforce
    created: number; // New records created
    updated: number; // Existing records updated
    unchanged: number; // Existing records that had no changes
    failed: number;
    errors: Array<{ externalId: string; error: string }>;
    // Track actual projects in each category
    createdProjects?: Array<{ externalId: string; name: string }>;
    updatedProjects?: Array<{ externalId: string; name: string }>;
    unchangedProjects?: Array<{ externalId: string; name: string }>;
  };
  totalTime: number;
}

export interface CrmProvider {
  readonly name: string;
  readonly displayName: string;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt?: Date;
  scope?: string;
  tokenType?: string;
  metadata?: Record<string, any>;
}

export interface PaginationParams {
  limit: number;
  offset?: number;
  pageToken?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  hasMore: boolean;
  nextPageToken?: string;
  totalCount?: number;
}
