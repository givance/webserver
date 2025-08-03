import { z } from 'zod';

export const SalesforceQueryInputSchema = z.object({
  request: z.string().describe('Natural language query to convert to SOQL'),
  objects: z.array(z.string()).optional().describe('Available Salesforce objects'),
  fields: z.record(z.array(z.string())).optional().describe('Available fields per object'),
});

export type SalesforceQueryInput = z.infer<typeof SalesforceQueryInputSchema>;

export const SalesforceQueryOutputSchema = z.object({
  soql: z.string().describe('Generated SOQL query'),
  explanation: z.string().describe('Explanation of what the query does'),
  objects: z.array(z.string()).describe('Salesforce objects used in the query'),
  fields: z
    .record(z.array(z.string()))
    .optional()
    .describe('Fields used per object (optional for aggregate queries like COUNT)'),
  warnings: z.array(z.string()).optional().describe('Any warnings or considerations'),
});

export type SalesforceQueryOutput = z.infer<typeof SalesforceQueryOutputSchema>;

export interface SalesforceToolContext {
  organizationId: string;
  userId: string;
  salesforceInstanceUrl?: string;
  availableObjects?: string[];
  objectSchemas?: Record<string, any>;
  accessToken?: string;
  metadata?: Record<string, any>;
}

export const SalesforceQueryResultSchema = z.object({
  query: SalesforceQueryOutputSchema,
  executionResult: z.union([
    z.object({
      success: z.literal(true),
      records: z.array(z.record(z.unknown())),
      totalSize: z.number(),
      done: z.boolean(),
    }),
    z.object({
      success: z.literal(false),
      error: z.string(),
      errorCode: z.string().optional(),
      needsTokenRefresh: z.boolean().optional(),
    }),
  ]),
  executionTime: z.number().describe('Query execution time in milliseconds'),
});

export type SalesforceQueryResult = z.infer<typeof SalesforceQueryResultSchema>;
