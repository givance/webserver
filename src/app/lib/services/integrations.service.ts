import { db } from '@/app/lib/db';
import { staffIntegrations } from '@/app/lib/db/schema/staff';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/app/lib/logger';

export interface IntegrationTokens {
  accessToken: string;
  refreshToken?: string;
  metadata?: {
    instanceUrl?: string;
    [key: string]: any;
  };
}

export class IntegrationsService {
  /**
   * Get active integration for a specific provider and staff member
   */
  async getActiveStaffIntegration(staffId: number, provider: string) {
    try {
      const integration = await db.query.staffIntegrations.findFirst({
        where: and(
          eq(staffIntegrations.staffId, staffId),
          eq(staffIntegrations.provider, provider),
          eq(staffIntegrations.isActive, true)
        ),
      });

      return integration;
    } catch (error) {
      logger.error('Error fetching staff integration', { error, staffId, provider });
      throw error;
    }
  }

  /**
   * Get integration tokens with type safety
   */
  getIntegrationTokens(integration: any): IntegrationTokens | null {
    logger.debug('[IntegrationsService] Getting integration tokens', {
      integrationId: integration?.id,
      hasAccessToken: !!integration?.accessToken,
      hasRefreshToken: !!integration?.refreshToken,
      hasMetadata: !!integration?.metadata,
      provider: integration?.provider,
    });

    if (!integration?.accessToken) {
      logger.debug('[IntegrationsService] No access token found in integration');
      return null;
    }

    // Build tokens object from database columns
    const tokens: IntegrationTokens = {
      accessToken: integration.accessToken,
      refreshToken: integration.refreshToken,
      metadata: integration.metadata as any,
    };

    logger.debug('[IntegrationsService] Tokens retrieved successfully', {
      hasAccessToken: !!tokens.accessToken,
      hasRefreshToken: !!tokens.refreshToken,
      hasMetadata: !!tokens.metadata,
      metadataKeys: tokens.metadata ? Object.keys(tokens.metadata) : [],
    });

    return tokens;
  }

  /**
   * Check if Salesforce integration is properly configured
   */
  isSalesforceIntegrationValid(tokens: IntegrationTokens | null): boolean {
    return !!(tokens?.accessToken && tokens?.metadata?.instanceUrl);
  }
}

// Export singleton instance
export const integrationsService = new IntegrationsService();
