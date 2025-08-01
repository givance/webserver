# Salesforce AI Tools

This directory contains AI-powered tools for Salesforce integration using Vercel's AI SDK.

## Available Tools

### 1. Salesforce Query Generator

Converts natural language requests into valid SOQL queries and executes them against Salesforce.

#### Usage

```typescript
import { createSalesforceQueryGenerator } from '~/app/lib/services/salesforce/tools';

const context = {
  organizationId: 'org-123',
  userId: 'user-123',
  accessToken: 'salesforce-access-token', // Required for execution
  metadata: {
    instanceUrl: 'https://your-instance.salesforce.com' // Required for execution
  },
  availableObjects: ['Account', 'Contact', 'Opportunity'],
};

const generator = createSalesforceQueryGenerator(context);

// Generate a query only
const queryOutput = await generator.generateQuery({
  request: 'Find all technology companies created last month',
  objects: ['Account'], // Optional: hint about available objects
  fields: { // Optional: hint about available fields
    Account: ['Id', 'Name', 'Industry', 'CreatedDate']
  }
});

console.log(queryOutput.soql); // SELECT Id, Name FROM Account WHERE Industry = 'Technology' AND CreatedDate >= LAST_MONTH
console.log(queryOutput.explanation); // Human-readable explanation
console.log(queryOutput.warnings); // Any warnings or considerations

// Execute a query directly
const executionResult = await generator.executeQuery(queryOutput.soql);
if (executionResult.success) {
  console.log('Records:', executionResult.records);
  console.log('Total count:', executionResult.totalSize);
} else {
  console.error('Error:', executionResult.error);
  console.error('Error code:', executionResult.errorCode);
}

// Generate AND execute in one call
const fullResult = await generator.generateAndExecuteQuery({
  request: 'Show me the top 5 largest opportunities this year'
});

console.log('Generated query:', fullResult.query.soql);
console.log('Explanation:', fullResult.query.explanation);

if (fullResult.executionResult.success) {
  console.log('Found', fullResult.executionResult.totalSize, 'records');
  fullResult.executionResult.records.forEach(record => {
    console.log(record);
  });
} else {
  console.error('Execution failed:', fullResult.executionResult.error);
}

// Validate a query
const validation = await generator.validateQuery(queryOutput.soql);
if (!validation.valid) {
  console.error('Query errors:', validation.errors);
}

// Get optimization suggestions
const suggestions = await generator.suggestOptimizations(queryOutput.soql);
console.log('Optimization suggestions:', suggestions);
```

#### Features

- Natural language to SOQL conversion
- Query execution against Salesforce API
- Query validation and syntax checking
- Performance optimization suggestions
- Support for complex queries with relationships
- Governor limit awareness
- Error handling with Salesforce-specific error codes
- Execution time tracking

## WhatsApp Integration

The Salesforce query generator is integrated with the WhatsApp AI assistant, allowing users to query Salesforce data via WhatsApp messages:

```typescript
// In WhatsApp conversation:
// User: "Show me all high-value opportunities from this quarter"
// AI Assistant uses querySalesforce tool to:
// 1. Generate SOQL: SELECT Id, Name, Amount, StageName FROM Opportunity WHERE Amount > 50000 AND CreatedDate = THIS_QUARTER
// 2. Execute against Salesforce
// 3. Format and return results

// The tool is available in WhatsApp AI tools:
import { createSalesforceQueryTool } from '~/app/lib/services/whatsapp/salesforce-query-tool';

const salesforceTool = createSalesforceQueryTool(
  organizationId,
  loggingService,
  staffId,
  fromPhoneNumber
);
```

## Adding New Tools

To add new Salesforce AI tools:

1. Create a new file in this directory (e.g., `salesforce-data-mapper.ts`)
2. Define input/output schemas in `types.ts`
3. Implement the tool class with AI integration
4. Add unit tests
5. Export from `index.ts`

## Architecture

Each tool follows this pattern:

1. **Input Validation**: Zod schemas for type-safe inputs
2. **AI Integration**: Uses Vercel AI SDK with Azure OpenAI
3. **Context Awareness**: Tools receive organizational context
4. **Error Handling**: Graceful error handling with meaningful messages
5. **Testing**: Comprehensive unit tests with mocked AI responses