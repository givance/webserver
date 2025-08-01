/**
 * Salesforce query tool for WhatsApp AI assistant
 */

import { z } from 'zod';
import { logger } from '@/app/lib/logger';
import { WhatsAppStaffLoggingService } from './whatsapp-staff-logging.service';
import { createSalesforceQueryGenerator } from '../salesforce/tools';
import { integrationsService } from '../integrations.service';

const SALESFORCE_QUERY_DESCRIPTION = `Query Salesforce data using natural language. This tool converts your request into SOQL (Salesforce Object Query Language) and executes it against the organization's Salesforce instance.

Examples of what you can ask:
- "Show me all accounts in the technology industry"
- "Find contacts created last month"
- "Get the top 10 opportunities by amount"
- "List all active campaigns with their budgets"
- "Show me donations (GiftTransactions) from this year"

The tool will:
1. Convert your natural language request to SOQL
2. Validate the query for safety and correctness
3. Execute it against Salesforce
4. Return the results

Important: This tool requires an active Salesforce integration. If no integration exists, it will return an error.`;

export function createSalesforceQueryTool(
  organizationId: string,
  loggingService: WhatsAppStaffLoggingService,
  staffId: number,
  fromPhoneNumber: string
) {
  return {
    querySalesforce: {
      description: SALESFORCE_QUERY_DESCRIPTION,
      parameters: z.object({
        request: z
          .string()
          .describe(
            'Natural language request for Salesforce data (e.g., "Find all high-value opportunities this quarter")'
          ),
        includeExplanation: z
          .boolean()
          .optional()
          .default(true)
          .describe('Whether to include an explanation of the generated SOQL query'),
      }),
      execute: async (params: { request: string; includeExplanation?: boolean }) => {
        const startTime = Date.now();

        try {
          logger.info('[WhatsApp Salesforce] Starting Salesforce query', {
            organizationId,
            staffId,
            request: params.request,
          });

          // Get Salesforce integration for this staff member
          const integration = await integrationsService.getActiveStaffIntegration(
            staffId,
            'salesforce'
          );

          if (!integration) {
            logger.warn('[WhatsApp Salesforce] No active Salesforce integration found', {
              staffId,
              organizationId,
            });

            await loggingService.logError(
              staffId,
              organizationId,
              fromPhoneNumber,
              'No active Salesforce integration found for this staff member',
              { staffId, organizationId },
              'salesforce_integration_missing'
            );

            return {
              success: false,
              error:
                'No active Salesforce integration found for your account. Please connect Salesforce in your staff settings first.',
            };
          }

          // Get tokens from integration
          const tokens = integrationsService.getIntegrationTokens(integration);

          if (!integrationsService.isSalesforceIntegrationValid(tokens)) {
            logger.error('[WhatsApp Salesforce] Invalid integration tokens', {
              hasTokens: !!tokens,
              hasAccessToken: !!tokens?.accessToken,
              hasInstanceUrl: !!tokens?.metadata?.instanceUrl,
            });

            return {
              success: false,
              error: 'Salesforce integration is misconfigured. Please reconnect.',
            };
          }

          // Create Salesforce query generator with auth context
          const queryGenerator = createSalesforceQueryGenerator({
            organizationId,
            userId: staffId.toString(),
            accessToken: tokens!.accessToken,
            metadata: {
              instanceUrl: tokens!.metadata!.instanceUrl,
            },
          });

          // Generate and execute the query
          const result = await queryGenerator.generateAndExecuteQuery({
            request: params.request,
          });

          const processingTime = Date.now() - startTime;

          // Log the query execution
          if (result.executionResult.success) {
            await loggingService.logDatabaseQuery(
              staffId,
              organizationId,
              fromPhoneNumber,
              result.query.soql,
              result.executionResult.records,
              processingTime
            );

            logger.info('[WhatsApp Salesforce] Query executed successfully', {
              soql: result.query.soql,
              recordCount: result.executionResult.totalSize,
              executionTime: result.executionTime,
            });

            const response: any = {
              success: true,
              query: result.query.soql,
              records: result.executionResult.records,
              totalRecords: result.executionResult.totalSize,
              executionTime: result.executionTime,
            };

            if (params.includeExplanation) {
              response.explanation = result.query.explanation;
              response.objectsUsed = result.query.objects;
              response.warnings = result.query.warnings;
            }

            return response;
          } else {
            // Handle execution error
            await loggingService.logError(
              staffId,
              organizationId,
              fromPhoneNumber,
              `Salesforce query failed: ${result.executionResult.error}`,
              {
                soql: result.query.soql,
                errorCode: result.executionResult.errorCode,
              },
              'salesforce_query_error'
            );

            logger.error('[WhatsApp Salesforce] Query execution failed', {
              soql: result.query.soql,
              error: result.executionResult.error,
              errorCode: result.executionResult.errorCode,
            });

            return {
              success: false,
              error: result.executionResult.error,
              errorCode: result.executionResult.errorCode,
              query: result.query.soql,
              explanation: params.includeExplanation ? result.query.explanation : undefined,
            };
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

          logger.error('[WhatsApp Salesforce] Unexpected error', {
            error,
            request: params.request,
          });

          await loggingService.logError(
            staffId,
            organizationId,
            fromPhoneNumber,
            `Salesforce query error: ${errorMessage}`,
            error,
            'salesforce_query_exception'
          );

          return {
            success: false,
            error: errorMessage,
          };
        }
      },
    },
  };
}

/**
 * Format Salesforce records for better readability in WhatsApp
 */
export function formatSalesforceRecords(records: any[], objectType?: string): string {
  if (!records || records.length === 0) {
    return 'No records found.';
  }

  const formatted: string[] = [];

  // Limit to first 10 records for WhatsApp readability
  const displayRecords = records.slice(0, 10);

  displayRecords.forEach((record, index) => {
    const parts: string[] = [`${index + 1}.`];

    // Common fields to display
    if (record.Name) parts.push(`*${record.Name}*`);
    if (record.Id) parts.push(`(${record.Id})`);

    // Type-specific formatting
    if (objectType === 'Account' || record.Type) {
      if (record.Industry) parts.push(`Industry: ${record.Industry}`);
      if (record.AnnualRevenue) parts.push(`Revenue: $${record.AnnualRevenue.toLocaleString()}`);
    } else if (objectType === 'Contact' || record.FirstName) {
      if (record.Email) parts.push(`Email: ${record.Email}`);
      if (record.Phone) parts.push(`Phone: ${record.Phone}`);
    } else if (objectType === 'Opportunity' || record.StageName) {
      if (record.Amount) parts.push(`Amount: $${record.Amount.toLocaleString()}`);
      if (record.StageName) parts.push(`Stage: ${record.StageName}`);
      if (record.CloseDate) parts.push(`Close: ${new Date(record.CloseDate).toLocaleDateString()}`);
    } else if (objectType === 'Campaign' || record.Status) {
      if (record.Status) parts.push(`Status: ${record.Status}`);
      if (record.ExpectedRevenue)
        parts.push(`Expected: $${record.ExpectedRevenue.toLocaleString()}`);
    }

    formatted.push(parts.join(' '));
  });

  if (records.length > 10) {
    formatted.push(`\n... and ${records.length - 10} more records`);
  }

  return formatted.join('\n');
}
