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
  metadata?: Record<string, any>;
}

export interface CrmSyncResult {
  donors: {
    created: number;
    updated: number;
    failed: number;
    errors: Array<{ externalId: string; error: string }>;
  };
  donations: {
    created: number;
    updated: number;
    failed: number;
    errors: Array<{ externalId: string; error: string }>;
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
