import { ICrmProvider } from '../base/crm-provider.interface';
import {
  CrmDonor,
  CrmDonation,
  OAuthTokens,
  PaginationParams,
  PaginatedResponse,
} from '../base/types';
import {
  BlackbaudConstituent,
  BlackbaudGift,
  BlackbaudListResponse,
  BlackbaudTokenResponse,
} from './blackbaud.types';
import { BlackbaudMapper } from './blackbaud-mapper';
import { env } from '@/app/lib/env';
import { logger } from '@/app/lib/logger';

/**
 * Blackbaud Sky API provider implementation
 */
export class BlackbaudService implements ICrmProvider {
  readonly name = 'blackbaud';
  readonly displayName = 'Blackbaud';

  private readonly isSandbox = env.BLACKBAUD_USE_SANDBOX === 'true';
  private readonly baseUrl = this.isSandbox
    ? 'https://api.sky.blackbaud.com' // Sandbox uses same API URL
    : 'https://api.sky.blackbaud.com';
  private readonly authUrl = this.isSandbox
    ? 'https://oauth2.sky.blackbaud.com' // Sandbox uses same OAuth URL
    : 'https://oauth2.sky.blackbaud.com';
  private readonly clientId = env.BLACKBAUD_CLIENT_ID || '';
  private readonly clientSecret = env.BLACKBAUD_CLIENT_SECRET || '';
  private readonly subscriptionKey = env.BLACKBAUD_SUBSCRIPTION_KEY || '';

  constructor() {
    if (!this.clientId || !this.clientSecret || !this.subscriptionKey) {
      logger.warn('Blackbaud credentials not configured');
    }

    if (this.isSandbox) {
      logger.info('Blackbaud service initialized in SANDBOX mode');
    }
  }

  /**
   * Generate OAuth authorization URL
   */
  getAuthorizationUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      state,
    });

    return `${this.authUrl}/authorization?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access tokens
   */
  async exchangeAuthCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const response = await fetch(`${this.authUrl}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('Blackbaud token exchange failed', { error, status: response.status });
      throw new Error(`Failed to exchange authorization code: ${response.status}`);
    }

    const data: BlackbaudTokenResponse = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scope: data.scope,
      tokenType: data.token_type,
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    const response = await fetch(`${this.authUrl}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('Blackbaud token refresh failed', { error, status: response.status });
      throw new Error(`Failed to refresh access token: ${response.status}`);
    }

    const data: BlackbaudTokenResponse = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scope: data.scope,
      tokenType: data.token_type,
    };
  }

  /**
   * Validate if the access token is still valid
   */
  async validateToken(accessToken: string): Promise<boolean> {
    try {
      // Make a simple API call to validate the token
      const response = await this.makeApiRequest(
        '/constituent/v1/constituents?limit=1',
        accessToken
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Fetch donors/constituents from Blackbaud
   */
  async fetchDonors(
    accessToken: string,
    params: PaginationParams,
    metadata?: Record<string, any>
  ): Promise<PaginatedResponse<CrmDonor>> {
    const url = params.pageToken || `/constituent/v1/constituents?limit=${params.limit}`;

    const response = await this.makeApiRequest(url, accessToken);

    if (!response.ok) {
      throw new Error(`Failed to fetch constituents: ${response.status}`);
    }

    const data: BlackbaudListResponse<BlackbaudConstituent> = await response.json();

    return {
      data: data.value.map((constituent) => BlackbaudMapper.mapConstituent(constituent)),
      hasMore: !!data.next_link,
      nextPageToken: data.next_link,
      totalCount: data.count,
    };
  }

  /**
   * Fetch donations/gifts from Blackbaud
   */
  async fetchDonations(
    accessToken: string,
    params: PaginationParams,
    metadata?: Record<string, any>
  ): Promise<PaginatedResponse<CrmDonation>> {
    const url = params.pageToken || `/gift/v1/gifts?limit=${params.limit}`;

    const response = await this.makeApiRequest(url, accessToken);

    if (!response.ok) {
      throw new Error(`Failed to fetch gifts: ${response.status}`);
    }

    const data: BlackbaudListResponse<BlackbaudGift> = await response.json();

    return {
      data: data.value.map((gift) => BlackbaudMapper.mapGift(gift)),
      hasMore: !!data.next_link,
      nextPageToken: data.next_link,
      totalCount: data.count,
    };
  }

  /**
   * Get donor by external ID
   */
  async getDonorById(accessToken: string, externalId: string): Promise<CrmDonor | null> {
    try {
      const response = await this.makeApiRequest(
        `/constituent/v1/constituents/${externalId}`,
        accessToken
      );

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Failed to fetch constituent: ${response.status}`);
      }

      const constituent: BlackbaudConstituent = await response.json();
      return BlackbaudMapper.mapConstituent(constituent);
    } catch (error) {
      logger.error('Failed to get donor by ID', { error, externalId });
      return null;
    }
  }

  /**
   * Make an API request to Blackbaud
   */
  private async makeApiRequest(pathOrUrl: string, accessToken: string): Promise<Response> {
    // Handle both full URLs (for pagination) and paths
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${this.baseUrl}${pathOrUrl}`;

    return await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Bb-Api-Subscription-Key': this.subscriptionKey,
        'Content-Type': 'application/json',
      },
    });
  }
}
