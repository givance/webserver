import { ICrmProvider } from '../base/crm-provider.interface';
import {
  CrmDonor,
  CrmDonation,
  OAuthTokens,
  PaginationParams,
  PaginatedResponse,
} from '../base/types';
import {
  SalesforceContact,
  SalesforceAccount,
  SalesforceOpportunity,
  SalesforceQueryResponse,
  SalesforceTokenResponse,
  SalesforceErrorResponse,
} from './salesforce.types';
import { SalesforceMapper } from './salesforce-mapper';
import { env } from '@/app/lib/env';
import { logger } from '@/app/lib/logger';

/**
 * Salesforce API provider implementation
 */
export class SalesforceService implements ICrmProvider {
  readonly name = 'salesforce';
  readonly displayName = 'Salesforce';

  private readonly isSandbox = !!env.SALESFORCE_USE_SANDBOX;
  private readonly authUrl = this.isSandbox
    ? 'https://test.salesforce.com'
    : 'https://login.salesforce.com';
  private readonly clientId = env.SALESFORCE_CLIENT_ID || '';
  private readonly clientSecret = env.SALESFORCE_CLIENT_SECRET || '';
  private readonly apiVersion = 'v60.0'; // Latest stable API version
  private static hasLoggedInit = false;

  constructor() {
    // Only log initialization once to avoid spam during build
    if (!SalesforceService.hasLoggedInit) {
      logger.info('Salesforce service initializing', {
        isSandbox: this.isSandbox,
        hasClientId: !!this.clientId,
        clientIdLength: this.clientId.length,
        clientIdPrefix: this.clientId.substring(0, 10) + '...',
        hasClientSecret: !!this.clientSecret,
        clientSecretLength: this.clientSecret.length,
        authUrl: this.authUrl,
        apiVersion: this.apiVersion,
      });

      if (!this.clientId || !this.clientSecret) {
        logger.warn('Salesforce credentials not configured', {
          missingClientId: !this.clientId,
          missingClientSecret: !this.clientSecret,
        });
      }

      if (this.isSandbox) {
        logger.info('Salesforce service initialized in SANDBOX mode');
      }

      SalesforceService.hasLoggedInit = true;
    }
  }

  /**
   * Generate OAuth authorization URL
   */
  getAuthorizationUrl(state: string, redirectUri: string): string {
    logger.info('Generating Salesforce authorization URL', {
      redirectUri,
      stateLength: state.length,
      hasClientId: !!this.clientId,
    });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: redirectUri,
      state,
      scope: 'api refresh_token offline_access',
    });

    const authUrl = `${this.authUrl}/services/oauth2/authorize?${params.toString()}`;

    logger.info('Generated authorization URL', {
      authUrl,
      paramsClientId: params.get('client_id'),
      paramsRedirectUri: params.get('redirect_uri'),
    });

    return authUrl;
  }

  /**
   * Exchange authorization code for access tokens
   */
  async exchangeAuthCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const response = await fetch(`${this.authUrl}/services/oauth2/token`, {
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
      logger.error('Salesforce token exchange failed', { error, status: response.status });
      throw new Error(`Failed to exchange authorization code: ${response.status}`);
    }

    const data: SalesforceTokenResponse = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      scope: data.scope,
      tokenType: data.token_type,
      // Salesforce tokens don't expire by default unless configured
      // We'll set a reasonable expiry of 2 hours
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      // Store instance URL in metadata for API calls
      metadata: {
        instanceUrl: data.instance_url,
        id: data.id,
        issuedAt: data.issued_at,
      },
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    const response = await fetch(`${this.authUrl}/services/oauth2/token`, {
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
      logger.error('Salesforce token refresh failed', { error, status: response.status });
      throw new Error(`Failed to refresh access token: ${response.status}`);
    }

    const data: SalesforceTokenResponse = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken,
      scope: data.scope,
      tokenType: data.token_type,
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    };
  }

  /**
   * Validate if the access token is still valid
   */
  async validateToken(accessToken: string): Promise<boolean> {
    // We need the instance URL to validate the token
    // This would typically be stored with the integration
    // For now, we'll return true and let the API calls handle invalid tokens
    return true;
  }

  /**
   * Make authenticated API request to Salesforce
   */
  private async makeApiRequest<T>(
    accessToken: string,
    endpoint: string,
    metadata?: Record<string, any>
  ): Promise<T> {
    const instanceUrl = metadata?.instanceUrl;
    if (!instanceUrl) {
      throw new Error('Instance URL not found in metadata');
    }

    const url = `${instanceUrl}/services/data/${this.apiVersion}${endpoint}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error: SalesforceErrorResponse = await response.json();
      logger.error('Salesforce API request failed', {
        error,
        status: response.status,
        endpoint,
      });
      throw new Error(`Salesforce API error: ${error[0]?.message || response.statusText}`);
    }

    return response.json();
  }

  /**
   * Fetch donors (Contacts and Accounts) from Salesforce
   */
  async fetchDonors(
    accessToken: string,
    params: PaginationParams,
    metadata?: Record<string, any>
  ): Promise<PaginatedResponse<CrmDonor>> {
    const donors: CrmDonor[] = [];
    let hasMore = false;
    let nextPageToken: string | undefined;

    // Fetch Contacts
    const contactQuery = params.pageToken
      ? `/query/${params.pageToken}`
      : `/query?q=${encodeURIComponent(
          `SELECT Id, FirstName, LastName, Email, Phone, MobilePhone, 
           MailingStreet, MailingCity, MailingState, MailingPostalCode, MailingCountry,
           AccountId, Title, Department, Description, CreatedDate, LastModifiedDate, IsDeleted
           FROM Contact 
           WHERE IsDeleted = false 
           ORDER BY LastModifiedDate DESC 
           LIMIT ${params.limit}`
        )}`;

    try {
      const contactResponse = await this.makeApiRequest<SalesforceQueryResponse<SalesforceContact>>(
        accessToken,
        contactQuery,
        metadata
      );

      // Map contacts to donors
      contactResponse.records.forEach((contact) => {
        donors.push(SalesforceMapper.mapContact(contact));
      });

      hasMore = !contactResponse.done;
      nextPageToken = SalesforceMapper.extractPaginationInfo(contactResponse.nextRecordsUrl);

      // If we have room and no more contacts, fetch accounts
      if (!hasMore && donors.length < params.limit) {
        const accountQuery = `/query?q=${encodeURIComponent(
          `SELECT Id, Name, Type, Phone, Website,
           BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry,
           Description, NumberOfEmployees, AnnualRevenue, CreatedDate, LastModifiedDate, IsDeleted
           FROM Account 
           WHERE IsDeleted = false 
           AND (Type = 'Household' OR Type = 'Individual' OR Type = 'Foundation')
           ORDER BY LastModifiedDate DESC 
           LIMIT ${params.limit - donors.length}`
        )}`;

        const accountResponse = await this.makeApiRequest<
          SalesforceQueryResponse<SalesforceAccount>
        >(accessToken, accountQuery, metadata);

        accountResponse.records.forEach((account) => {
          donors.push(SalesforceMapper.mapAccount(account));
        });

        hasMore = !accountResponse.done;
        if (accountResponse.nextRecordsUrl) {
          nextPageToken =
            'account:' + SalesforceMapper.extractPaginationInfo(accountResponse.nextRecordsUrl);
        }
      }
    } catch (error) {
      logger.error('Failed to fetch donors from Salesforce', { error });
      throw error;
    }

    return {
      data: donors,
      hasMore,
      nextPageToken,
      totalCount: donors.length,
    };
  }

  /**
   * Fetch donations (Opportunities) from Salesforce
   */
  async fetchDonations(
    accessToken: string,
    params: PaginationParams,
    metadata?: Record<string, any>
  ): Promise<PaginatedResponse<CrmDonation>> {
    const query = params.pageToken
      ? `/query/${params.pageToken}`
      : `/query?q=${encodeURIComponent(
          `SELECT Id, Name, AccountId, ContactId, Amount, CloseDate, StageName, Type,
           Description, CampaignId, IsClosed, IsWon, Probability, CreatedDate, LastModifiedDate, IsDeleted
           FROM Opportunity 
           WHERE IsDeleted = false 
           AND IsWon = true
           ORDER BY CloseDate DESC 
           LIMIT ${params.limit}`
        )}`;

    try {
      const response = await this.makeApiRequest<SalesforceQueryResponse<SalesforceOpportunity>>(
        accessToken,
        query,
        metadata
      );

      const donations = response.records.map((opportunity) =>
        SalesforceMapper.mapOpportunity(opportunity)
      );

      return {
        data: donations,
        hasMore: !response.done,
        nextPageToken: SalesforceMapper.extractPaginationInfo(response.nextRecordsUrl),
        totalCount: response.totalSize,
      };
    } catch (error) {
      logger.error('Failed to fetch donations from Salesforce', { error });
      throw error;
    }
  }

  /**
   * Get donor by external ID
   */
  async getDonorById(
    accessToken: string,
    externalId: string,
    metadata?: Record<string, any>
  ): Promise<CrmDonor | null> {
    try {
      // Check if it's a Contact or Account ID
      // Try Contact first
      try {
        const contact = await this.makeApiRequest<SalesforceContact>(
          accessToken,
          `/sobjects/Contact/${externalId}`,
          metadata
        );
        return SalesforceMapper.mapContact(contact);
      } catch (contactError) {
        // If contact not found, try Account
        const account = await this.makeApiRequest<SalesforceAccount>(
          accessToken,
          `/sobjects/Account/${externalId}`,
          metadata
        );
        return SalesforceMapper.mapAccount(account);
      }
    } catch (error) {
      logger.error('Failed to fetch donor by ID from Salesforce', { error, externalId });
      return null;
    }
  }

  /**
   * Get donation by external ID
   */
  async getDonationById(
    accessToken: string,
    externalId: string,
    metadata?: Record<string, any>
  ): Promise<CrmDonation | null> {
    try {
      const opportunity = await this.makeApiRequest<SalesforceOpportunity>(
        accessToken,
        `/sobjects/Opportunity/${externalId}`,
        metadata
      );
      return SalesforceMapper.mapOpportunity(opportunity);
    } catch (error) {
      logger.error('Failed to fetch donation by ID from Salesforce', { error, externalId });
      return null;
    }
  }
}
