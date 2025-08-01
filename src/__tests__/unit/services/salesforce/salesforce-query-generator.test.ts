import { generateObject } from 'ai';
import { createSalesforceQueryGenerator } from '~/app/lib/services/salesforce/tools';
import { SalesforceToolContext } from '~/app/lib/services/salesforce/tools/types';

jest.mock('ai');
jest.mock('~/app/lib/utils/ai/get-model', () => ({
  getAzureOpenAIModel: jest.fn().mockReturnValue('mock-model'),
}));
jest.mock('~/app/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock fetch
global.fetch = jest.fn();

describe('SalesforceQueryGenerator', () => {
  const mockContext: SalesforceToolContext = {
    organizationId: 'org-123',
    userId: 'user-123',
    salesforceInstanceUrl: 'https://test.salesforce.com',
    availableObjects: ['Account', 'Contact', 'Opportunity'],
    accessToken: 'mock-access-token',
    metadata: {
      instanceUrl: 'https://test.salesforce.com',
    },
  };

  const mockGenerateObject = generateObject as jest.MockedFunction<typeof generateObject>;
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateQuery', () => {
    it('should generate a simple SOQL query from natural language', async () => {
      const expectedOutput = {
        soql: "SELECT Id, Name, Phone FROM Account WHERE Industry = 'Technology' LIMIT 10",
        explanation:
          'This query retrieves the ID, Name, and Phone fields from all Account records where the Industry is Technology, limited to 10 results.',
        objects: ['Account'],
        fields: { Account: ['Id', 'Name', 'Phone', 'Industry'] },
        warnings: [],
      };

      mockGenerateObject.mockResolvedValueOnce({ object: expectedOutput });

      const generator = createSalesforceQueryGenerator(mockContext);
      const result = await generator.generateQuery({
        request: 'Find all technology companies with their phone numbers',
      });

      expect(result).toEqual(expectedOutput);
      expect(mockGenerateObject).toHaveBeenCalledWith({
        model: 'mock-model',
        system: expect.stringContaining('expert Salesforce SOQL query generator'),
        prompt: expect.stringContaining('Find all technology companies'),
        schema: expect.any(Object),
      });
    });

    it('should include available objects and fields in the prompt', async () => {
      const expectedOutput = {
        soql: "SELECT Id, FirstName, LastName, Account.Name FROM Contact WHERE Account.Industry = 'Healthcare'",
        explanation:
          'This query retrieves contacts with their associated account names where the account is in the Healthcare industry.',
        objects: ['Contact', 'Account'],
        fields: {
          Contact: ['Id', 'FirstName', 'LastName'],
          Account: ['Name', 'Industry'],
        },
      };

      mockGenerateObject.mockResolvedValueOnce({ object: expectedOutput });

      const generator = createSalesforceQueryGenerator(mockContext);
      const result = await generator.generateQuery({
        request: 'Get contacts from healthcare accounts',
        objects: ['Account', 'Contact'],
        fields: {
          Account: ['Id', 'Name', 'Industry'],
          Contact: ['Id', 'FirstName', 'LastName', 'AccountId'],
        },
      });

      expect(result.soql).toContain('Contact');
      expect(result.soql).toContain('Account');
      expect(mockGenerateObject).toHaveBeenCalledWith({
        model: 'mock-model',
        system: expect.any(String),
        prompt: expect.stringContaining('Available Salesforce objects: Account, Contact'),
        schema: expect.any(Object),
      });
    });

    it('should handle errors gracefully', async () => {
      mockGenerateObject.mockRejectedValueOnce(new Error('AI service error'));

      const generator = createSalesforceQueryGenerator(mockContext);

      await expect(
        generator.generateQuery({
          request: 'Find all accounts',
        })
      ).rejects.toThrow('Failed to generate Salesforce query');
    });
  });

  describe('validateQuery', () => {
    const generator = createSalesforceQueryGenerator(mockContext);

    it('should validate a correct SOQL query', async () => {
      const result = await generator.validateQuery('SELECT Id, Name FROM Account');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should catch queries without SELECT', async () => {
      const result = await generator.validateQuery('Id, Name FROM Account');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Query must start with SELECT');
    });

    it('should catch queries without FROM', async () => {
      const result = await generator.validateQuery('SELECT Id, Name');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Query must include FROM clause');
    });

    it('should catch mismatched parentheses', async () => {
      const result = await generator.validateQuery(
        'SELECT Id, (SELECT Name FROM Contacts FROM Account'
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Mismatched parentheses');
    });

    it('should prevent DML operations', async () => {
      const result = await generator.validateQuery("DELETE FROM Account WHERE Id = '123'");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Only SELECT queries are allowed');
    });
  });

  describe('suggestOptimizations', () => {
    const generator = createSalesforceQueryGenerator(mockContext);

    it('should suggest adding LIMIT clause', async () => {
      const suggestions = await generator.suggestOptimizations('SELECT Id, Name FROM Account');
      expect(suggestions).toContain('Consider adding a LIMIT clause to prevent large result sets');
    });

    it('should warn against SELECT *', async () => {
      const suggestions = await generator.suggestOptimizations('SELECT * FROM Account');
      expect(suggestions).toContain(
        'Avoid SELECT *, specify only required fields to improve performance'
      );
    });

    it('should suggest filtering by Id', async () => {
      const suggestions = await generator.suggestOptimizations(
        "SELECT Id FROM Account WHERE Name = 'Test'"
      );
      expect(suggestions).toContain(
        'Consider filtering by Id when possible for better performance'
      );
    });

    it('should warn about multiple subqueries', async () => {
      const query = `
        SELECT Id, Name,
          (SELECT Id FROM Contacts),
          (SELECT Id FROM Opportunities),
          (SELECT Id FROM Cases)
        FROM Account
      `;
      const suggestions = await generator.suggestOptimizations(query);
      expect(suggestions).toContain(
        'Query contains 3 subqueries, consider breaking into separate queries'
      );
    });

    it('should return no suggestions for optimized query', async () => {
      const suggestions = await generator.suggestOptimizations(
        "SELECT Id, Name FROM Account WHERE Id = '123' LIMIT 10"
      );
      expect(suggestions).toHaveLength(0);
    });
  });

  describe('executeQuery', () => {
    const generator = createSalesforceQueryGenerator(mockContext);

    it('should execute a query successfully', async () => {
      const mockResponse = {
        totalSize: 3,
        done: true,
        records: [
          { Id: '001xx000003DHP0', Name: 'Acme Corp' },
          { Id: '001xx000003DHP1', Name: 'Global Tech' },
          { Id: '001xx000003DHP2', Name: 'Enterprise Solutions' },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await generator.executeQuery('SELECT Id, Name FROM Account LIMIT 3');

      expect(result).toEqual({
        success: true,
        records: mockResponse.records,
        totalSize: 3,
        done: true,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.salesforce.com/services/data/v60.0/query?q=SELECT%20Id%2C%20Name%20FROM%20Account%20LIMIT%203',
        {
          headers: {
            Authorization: 'Bearer mock-access-token',
            'Content-Type': 'application/json',
          },
        }
      );
    });

    it('should handle query execution errors', async () => {
      const errorResponse = [
        {
          message: "INVALID_FIELD: No such column 'InvalidField' on entity 'Account'",
          errorCode: 'INVALID_FIELD',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => errorResponse,
      } as Response);

      const result = await generator.executeQuery('SELECT InvalidField FROM Account');

      expect(result).toEqual({
        success: false,
        error: "INVALID_FIELD: No such column 'InvalidField' on entity 'Account'",
        errorCode: 'INVALID_FIELD',
      });
    });

    it('should handle missing access token', async () => {
      const contextWithoutToken = { ...mockContext, accessToken: undefined };
      const generatorWithoutToken = createSalesforceQueryGenerator(contextWithoutToken);

      const result = await generatorWithoutToken.executeQuery('SELECT Id FROM Account');

      expect(result).toEqual({
        success: false,
        error: 'No access token provided',
        errorCode: 'MISSING_ACCESS_TOKEN',
      });
    });

    it('should handle missing instance URL', async () => {
      const contextWithoutUrl = { ...mockContext, metadata: {} };
      const generatorWithoutUrl = createSalesforceQueryGenerator(contextWithoutUrl);

      const result = await generatorWithoutUrl.executeQuery('SELECT Id FROM Account');

      expect(result).toEqual({
        success: false,
        error: 'No Salesforce instance URL provided',
        errorCode: 'MISSING_INSTANCE_URL',
      });
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await generator.executeQuery('SELECT Id FROM Account');

      expect(result).toEqual({
        success: false,
        error: 'Network error',
        errorCode: 'EXECUTION_ERROR',
      });
    });
  });

  describe('generateAndExecuteQuery', () => {
    it('should generate and execute a query successfully', async () => {
      const mockQueryOutput = {
        soql: "SELECT Id, Name, Industry FROM Account WHERE Industry = 'Technology' LIMIT 10",
        explanation: 'Retrieves technology companies',
        objects: ['Account'],
        fields: { Account: ['Id', 'Name', 'Industry'] },
        warnings: [],
      };

      const mockQueryResponse = {
        totalSize: 2,
        done: true,
        records: [
          { Id: '001xx000003DHP0', Name: 'Tech Corp', Industry: 'Technology' },
          { Id: '001xx000003DHP1', Name: 'Software Inc', Industry: 'Technology' },
        ],
      };

      mockGenerateObject.mockResolvedValueOnce({ object: mockQueryOutput });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockQueryResponse,
      } as Response);

      const generator = createSalesforceQueryGenerator(mockContext);
      const result = await generator.generateAndExecuteQuery({
        request: 'Find technology companies',
      });

      expect(result.query).toEqual(mockQueryOutput);
      expect(result.executionResult).toEqual({
        success: true,
        records: mockQueryResponse.records,
        totalSize: 2,
        done: true,
      });
      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should handle validation errors', async () => {
      const mockQueryOutput = {
        soql: 'DELETE FROM Account',
        explanation: 'Invalid query',
        objects: ['Account'],
        fields: { Account: [] },
        warnings: [],
      };

      mockGenerateObject.mockResolvedValueOnce({ object: mockQueryOutput });

      const generator = createSalesforceQueryGenerator(mockContext);
      const result = await generator.generateAndExecuteQuery({
        request: 'Delete all accounts',
      });

      expect(result.query).toEqual(mockQueryOutput);
      expect(result.executionResult).toEqual({
        success: false,
        error: 'Query validation failed: Query must start with SELECT',
        errorCode: 'VALIDATION_ERROR',
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle execution errors after successful generation', async () => {
      const mockQueryOutput = {
        soql: 'SELECT Id, Name FROM InvalidObject',
        explanation: 'Query with invalid object',
        objects: ['InvalidObject'],
        fields: { InvalidObject: ['Id', 'Name'] },
        warnings: [],
      };

      const errorResponse = [
        {
          message: "INVALID_TYPE: sObject type 'InvalidObject' is not supported",
          errorCode: 'INVALID_TYPE',
        },
      ];

      mockGenerateObject.mockResolvedValueOnce({ object: mockQueryOutput });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => errorResponse,
      } as Response);

      const generator = createSalesforceQueryGenerator(mockContext);
      const result = await generator.generateAndExecuteQuery({
        request: 'Get data from invalid object',
      });

      expect(result.query).toEqual(mockQueryOutput);
      expect(result.executionResult).toEqual({
        success: false,
        error: "INVALID_TYPE: sObject type 'InvalidObject' is not supported",
        errorCode: 'INVALID_TYPE',
      });
    });
  });
});
