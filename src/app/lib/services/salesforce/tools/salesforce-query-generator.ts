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

Common Salesforce objects:
- Account: Organizations/Companies
- Contact: Individual people
- Opportunity: Sales deals
- Lead: Potential customers
- Task: Activities/To-dos
- Event: Calendar events
- Case: Customer service cases
- Campaign: Marketing campaigns
- User: System users

Common field patterns:
- Id: Unique identifier
- Name: Display name
- CreatedDate, LastModifiedDate: Timestamps
- OwnerId: Record owner
- RecordTypeId: Record type
- Custom fields: Typically end with __c

Relationship queries:
- Parent to child: SELECT Id, (SELECT Id FROM Contacts) FROM Account
- Child to parent: SELECT Id, Account.Name FROM Contact`;
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
