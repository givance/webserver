import { generateObject } from 'ai';
import { z } from 'zod';
import { createAzure } from '@ai-sdk/azure';
import { env } from '@/app/lib/env';
import { logger } from '@/app/lib/logger';
import {
  SalesforceQueryInput,
  SalesforceQueryInputSchema,
  SalesforceQueryOutput,
  SalesforceQueryOutputSchema,
  SalesforceQueryResult,
  SalesforceToolContext,
} from './types';

// Create Azure OpenAI client
const azure = createAzure({
  resourceName: env.AZURE_OPENAI_RESOURCE_NAME,
  apiKey: env.AZURE_OPENAI_API_KEY,
});

export class SalesforceQueryGenerator {
  private context: SalesforceToolContext;

  constructor(context: SalesforceToolContext) {
    this.context = context;
  }

  async generateQuery(input: SalesforceQueryInput): Promise<SalesforceQueryOutput> {
    const validatedInput = SalesforceQueryInputSchema.parse(input);

    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(validatedInput);

    try {
      const model = azure(env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o');

      const { object: result } = await generateObject({
        model,
        system: systemPrompt,
        prompt: userPrompt,
        schema: SalesforceQueryOutputSchema,
      });

      return result;
    } catch (error) {
      console.error('Error generating Salesforce query:', error);
      throw new Error('Failed to generate Salesforce query');
    }
  }

  private buildSystemPrompt(): string {
    return `You are an expert Salesforce SOQL query generator. Your task is to convert natural language requests into valid SOQL queries.

Key guidelines:
1. Generate syntactically correct SOQL queries
2. Use appropriate field and object names (case-sensitive)
3. Handle relationships properly (using dot notation)
4. Include proper WHERE clauses for filtering
5. Add ORDER BY and LIMIT clauses when appropriate
6. Consider query governor limits
7. Explain the query in simple terms
8. Warn about potential issues or performance concerns
9. For COUNT() queries, do NOT include the 'fields' property in the response (it's optional)

Common Salesforce objects:
- Account: Organizations/Companies
- Contact: Individual people (donors)
- Opportunity: Sales deals
- Lead: Potential customers
- Task: Activities/To-dos
- Event: Calendar events
- Case: Customer service cases
- Campaign: Marketing campaigns
- User: System users
- GiftTransaction: Completed donations/gifts (API v59.0+)

Common field patterns:
- Id: Unique identifier
- Name: Display name
- CreatedDate, LastModifiedDate: Timestamps
- OwnerId: Record owner
- RecordTypeId: Record type
- Custom fields: Typically end with __c

GiftTransaction specific fields:
- DonorId: References Account (person, household, or organization)
- OriginalAmount: Original donation amount (currency, required)
- CurrentAmount: Amount after refunds (currency, calculated)
- TransactionDate: When donor completed gift (date, required for Paid status)
- Status: Transaction status - Paid, Pending, Unpaid, Fully Refunded, etc. (picklist, required)
- PaymentMethod: ACH, Cash, Check, Credit Card, etc. (picklist, required)
- CampaignId: Associated campaign (reference)
- AcknowledgementStatus: Don't Send, Sent, To Be Sent (picklist)
- AcknowledgementDate: When gift was acknowledged (date)
- RefundedAmount: Amount refunded (currency, calculated)
- GiftType: Individual or Organizational (picklist)
- Description: Gift description (textarea)

Donation queries examples:
- All donations: SELECT Id, Name, DonorId, OriginalAmount, TransactionDate, Status FROM GiftTransaction
- Donations by donor: SELECT Id, OriginalAmount, TransactionDate FROM GiftTransaction WHERE DonorId = 'ACCOUNT_ID'
- Recent donations: SELECT Id, DonorId, OriginalAmount FROM GiftTransaction WHERE TransactionDate >= LAST_N_DAYS:30
- Total donations: SELECT COUNT(), SUM(OriginalAmount) FROM GiftTransaction WHERE Status = 'Paid'
- Donations by campaign: SELECT Id, DonorId, OriginalAmount FROM GiftTransaction WHERE CampaignId = 'CAMPAIGN_ID'

Relationship queries:
- Parent to child: SELECT Id, (SELECT Id FROM Contacts) FROM Account
- Child to parent: SELECT Id, Account.Name FROM Contact
- Donation with donor info: SELECT Id, OriginalAmount, Donor.Name FROM GiftTransaction

IMPORTANT: GiftTransaction Object Details (for donations/gifts):
GiftTransaction represents completed donations from donors. Available in API v59.0+.

Key GiftTransaction fields:
- AcknowledgementDate: Date when gift was acknowledged
- AcknowledgementStatus: Status of acknowledgement (Don't Send, Sent, To Be Sent)
- CampaignId: Campaign associated with the gift (references Campaign)
- CheckDate: Date on the check
- CurrentAmount: Gift amount after refunds (calculated field)
- CurrencyIsoCode: Currency used (USD) - API v61.0+
- Description: Gift description
- DonorCoverAmount: Amount donor added to cover fees - API v61.0+
- DonorId: Person, household, or organization account (references Account)
- DonorGiftConceptId: Gift concept associated (references DonorGiftConcept)
- GatewayReference: Gateway transaction reference - API v60.0+
- GatewayTransactionFee: Fee charged by payment gateway - API v60.0+
- GiftAgreementId: Gift agreement associated (references GiftAgreement)
- GiftCommitmentId: Gift commitment associated (references GiftCommitment)
- GiftCommitmentScheduleId: Gift commitment schedule (references GiftCommitmentSchedule)
- GiftType: Type of gift (Individual, Organizational)
- IsFullyRefunded: True when Status equals Fully Refunded
- IsPaid: True when Status equals Paid and Current Amount equals 0
- IsPartiallyRefunded: True when Status equals Paid and Current Amount > 0
- IsWrittenOff: True when Status equals Written-Off
- LastGatewayErrorMessage: Most recent gateway error - API v60.0+
- LastGatewayProcessedDate: Last gateway processing attempt - API v60.0+
- LastGatewayResponseCode: Most recent gateway response code - API v60.0+
- LastReferencedDate: When user last accessed record indirectly
- LastViewedDate: When user last viewed record
- MatchingEmployerTransactionId: Employer matching gift (references GiftTransaction)
- Name: Name of the gift transaction
- NonTaxDeductibleAmount: Non-deductible portion - API v61.0+
- OriginalAmount: Original amount (required)
- OutreachSourceCodeId: Outreach source code (references OutreachSourceCode)
- OwnerId: Owner of this object (references Group, User)
- PartyPhilanthropicRsrchPrflId: Research profile (references PartyPhilanthropicRsrchPrfl)
- PaymentIdentifier: Payment reference number
- PaymentInstrumentId: Payment Instrument used - API v60.0+ (references PaymentInstrument)
- PaymentMethod: Payment method (required) - ACH, Cash, Check, Credit Card, etc.
- ProcessorReference: Payment processor reference - API v60.0+
- ProcessorTransactionFee: Fee charged by processor - API v60.0+
- RefundedAmount: Amount refunded (calculated)
- Status: Transaction status (required) - Paid, Pending, Unpaid, etc.
- TaxReceiptStatus: Tax receipt status - API v62.0+
- TotalTransactionFee: Total fees (calculated) - API v60.0+
- TransactionDate: When donor completed gift (required for Paid/Fully Refunded)
- TransactionDueDate: Expected date for scheduled gift

Common GiftTransaction queries:
- Count all donations: SELECT COUNT() FROM GiftTransaction
- Sum of all paid donations: SELECT SUM(OriginalAmount) FROM GiftTransaction WHERE Status = 'Paid'
- Recent donations: SELECT Id, Name, DonorId, OriginalAmount, TransactionDate FROM GiftTransaction WHERE TransactionDate >= LAST_N_DAYS:30
- Donations by status: SELECT COUNT(), SUM(OriginalAmount) FROM GiftTransaction GROUP BY Status
- Major gifts: SELECT Id, Name, DonorId, OriginalAmount FROM GiftTransaction WHERE OriginalAmount > 10000 AND Status = 'Paid'
- Donations with donor info: SELECT Id, Name, OriginalAmount, Donor.Name, Donor.Email FROM GiftTransaction WHERE Status = 'Paid'`;
  }

  private buildUserPrompt(input: SalesforceQueryInput): string {
    let prompt = `Generate a SOQL query for the following request:\n\n"${input.request}"`;

    if (input.objects && input.objects.length > 0) {
      prompt += `\n\nAvailable Salesforce objects: ${input.objects.join(', ')}`;
    }

    if (input.fields && Object.keys(input.fields).length > 0) {
      prompt += '\n\nAvailable fields per object:';
      for (const [object, fields] of Object.entries(input.fields)) {
        prompt += `\n${object}: ${fields.join(', ')}`;
      }
    }

    return prompt;
  }

  async validateQuery(soql: string): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Basic SOQL validation
    if (!soql.trim().toUpperCase().startsWith('SELECT')) {
      errors.push('Query must start with SELECT');
    }

    if (!soql.includes('FROM')) {
      errors.push('Query must include FROM clause');
    }

    // Check for common syntax issues
    const openParens = (soql.match(/\(/g) || []).length;
    const closeParens = (soql.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      errors.push('Mismatched parentheses');
    }

    // Check for dangerous operations
    if (soql.match(/DELETE|UPDATE|INSERT/i)) {
      errors.push('Only SELECT queries are allowed');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  async suggestOptimizations(soql: string): Promise<string[]> {
    const suggestions: string[] = [];

    // Check for missing LIMIT
    if (!soql.match(/LIMIT/i)) {
      suggestions.push('Consider adding a LIMIT clause to prevent large result sets');
    }

    // Check for SELECT *
    if (soql.includes('*')) {
      suggestions.push('Avoid SELECT *, specify only required fields to improve performance');
    }

    // Check for missing indexes on WHERE clause fields
    if (soql.match(/WHERE.*Name\s*=/i) && !soql.match(/WHERE.*Id\s*=/i)) {
      suggestions.push('Consider filtering by Id when possible for better performance');
    }

    // Check for complex subqueries
    const subqueryCount = (soql.match(/\(SELECT/gi) || []).length;
    if (subqueryCount > 2) {
      suggestions.push(
        `Query contains ${subqueryCount} subqueries, consider breaking into separate queries`
      );
    }

    return suggestions;
  }

  async executeQuery(soql: string): Promise<SalesforceQueryResult['executionResult']> {
    const startTime = Date.now();

    if (!this.context.accessToken) {
      return {
        success: false,
        error: 'No access token provided',
        errorCode: 'MISSING_ACCESS_TOKEN',
      };
    }

    if (!this.context.metadata?.instanceUrl) {
      return {
        success: false,
        error: 'No Salesforce instance URL provided',
        errorCode: 'MISSING_INSTANCE_URL',
      };
    }

    try {
      const apiVersion = 'v60.0';
      const instanceUrl = this.context.metadata.instanceUrl;
      const url = `${instanceUrl}/services/data/${apiVersion}/query?q=${encodeURIComponent(soql)}`;

      logger.info('Executing Salesforce query', {
        soql,
        organizationId: this.context.organizationId,
      });

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.context.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        logger.error('Salesforce query execution failed', {
          status: response.status,
          error: errorData,
          soql,
        });

        return {
          success: false,
          error: errorData[0]?.message || response.statusText,
          errorCode: errorData[0]?.errorCode,
        };
      }

      const data = await response.json();
      const executionTime = Date.now() - startTime;

      logger.info('Salesforce query executed successfully', {
        recordCount: data.totalSize,
        executionTime,
        done: data.done,
      });

      return {
        success: true,
        records: data.records,
        totalSize: data.totalSize,
        done: data.done,
      };
    } catch (error) {
      logger.error('Failed to execute Salesforce query', {
        error,
        soql,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        errorCode: 'EXECUTION_ERROR',
      };
    }
  }

  async generateAndExecuteQuery(input: SalesforceQueryInput): Promise<SalesforceQueryResult> {
    const startTime = Date.now();

    // Generate the query
    const queryOutput = await this.generateQuery(input);

    // Validate the query
    const validation = await this.validateQuery(queryOutput.soql);
    if (!validation.valid) {
      return {
        query: queryOutput,
        executionResult: {
          success: false,
          error: `Query validation failed: ${validation.errors.join(', ')}`,
          errorCode: 'VALIDATION_ERROR',
        },
        executionTime: Date.now() - startTime,
      };
    }

    // Execute the query
    const executionResult = await this.executeQuery(queryOutput.soql);

    return {
      query: queryOutput,
      executionResult,
      executionTime: Date.now() - startTime,
    };
  }
}

// Export a factory function for easy instantiation
export function createSalesforceQueryGenerator(context: SalesforceToolContext) {
  return new SalesforceQueryGenerator(context);
}
