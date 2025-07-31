import {
  CrmDonor,
  CrmDonation,
  CrmProject,
  OAuthTokens,
  PaginationParams,
  PaginatedResponse,
  CrmProvider,
} from './types';

/**
 * Base interface for all CRM provider implementations
 */
export interface ICrmProvider extends CrmProvider {
  /**
   * Exchange authorization code for access tokens
   */
  exchangeAuthCode(code: string, redirectUri: string, state?: string): Promise<OAuthTokens>;

  /**
   * Refresh access token using refresh token
   */
  refreshAccessToken(refreshToken: string): Promise<OAuthTokens>;

  /**
   * Fetch donors/constituents from the CRM
   */
  fetchDonors(
    accessToken: string,
    params: PaginationParams,
    metadata?: Record<string, any>
  ): Promise<PaginatedResponse<CrmDonor>>;

  /**
   * Fetch donations/gifts from the CRM
   */
  fetchDonations(
    accessToken: string,
    params: PaginationParams,
    metadata?: Record<string, any>
  ): Promise<PaginatedResponse<CrmDonation>>;

  /**
   * Generate OAuth authorization URL
   */
  getAuthorizationUrl(state: string, redirectUri: string): string | Promise<string>;

  /**
   * Validate if the access token is still valid
   */
  validateToken(accessToken: string): Promise<boolean>;

  /**
   * Get donor by external ID (optional - not all CRMs may support this)
   */
  getDonorById?(accessToken: string, externalId: string): Promise<CrmDonor | null>;

  /**
   * Get donation by external ID (optional - not all CRMs may support this)
   */
  getDonationById?(accessToken: string, externalId: string): Promise<CrmDonation | null>;

  /**
   * Fetch projects/campaigns from the CRM (optional - not all CRMs may support this)
   */
  fetchProjects?(
    accessToken: string,
    params: PaginationParams,
    metadata?: Record<string, any>
  ): Promise<PaginatedResponse<CrmProject>>;

  /**
   * Upload donors to the CRM (optional - not all CRMs may support this)
   */
  uploadDonors?(
    accessToken: string,
    donors: CrmDonor[],
    metadata?: Record<string, any>
  ): Promise<CrmDonor[]>;

  /**
   * Upload donations to the CRM (optional - not all CRMs may support this)
   */
  uploadDonations?(
    accessToken: string,
    donations: CrmDonation[],
    metadata?: Record<string, any>
  ): Promise<CrmDonation[]>;

  /**
   * Upload projects/campaigns to the CRM (optional - not all CRMs may support this)
   */
  uploadProjects?(
    accessToken: string,
    projects: CrmProject[],
    metadata?: Record<string, any>
  ): Promise<CrmProject[]>;
}
