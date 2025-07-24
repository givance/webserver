import { ICrmProvider } from './base/crm-provider.interface';
import { OAuthTokens } from './base/types';
import { BlackbaudService } from './blackbaud/blackbaud.service';
import { SalesforceService } from './salesforce/salesforce.service';
import { CrmSyncService } from './base/crm-sync.service';
import { db } from '@/app/lib/db';
import { organizationIntegrations } from '@/app/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/app/lib/logger';

/**
 * CRM Manager service that handles multiple CRM providers
 */
export class CrmManagerService {
  private providers: Map<string, ICrmProvider> = new Map();
  private initialized = false;

  constructor() {
    this.initialize();
  }

  private initialize() {
    if (this.initialized) {
      return;
    }

    // Register all available providers
    this.registerProvider(new BlackbaudService());
    this.registerProvider(new SalesforceService());
    // Future providers can be registered here
    // this.registerProvider(new HubspotService());

    this.initialized = true;
  }

  /**
   * Register a CRM provider
   */
  private registerProvider(provider: ICrmProvider): void {
    this.providers.set(provider.name, provider);
    // Only log in development to avoid spam during build
    if (process.env.NODE_ENV === 'development') {
      logger.info(`Registered CRM provider: ${provider.displayName}`);
    }
  }

  /**
   * Get a specific provider by name
   */
  getProvider(providerName: string): ICrmProvider {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`CRM provider not found: ${providerName}`);
    }
    return provider;
  }

  /**
   * Get all available providers
   */
  getAvailableProviders(): Array<{ name: string; displayName: string }> {
    return Array.from(this.providers.values()).map((provider) => ({
      name: provider.name,
      displayName: provider.displayName,
    }));
  }

  /**
   * Get integration for an organization and provider
   */
  async getIntegration(organizationId: string, providerName: string) {
    return await db.query.organizationIntegrations.findFirst({
      where: and(
        eq(organizationIntegrations.organizationId, organizationId),
        eq(organizationIntegrations.provider, providerName),
        eq(organizationIntegrations.isActive, true)
      ),
    });
  }

  /**
   * Sync data for a specific organization and provider
   */
  async syncData(organizationId: string, providerName: string) {
    const provider = this.getProvider(providerName);
    const integration = await this.getIntegration(organizationId, providerName);

    if (!integration) {
      throw new Error(`No active integration found for ${providerName}`);
    }

    // Check if token needs refresh
    if (integration.expiresAt && integration.expiresAt < new Date()) {
      logger.info(`Refreshing token for ${providerName} integration`);
      try {
        const newTokens = await provider.refreshAccessToken(integration.refreshToken);

        await db
          .update(organizationIntegrations)
          .set({
            accessToken: newTokens.accessToken,
            refreshToken: newTokens.refreshToken,
            expiresAt: newTokens.expiresAt,
            updatedAt: new Date(),
          })
          .where(eq(organizationIntegrations.id, integration.id));

        // Update the integration object with new tokens
        integration.accessToken = newTokens.accessToken;
        integration.refreshToken = newTokens.refreshToken;
        integration.expiresAt = newTokens.expiresAt ?? null;
      } catch (error) {
        logger.error('Failed to refresh token', { error, provider: providerName });
        throw new Error('Failed to refresh authentication token');
      }
    }

    const syncService = new CrmSyncService(provider);
    return await syncService.syncOrganizationData(organizationId, integration);
  }

  /**
   * Generate OAuth URL for a provider
   */
  getAuthorizationUrl(providerName: string, state: string, redirectUri: string): string {
    const provider = this.getProvider(providerName);
    return provider.getAuthorizationUrl(state, redirectUri);
  }

  /**
   * Handle OAuth callback for a provider
   */
  async handleOAuthCallback(
    providerName: string,
    code: string,
    redirectUri: string
  ): Promise<OAuthTokens> {
    const provider = this.getProvider(providerName);
    return await provider.exchangeAuthCode(code, redirectUri);
  }
}
