import { ICrmProvider } from '../base/crm-provider.interface';
import {
  CrmDonor,
  CrmDonation,
  CrmProject,
  OAuthTokens,
  PaginationParams,
  PaginatedResponse,
} from '../base/types';
import {
  SalesforceContact,
  SalesforceAccount,
  SalesforceGiftTransaction,
  SalesforceCampaign,
  SalesforceQueryResponse,
  SalesforceTokenResponse,
  SalesforceErrorResponse,
  SalesforceDescribeResponse,
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
    // Generate PKCE pair
    const { codeVerifier, codeChallenge } = generatePKCEPair();

    // Store the verifier associated with the state
    try {
      await storePKCEVerifier(state, codeVerifier);
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

    return authUrl;
  }

  /**
   * Exchange authorization code for access tokens
   */
  async exchangeAuthCode(code: string, redirectUri: string, state?: string): Promise<OAuthTokens> {
    // Get the code verifier from the state
    let codeVerifier: string | undefined;
    if (state) {
      codeVerifier = await getPKCEVerifier(state);
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
    } else {
      logger.warn('No PKCE code_verifier found - this will likely fail!');
    }

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

    logger.info('🔵 Salesforce API Request', {
      endpoint,
      method: 'GET',
      timestamp: new Date().toISOString(),
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
   * Fetch donations (GiftTransactions) from Salesforce
   */
  async fetchDonations(
    accessToken: string,
    params: PaginationParams,
    metadata?: Record<string, any>
  ): Promise<PaginatedResponse<CrmDonation>> {
    // GiftTransaction - using basic fields until we confirm all field names
    const giftTransactionSOQL = `SELECT Id, Name, DonorId, CurrentAmount, TransactionDate, CheckDate, CampaignId, CreatedDate, LastModifiedDate, IsDeleted
           FROM GiftTransaction 
           WHERE IsDeleted = false 
           ORDER BY CreatedDate DESC 
           LIMIT ${params.limit}`;

    const query = params.pageToken
      ? `/query/${params.pageToken}`
      : `/query?q=${encodeURIComponent(giftTransactionSOQL)}`;

    try {
      const response = await this.makeApiRequest<
        SalesforceQueryResponse<SalesforceGiftTransaction>
      >(accessToken, query, metadata);

      const donations = response.records.map((giftTransaction) =>
        SalesforceMapper.mapGiftTransaction(giftTransaction)
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
   * Fetch campaigns from Salesforce
   */
  async fetchProjects(
    accessToken: string,
    params: PaginationParams,
    metadata?: Record<string, any>
  ): Promise<PaginatedResponse<CrmProject>> {
    const campaignSOQL = `SELECT Id, Name, Description, Status, Type, StartDate, EndDate, 
           ExpectedRevenue, ActualCost, BudgetedCost, ExpectedResponse, IsActive, ParentId,
           CreatedDate, LastModifiedDate, IsDeleted
           FROM Campaign 
           WHERE IsDeleted = false 
           ORDER BY LastModifiedDate DESC 
           LIMIT ${params.limit}`;

    const query = params.pageToken
      ? `/query/${params.pageToken}`
      : `/query?q=${encodeURIComponent(campaignSOQL)}`;

    try {
      const response = await this.makeApiRequest<SalesforceQueryResponse<SalesforceCampaign>>(
        accessToken,
        query,
        metadata
      );

      const projects = response.records.map((campaign) => SalesforceMapper.mapCampaign(campaign));

      return {
        data: projects,
        hasMore: !response.done,
        nextPageToken: SalesforceMapper.extractPaginationInfo(response.nextRecordsUrl),
        totalCount: response.totalSize,
      };
    } catch (error) {
      logger.error('Failed to fetch campaigns from Salesforce', { error });
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
      const giftTransaction = await this.makeApiRequest<SalesforceGiftTransaction>(
        accessToken,
        `/sobjects/GiftTransaction/${externalId}`,
        metadata
      );
      return SalesforceMapper.mapGiftTransaction(giftTransaction);
    } catch (error) {
      logger.error('Failed to fetch donation by ID from Salesforce', { error, externalId });
      return null;
    }
  }

  /**
   * Fetch gift transactions (donations) for a specific donor
   * This looks for GiftTransactions associated with either a Contact ID or Account ID (DonorId)
   */
  async fetchDonorGiftTransactions(
    accessToken: string,
    donorId: string,
    donorType: 'Contact' | 'Account',
    metadata?: Record<string, any>
  ): Promise<CrmDonation[]> {
    logger.warn('🔴 INDIVIDUAL fetchDonorGiftTransactions called - This should NOT be used!', {
      donorId,
      donorType,
    });
    try {
      // First, let's describe the GiftTransaction object to see what fields are available
      const describeQuery = `/sobjects/GiftTransaction/describe`;

      try {
        const describeResponse = await this.makeApiRequest<SalesforceDescribeResponse>(
          accessToken,
          describeQuery,
          metadata
        );
      } catch (describeError) {
        logger.error('Failed to describe GiftTransaction object', { describeError });
      }

      // Build SOQL query based on donor type
      // For Contacts, we check both ContactId and their associated AccountId
      // For Accounts, we check AccountId
      let whereClause: string;
      let contactAccountId: string | undefined;

      if (donorType === 'Contact') {
        // For Contacts, we need to get their AccountId since GiftTransaction only has DonorId (Account reference)
        const contactQuery = `/sobjects/Contact/${donorId}`;

        try {
          const contact = await this.makeApiRequest<{
            AccountId?: string;
            FirstName?: string;
            LastName?: string;
          }>(accessToken, contactQuery, metadata);

          contactAccountId = contact.AccountId;

          if (contact.AccountId) {
            // GiftTransaction only has DonorId field which references Account
            whereClause = `DonorId = '${contact.AccountId}'`;
          } else {
            // Contact has no account - no gift transactions will be found
            logger.warn('Contact has no AccountId, cannot find gift transactions', {
              contactId: donorId,
            });
            return [];
          }
        } catch (e) {
          // If we can't fetch the contact, no gift transactions can be found
          logger.error('Failed to fetch contact for gift transactions', {
            contactId: donorId,
            error: e,
          });
          return [];
        }
      } else {
        // For Account donors, look for all gift transactions on that Account
        whereClause = `DonorId = '${donorId}'`;
      }

      // Now run the actual query with filters
      // Query GiftTransaction object - start with basic fields only
      const soql = `SELECT Id, Name, DonorId, CurrentAmount, TransactionDate, CheckDate, CampaignId, CreatedDate
        FROM GiftTransaction 
        WHERE ${whereClause}
        AND IsDeleted = false 
        ORDER BY CreatedDate DESC
        LIMIT 10`;

      const query = `/query?q=${encodeURIComponent(soql)}`;

      const response = await this.makeApiRequest<SalesforceQueryResponse<Record<string, unknown>>>(
        accessToken,
        query,
        metadata
      );

      // For now, map with minimal fields until we know all field names
      return response.records.map(
        (giftTransaction): CrmDonation => ({
          externalId: String(giftTransaction.Id),
          donorExternalId: String(giftTransaction.DonorId),
          amount: Math.round((Number(giftTransaction.CurrentAmount) || 0) * 100),
          currency: 'USD',
          date: giftTransaction.TransactionDate
            ? new Date(String(giftTransaction.TransactionDate))
            : giftTransaction.CheckDate
              ? new Date(String(giftTransaction.CheckDate))
              : new Date(String(giftTransaction.CreatedDate)),
          designation: String(giftTransaction.Name || 'Gift Transaction'),
          metadata: {
            source: 'salesforce_gift_transaction',
            raw: giftTransaction,
          },
        })
      );
    } catch (error) {
      logger.error('Failed to fetch gift transactions for donor', {
        error,
        donorId,
        donorType,
      });
      return [];
    }
  }

  /**
   * Enhanced fetch donors with gift transactions
   * Fetches donors and their associated gift transactions using batch queries
   */
  async fetchDonorsWithGiftTransactions(
    accessToken: string,
    params: PaginationParams,
    metadata?: Record<string, any>
  ): Promise<PaginatedResponse<CrmDonor & { donations?: CrmDonation[] }>> {
    logger.info('🟢 Starting BATCH fetchDonorsWithGiftTransactions', {
      limit: params.limit,
      pageToken: params.pageToken,
    });

    // First fetch donors as usual
    const donorsResponse = await this.fetchDonors(accessToken, params, metadata);

    if (donorsResponse.data.length === 0) {
      return donorsResponse;
    }

    logger.info('🟢 Batch method: Fetched donors', {
      donorCount: donorsResponse.data.length,
      apiCallCount: 1,
    });

    // Separate contacts and accounts
    const contacts = donorsResponse.data.filter((d) => d.metadata?.source === 'salesforce_contact');
    const accounts = donorsResponse.data.filter((d) => d.metadata?.source === 'salesforce_account');

    // For contacts, we need to fetch their AccountIds first
    const contactAccountMap: Record<string, string> = {};
    if (contacts.length > 0) {
      logger.info('🟢 Batch method: Fetching AccountIds for contacts', {
        contactCount: contacts.length,
      });

      const contactIds = contacts.map((c) => `'${c.externalId}'`).join(',');
      const contactQuery = `/query?q=${encodeURIComponent(
        `SELECT Id, AccountId FROM Contact WHERE Id IN (${contactIds})`
      )}`;

      try {
        const contactResponse = await this.makeApiRequest<
          SalesforceQueryResponse<{ Id: string; AccountId?: string }>
        >(accessToken, contactQuery, metadata);

        contactResponse.records.forEach((record) => {
          if (record.AccountId) {
            contactAccountMap[record.Id] = record.AccountId;
          }
        });

        logger.info('🟢 Batch method: Fetched AccountIds', {
          apiCallCount: 2,
          accountsFound: Object.keys(contactAccountMap).length,
        });
      } catch (error) {
        logger.error('Failed to fetch contact AccountIds', { error });
      }
    }

    // Collect all account IDs (from both direct accounts and contacts with accounts)
    const accountIds = new Set<string>();
    accounts.forEach((a) => accountIds.add(a.externalId));
    Object.values(contactAccountMap).forEach((accountId) => accountIds.add(accountId));

    // Batch fetch all gift transactions for these accounts
    const donationsByDonorId: Record<string, CrmDonation[]> = {};

    if (accountIds.size > 0) {
      logger.info('🟢 Batch method: Fetching ALL gift transactions in one query', {
        accountCount: accountIds.size,
      });

      const accountIdList = Array.from(accountIds)
        .map((id) => `'${id}'`)
        .join(',');
      const giftQuery = `/query?q=${encodeURIComponent(
        `SELECT Id, Name, DonorId, CurrentAmount, TransactionDate, CheckDate, CampaignId, CreatedDate FROM GiftTransaction WHERE DonorId IN (${accountIdList}) AND IsDeleted = false ORDER BY CreatedDate DESC`
      )}`;

      try {
        const giftResponse = await this.makeApiRequest<
          SalesforceQueryResponse<Record<string, unknown>>
        >(accessToken, giftQuery, metadata);

        // Log first record to debug date issue
        if (giftResponse.records.length > 0) {
          const firstGift = giftResponse.records[0];
          logger.info('📥 RAW Salesforce GiftTransaction Example', {
            Id: firstGift.Id,
            Name: firstGift.Name,
            DonorId: firstGift.DonorId,
            CurrentAmount: firstGift.CurrentAmount,
            TransactionDate: firstGift.TransactionDate,
            CheckDate: firstGift.CheckDate,
            CampaignId: firstGift.CampaignId,
            CreatedDate: firstGift.CreatedDate,
            allFields: Object.keys(firstGift),
            rawRecord: firstGift,
          });
        }

        // Group donations by DonorId
        let loggedFirst = false;
        giftResponse.records.forEach((giftTransaction) => {
          const donorId = String(giftTransaction.DonorId);
          if (!donationsByDonorId[donorId]) {
            donationsByDonorId[donorId] = [];
          }

          const transactionDate = giftTransaction.TransactionDate
            ? new Date(String(giftTransaction.TransactionDate))
            : null;
          const checkDate = giftTransaction.CheckDate
            ? new Date(String(giftTransaction.CheckDate))
            : null;
          const createdDate = new Date(String(giftTransaction.CreatedDate));
          const donationDate = transactionDate || checkDate || createdDate;

          const donation = {
            externalId: String(giftTransaction.Id),
            donorExternalId: donorId,
            amount: Math.round((Number(giftTransaction.CurrentAmount) || 0) * 100),
            currency: 'USD',
            date: donationDate,
            designation: String(giftTransaction.Name || 'Gift Transaction'),
            campaignExternalId: giftTransaction.CampaignId
              ? String(giftTransaction.CampaignId)
              : undefined,
            metadata: {
              source: 'salesforce_gift_transaction',
              raw: giftTransaction,
            },
          };

          // Log first donation being created
          if (!loggedFirst) {
            logger.info('🔄 PROCESSED Donation Object (for DB)', {
              externalId: donation.externalId,
              donorExternalId: donation.donorExternalId,
              amount: donation.amount,
              currency: donation.currency,
              date: donation.date.toISOString(),
              designation: donation.designation,
              transactionDateRaw: giftTransaction.TransactionDate,
              checkDateRaw: giftTransaction.CheckDate,
              createdDateRaw: giftTransaction.CreatedDate,
              transactionDateParsed: transactionDate?.toISOString() || 'null',
              checkDateParsed: checkDate?.toISOString() || 'null',
              createdDateParsed: createdDate.toISOString(),
              finalDate: donationDate.toISOString(),
              campaignIdFromRaw: giftTransaction.CampaignId,
              campaignExternalIdInDonation: donation.campaignExternalId,
            });
            loggedFirst = true;
          }

          donationsByDonorId[donorId].push(donation);
        });

        logger.info('🟢 Batch method: Fetched ALL gift transactions', {
          totalApiCalls: contacts.length > 0 ? 3 : 2,
          giftTransactionCount: giftResponse.records.length,
          uniqueDonorsWithGifts: Object.keys(donationsByDonorId).length,
        });
      } catch (error) {
        logger.error('Failed to batch fetch gift transactions', { error });
      }
    }

    // Map donations back to donors
    const donorsWithDonations = donorsResponse.data.map((donor) => {
      let donations: CrmDonation[] = [];

      if (donor.metadata?.source === 'salesforce_contact') {
        // For contacts, use their AccountId to find donations
        const accountId = contactAccountMap[donor.externalId];
        if (accountId && donationsByDonorId[accountId]) {
          donations = donationsByDonorId[accountId];
        }
      } else {
        // For accounts, use their ID directly
        if (donationsByDonorId[donor.externalId]) {
          donations = donationsByDonorId[donor.externalId];
        }
      }

      return {
        ...donor,
        donations,
      };
    });

    logger.info('🟢 BATCH fetchDonorsWithGiftTransactions COMPLETED', {
      totalDonors: donorsWithDonations.length,
      totalApiCalls: contacts.length > 0 ? 3 : 2,
      method: 'BATCH',
    });

    return {
      ...donorsResponse,
      data: donorsWithDonations,
    };
  }
}
