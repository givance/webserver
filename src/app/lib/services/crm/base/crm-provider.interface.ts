import {
  CrmDonor,
  CrmDonation,
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
  exchangeAuthCode(code: string, redirectUri: string): Promise<OAuthTokens>;

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
  getAuthorizationUrl(state: string, redirectUri: string): string;

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
}
