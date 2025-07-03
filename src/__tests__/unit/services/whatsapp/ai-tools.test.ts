import { createAITools, generateSQLErrorFeedback } from '@/app/lib/services/whatsapp/ai-tools';
import { WhatsAppSQLEngineService } from '@/app/lib/services/whatsapp/whatsapp-sql-engine.service';
import { WhatsAppStaffLoggingService } from '@/app/lib/services/whatsapp/whatsapp-staff-logging.service';
import { createDonorAnalysisTool } from '@/app/lib/services/whatsapp/donor-analysis-tool';
import { createDonorActionInsightsTool } from '@/app/lib/services/whatsapp/donor-action-insights-tool';
import { logger } from '@/app/lib/logger';
import { SQLError } from '@/app/lib/services/whatsapp/types';

// Mock dependencies
jest.mock('@/app/lib/services/whatsapp/whatsapp-sql-engine.service');
jest.mock('@/app/lib/services/whatsapp/whatsapp-staff-logging.service');
jest.mock('@/app/lib/services/whatsapp/donor-analysis-tool');
jest.mock('@/app/lib/services/whatsapp/donor-action-insights-tool');
jest.mock('@/app/lib/logger');

describe('ai-tools', () => {
  let mockSQLEngine: jest.Mocked<WhatsAppSQLEngineService>;
  let mockLoggingService: jest.Mocked<WhatsAppStaffLoggingService>;

  const testConfig = {
    organizationId: 'org123',
    staffId: 1,
    fromPhoneNumber: '+1234567890'
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockSQLEngine = new WhatsAppSQLEngineService() as jest.Mocked<WhatsAppSQLEngineService>;
    mockLoggingService = new WhatsAppStaffLoggingService() as jest.Mocked<WhatsAppStaffLoggingService>;

    mockSQLEngine.getSchemaDescription = jest.fn().mockReturnValue('Schema description');
    mockLoggingService.logDatabaseQuery = jest.fn().mockResolvedValue(undefined);
    mockLoggingService.logError = jest.fn().mockResolvedValue(undefined);

    (createDonorAnalysisTool as jest.Mock).mockReturnValue({ donorAnalysis: {} });
    (createDonorActionInsightsTool as jest.Mock).mockReturnValue({ donorActionInsights: {} });
  });

  describe('generateSQLErrorFeedback', () => {
    it('should generate feedback for syntax errors', () => {
      const error: SQLError = {
        type: 'syntax',
        message: 'Syntax error near SELECT',
        suggestion: 'Check your SQL syntax'
      };

      const feedback = generateSQLErrorFeedback(error, 'SELECT * FORM donors', 0);

      expect(feedback).toContain('SQL Error (syntax): Syntax error near SELECT');
      expect(feedback).toContain('Failed Query: SELECT * FORM donors');
      expect(feedback).toContain('Suggestion: Check your SQL syntax');
      expect(feedback).toContain('Fix syntax errors by checking: quotes, parentheses');
      expect(feedback).toContain('This is retry attempt 1');
    });

    it('should generate feedback for security errors', () => {
      const error: SQLError = {
        type: 'security',
        message: 'Missing organization_id filter'
      };

      const feedback = generateSQLErrorFeedback(error, 'SELECT * FROM donors', 1);

      expect(feedback).toContain('SQL Error (security)');
      expect(feedback).toContain('Ensure security compliance: add WHERE organization_id clause');
      expect(feedback).toContain('This is retry attempt 2');
    });

    it('should generate feedback for runtime errors', () => {
      const error: SQLError = {
        type: 'runtime',
        message: 'Column "invalid_col" does not exist'
      };

      const feedback = generateSQLErrorFeedback(error, 'SELECT invalid_col FROM donors', 0);

      expect(feedback).toContain('SQL Error (runtime)');
      expect(feedback).toContain('Check that: table names exist');
      expect(feedback).toContain('column names are correct');
    });

    it('should handle unknown error types', () => {
      const error: SQLError = {
        type: 'unknown' as any,
        message: 'Unknown error occurred'
      };

      const feedback = generateSQLErrorFeedback(error, 'SELECT * FROM donors', 0);

      expect(feedback).toContain('Review the query for common issues');
    });
  });

  describe('createAITools', () => {
    let tools: any;

    beforeEach(() => {
      tools = createAITools(
        mockSQLEngine,
        mockLoggingService,
        testConfig.organizationId,
        testConfig.staffId,
        testConfig.fromPhoneNumber
      );
    });

    describe('executeSQL tool', () => {
      it('should execute successful SELECT query', async () => {
        const mockResult = [
          { id: 1, name: 'John Doe' },
          { id: 2, name: 'Jane Smith' }
        ];

        mockSQLEngine.executeRawSQL = jest.fn().mockResolvedValue({
          success: true,
          data: mockResult
        });

        const result = await tools.executeSQL.execute({
          query: 'SELECT * FROM donors WHERE organization_id = ?'
        });

        expect(mockSQLEngine.executeRawSQL).toHaveBeenCalledWith({
          query: 'SELECT * FROM donors WHERE organization_id = ?',
          organizationId: testConfig.organizationId
        });

        expect(mockLoggingService.logDatabaseQuery).toHaveBeenCalledWith(
          testConfig.staffId,
          testConfig.organizationId,
          testConfig.fromPhoneNumber,
          'SELECT * FROM donors WHERE organization_id = ?',
          mockResult,
          expect.any(Number)
        );

        expect(result).toEqual(mockResult);
      });

      it('should execute successful INSERT query', async () => {
        mockSQLEngine.executeRawSQL = jest.fn().mockResolvedValue({
          success: true,
          data: { affectedRows: 1 }
        });

        const result = await tools.executeSQL.execute({
          query: 'INSERT INTO donors (name, organization_id) VALUES (?, ?)'
        });

        expect(logger.info).toHaveBeenCalledWith(
          expect.stringContaining('INSERT operation completed successfully')
        );

        expect(result).toEqual({ affectedRows: 1 });
      });

      it('should execute successful UPDATE query', async () => {
        mockSQLEngine.executeRawSQL = jest.fn().mockResolvedValue({
          success: true,
          data: { affectedRows: 5 }
        });

        const result = await tools.executeSQL.execute({
          query: 'UPDATE donors SET status = ? WHERE organization_id = ?'
        });

        expect(logger.info).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE operation completed successfully')
        );

        expect(result).toEqual({ affectedRows: 5 });
      });

      it('should block dangerous SQL operations', async () => {
        const dangerousQueries = [
          'DELETE FROM donors',
          'DROP TABLE donors',
          'DROP DATABASE mydb',
          'TRUNCATE donors',
          'ALTER TABLE donors ADD COLUMN',
          'CREATE TABLE new_table',
          'CREATE DATABASE newdb',
          'GRANT ALL ON donors TO user',
          'REVOKE SELECT ON donors FROM user'
        ];

        for (const query of dangerousQueries) {
          await expect(tools.executeSQL.execute({ query })).rejects.toThrow(
            /Operation .* is not allowed for security reasons/
          );

          expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('Blocked dangerous operation')
          );
        }
      });

      it('should handle SQL errors with retry logic', async () => {
        const sqlError: SQLError = {
          type: 'syntax',
          message: 'Syntax error',
          suggestion: 'Fix the syntax'
        };

        mockSQLEngine.executeRawSQL = jest.fn().mockResolvedValue({
          success: false,
          error: sqlError
        });

        const result = await tools.executeSQL.execute({
          query: 'SELECT * FORM donors', // Typo: FORM instead of FROM
          retryAttempt: 0
        });

        expect(result).toMatchObject({
          error: true,
          errorType: 'syntax',
          errorMessage: 'Syntax error',
          suggestion: 'Fix the syntax',
          retryAttempt: 1,
          instructions: expect.stringContaining('analyze the error and rewrite the query')
        });

        expect(mockLoggingService.logError).toHaveBeenCalledWith(
          testConfig.staffId,
          testConfig.organizationId,
          testConfig.fromPhoneNumber,
          'SQL Error (attempt 1): Syntax error',
          sqlError,
          'sql_execution_error'
        );
      });

      it('should throw error after max retries exceeded', async () => {
        const sqlError: SQLError = {
          type: 'syntax',
          message: 'Persistent error'
        };

        mockSQLEngine.executeRawSQL = jest.fn().mockResolvedValue({
          success: false,
          error: sqlError
        });

        await expect(
          tools.executeSQL.execute({
            query: 'SELECT * FROM donors',
            retryAttempt: 2 // Max retries
          })
        ).rejects.toThrow(
          'SQL query failed after 3 attempts. Last error: Persistent error'
        );

        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining('Max SQL retries (2) exceeded')
        );
      });

      it('should handle unknown SQL execution errors', async () => {
        mockSQLEngine.executeRawSQL = jest.fn().mockResolvedValue({
          success: false
          // No error object
        });

        await expect(
          tools.executeSQL.execute({ query: 'SELECT * FROM donors' })
        ).rejects.toThrow('Unknown SQL execution error occurred');
      });

      it('should include previous error context in retry', async () => {
        const sqlError: SQLError = {
          type: 'runtime',
          message: 'Column not found'
        };

        mockSQLEngine.executeRawSQL = jest.fn().mockResolvedValue({
          success: false,
          error: sqlError
        });

        const result = await tools.executeSQL.execute({
          query: 'SELECT invalid_col FROM donors',
          retryAttempt: 1,
          previousError: 'Previous attempt failed'
        });

        expect(result.retryAttempt).toBe(2);
        expect(result.failedQuery).toBe('SELECT invalid_col FROM donors');
      });
    });

    describe('askClarification tool', () => {
      it('should ask clarification without context', async () => {
        const result = await tools.askClarification.execute({
          question: 'Which donor are you referring to?'
        });

        expect(result).toEqual({
          clarificationAsked: true,
          question: 'Which donor are you referring to?',
          context: ''
        });

        expect(logger.info).toHaveBeenCalledWith(
          expect.stringContaining('Asking clarification: Which donor are you referring to?')
        );
      });

      it('should ask clarification with context', async () => {
        const result = await tools.askClarification.execute({
          question: 'Do you mean John Smith or John Doe?',
          context: 'Multiple donors found with first name John'
        });

        expect(result).toEqual({
          clarificationAsked: true,
          question: 'Do you mean John Smith or John Doe?',
          context: 'Multiple donors found with first name John'
        });
      });
    });

    describe('tool integration', () => {
      it('should include donor analysis tool', () => {
        expect(createDonorAnalysisTool).toHaveBeenCalledWith(
          testConfig.organizationId,
          mockLoggingService,
          testConfig.staffId,
          testConfig.fromPhoneNumber
        );

        expect(tools).toHaveProperty('donorAnalysis');
      });

      it('should include donor action insights tool', () => {
        expect(createDonorActionInsightsTool).toHaveBeenCalledWith(
          testConfig.organizationId,
          mockLoggingService,
          testConfig.staffId,
          testConfig.fromPhoneNumber
        );

        expect(tools).toHaveProperty('donorActionInsights');
      });

      it('should pass schema description to SQL tool', () => {
        expect(mockSQLEngine.getSchemaDescription).toHaveBeenCalled();
        expect(tools.executeSQL.description).toContain('Schema description');
      });
    });

    describe('security validation', () => {
      it('should be case-insensitive when checking dangerous operations', async () => {
        const mixedCaseQueries = [
          'DeLeTe FrOm donors',
          'drop TABLE donors',
          'TRUNCATE donors'
        ];

        for (const query of mixedCaseQueries) {
          await expect(tools.executeSQL.execute({ query })).rejects.toThrow(
            /Operation .* is not allowed for security reasons/
          );
        }
      });

      it('should detect dangerous operations within larger queries', async () => {
        const query = 'SELECT * FROM donors; DROP TABLE donors;';

        await expect(tools.executeSQL.execute({ query })).rejects.toThrow(
          /Operation DROP TABLE is not allowed for security reasons/
        );
      });
    });
  });
});