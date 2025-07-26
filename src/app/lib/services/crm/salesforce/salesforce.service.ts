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
import {
  generatePKCEPair,
  storePKCEVerifier,
  getPKCEVerifier,
  deletePKCEVerifier,
} from '@/app/lib/utils/pkce';

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
  constructor() {
    // No initialization logging needed
  }

  /**
   * Generate OAuth authorization URL with PKCE
   */
  async getAuthorizationUrl(state: string, redirectUri: string): Promise<string> {
    logger.debug('Generating Salesforce authorization URL with PKCE', {
      redirectUri,
      stateLength: state.length,
      hasClientId: !!this.clientId,
    });

    // Generate PKCE pair
    const { codeVerifier, codeChallenge } = generatePKCEPair();

    logger.info('PKCE generated', {
      verifierLength: codeVerifier.length,
      challengeLength: codeChallenge.length,
      verifierPrefix: codeVerifier.substring(0, 20) + '...',
      challengePrefix: codeChallenge.substring(0, 20) + '...',
      state: state.substring(0, 50) + '...',
    });

    // Store the verifier associated with the state
    try {
      await storePKCEVerifier(state, codeVerifier);
      logger.info('PKCE verifier stored with state successfully');
    } catch (error) {
      logger.error('Failed to store PKCE verifier', {
        error,
        state: state.substring(0, 50) + '...',
      });
      throw new Error('Failed to store PKCE verifier');
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: redirectUri,
      state,
      scope: 'api refresh_token offline_access',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'login consent', // Forces login and approval
    });

    const authUrl = `${this.authUrl}/services/oauth2/authorize?${params.toString()}`;

    logger.debug('Generated authorization URL with PKCE', {
      authUrlLength: authUrl.length,
      hasCodeChallenge: !!params.get('code_challenge'),
    });

    return authUrl;
  }

  /**
   * Exchange authorization code for access tokens
   */
  async exchangeAuthCode(code: string, redirectUri: string, state?: string): Promise<OAuthTokens> {
    logger.info('Salesforce token exchange starting', {
      codeLength: code.length,
      codePrefix: code.substring(0, 20) + '...',
      redirectUri,
      hasState: !!state,
      stateLength: state?.length,
      authUrl: this.authUrl,
      clientIdPrefix: this.clientId.substring(0, 10) + '...',
    });

    // Get the code verifier from the state
    let codeVerifier: string | undefined;
    if (state) {
      codeVerifier = await getPKCEVerifier(state);
      logger.info('PKCE verifier lookup', {
        hasVerifier: !!codeVerifier,
        verifierLength: codeVerifier?.length,
        state: state.substring(0, 50) + '...',
      });
      // Don't delete the verifier yet - wait until after successful token exchange
    }

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: redirectUri,
    });

    // Add code verifier if available (PKCE)
    if (codeVerifier) {
      params.append('code_verifier', codeVerifier);
      logger.info('Added PKCE code_verifier to token request');
    } else {
      logger.warn('No PKCE code_verifier found - this will likely fail!');
    }

    logger.info('Salesforce token exchange request', {
      tokenUrl: `${this.authUrl}/services/oauth2/token`,
      params: {
        grant_type: params.get('grant_type'),
        client_id: params.get('client_id')?.substring(0, 10) + '...',
        redirect_uri: params.get('redirect_uri'),
        has_code_verifier: params.has('code_verifier'),
        code_length: params.get('code')?.length,
      },
    });

    const response = await fetch(`${this.authUrl}/services/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('Salesforce token exchange failed', { error, status: response.status });
      throw new Error(`Failed to exchange authorization code: ${response.status}`);
    }

    const data: SalesforceTokenResponse = await response.json();

    // Now that token exchange was successful, clean up the PKCE verifier
    if (state && codeVerifier) {
      await deletePKCEVerifier(state);
      logger.info('PKCE verifier cleaned up after successful token exchange');
    }

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

    logger.debug('Making Salesforce API request', {
      endpoint,
      instanceUrl,
      apiVersion: this.apiVersion,
      url,
    });

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
        url,
      });
      throw new Error(`Salesforce API error: ${error[0]?.message || response.statusText}`);
    }

    const data = await response.json();
    logger.debug('Salesforce API request successful', {
      endpoint,
      responseSize: JSON.stringify(data).length,
    });

    return data;
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
    const contactSOQL = `SELECT Id, FirstName, LastName, Email, Phone, MobilePhone, 
           MailingStreet, MailingCity, MailingState, MailingPostalCode, MailingCountry,
           AccountId, Title, Department, Description, CreatedDate, LastModifiedDate, IsDeleted
           FROM Contact 
           WHERE IsDeleted = false 
           ORDER BY LastModifiedDate DESC 
           LIMIT ${params.limit}`;

    const contactQuery = params.pageToken
      ? `/query/${params.pageToken}`
      : `/query?q=${encodeURIComponent(contactSOQL)}`;

    logger.info('Fetching Salesforce contacts', {
      soql: params.pageToken ? `Continuing from page token: ${params.pageToken}` : contactSOQL,
      limit: params.limit,
    });

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
    const opportunitySOQL = `SELECT Id, Name, AccountId, ContactId, Amount, CloseDate, StageName, Type,
           Description, CampaignId, IsClosed, IsWon, Probability, CreatedDate, LastModifiedDate, IsDeleted
           FROM Opportunity 
           WHERE IsDeleted = false 
           AND IsWon = true
           ORDER BY CloseDate DESC 
           LIMIT ${params.limit}`;

    const query = params.pageToken
      ? `/query/${params.pageToken}`
      : `/query?q=${encodeURIComponent(opportunitySOQL)}`;

    logger.info('Fetching Salesforce opportunities (donations)', {
      soql: params.pageToken ? `Continuing from page token: ${params.pageToken}` : opportunitySOQL,
      limit: params.limit,
    });

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
