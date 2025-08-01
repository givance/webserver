import { logger } from '@/app/lib/logger';
import { checkAndMarkMessage } from './message-deduplication';
import { WhatsAppAIRequest, WhatsAppAIResponse } from './types';
import { integrationsService } from '../integrations.service';
import { WhatsAppSalesforceAIService } from './whatsapp-salesforce-ai.service';
import { WhatsAppDatabaseAIService } from './whatsapp-database-ai.service';

// Re-export types for external use
export type { WhatsAppAIRequest, WhatsAppAIResponse } from './types';

/**
 * WhatsApp AI Router Service
 * Routes messages to either Salesforce or Database AI based on staff integration
 */
export class WhatsAppAIService {
  private salesforceAI: WhatsAppSalesforceAIService;
  private databaseAI: WhatsAppDatabaseAIService;

  constructor() {
    this.salesforceAI = new WhatsAppSalesforceAIService();
    this.databaseAI = new WhatsAppDatabaseAIService();
  }

  /**
   * Process a WhatsApp message and route to appropriate AI service
   */
  async processMessage(request: WhatsAppAIRequest): Promise<WhatsAppAIResponse> {
    const { message, organizationId, staffId, fromPhoneNumber } = request;

    // Check for duplicate messages
    const isRetry = checkAndMarkMessage(message, fromPhoneNumber, organizationId);
    if (!isRetry) {
      logger.info(`[WhatsApp AI Router] New message received`, {
        fromPhoneNumber,
        organizationId,
        staffId,
        messageLength: message.length,
      });
    }

    try {
      // Check if staff has Salesforce integration
      const hasSalesforceIntegration = await this.checkSalesforceIntegration(staffId);

      logger.info(
        `[WhatsApp AI Router] Routing to ${hasSalesforceIntegration ? 'Salesforce' : 'Database'} AI`,
        {
          staffId,
          organizationId,
          hasSalesforceIntegration,
        }
      );

      // Route to appropriate AI service
      if (hasSalesforceIntegration) {
        return await this.salesforceAI.processMessage(request);
      } else {
        return await this.databaseAI.processMessage(request);
      }
    } catch (error) {
      logger.error(`[WhatsApp AI Router] Error processing message`, {
        error: error instanceof Error ? error.message : String(error),
        staffId,
        organizationId,
      });
      throw error;
    }
  }

  /**
   * Check if staff has active Salesforce integration
   */
  private async checkSalesforceIntegration(staffId: number): Promise<boolean> {
    try {
      logger.info('[WhatsApp AI] Checking Salesforce integration for staff', { staffId });

      const integration = await integrationsService.getActiveStaffIntegration(
        staffId,
        'salesforce'
      );
      if (!integration) {
        logger.info('[WhatsApp AI] No Salesforce integration found for staff', { staffId });
        return false;
      }

      logger.info('[WhatsApp AI] Found Salesforce integration', {
        staffId,
        integrationId: integration.id,
        isActive: integration.isActive,
        hasAccessToken: !!integration.accessToken,
        hasRefreshToken: !!integration.refreshToken,
      });

      const tokens = integrationsService.getIntegrationTokens(integration);
      const isValid = integrationsService.isSalesforceIntegrationValid(tokens);

      logger.info('[WhatsApp AI] Salesforce integration validation result', {
        staffId,
        isValid,
        hasTokens: !!tokens,
        hasAccessToken: !!tokens?.accessToken,
        hasInstanceUrl: !!tokens?.metadata?.instanceUrl,
        instanceUrl: tokens?.metadata?.instanceUrl,
      });

      return isValid;
    } catch (error) {
      logger.error('[WhatsApp AI] Error checking Salesforce integration', { error, staffId });
      return false;
    }
  }
}
