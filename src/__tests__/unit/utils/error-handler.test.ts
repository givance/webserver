import { TRPCError } from '@trpc/server';
import { 
  ErrorHandler, 
  ErrorCodes, 
  createNotFoundError,
  createAuthorizationError,
  createAuthenticationError,
  createValidationError,
  wrapDatabaseOperation,
  type ErrorContext 
} from '@/app/lib/utils/error-handler';
import { logger } from '@/app/lib/logger';

// Mock the logger
jest.mock('@/app/lib/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('error-handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ErrorHandler.createError', () => {
    it('should create a TRPCError with correct code and message', () => {
      const error = ErrorHandler.createError('NOT_FOUND', 'Resource not found');
      
      expect(error).toBeInstanceOf(TRPCError);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('Resource not found');
    });

    it('should log errors with warn level for non-internal errors', () => {
      ErrorHandler.createError('NOT_FOUND', 'Resource not found');
      
      expect(logger.warn).toHaveBeenCalledWith('Resource not found');
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should log errors with error level for internal server errors', () => {
      ErrorHandler.createError('INTERNAL_SERVER_ERROR', 'Something went wrong');
      
      expect(logger.error).toHaveBeenCalledWith('Something went wrong');
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should include context in log message', () => {
      const context: ErrorContext = {
        userId: 'user123',
        organizationId: 'org456',
        operation: 'updateDonor',
      };
      
      ErrorHandler.createError('NOT_FOUND', 'Donor not found', context);
      
      expect(logger.warn).toHaveBeenCalledWith(
        'Donor not found (operation: updateDonor, userId: user123, organizationId: org456)'
      );
    });

    it('should include resource information in log message', () => {
      const context: ErrorContext = {
        resourceType: 'Donor',
        resourceId: 'donor789',
      };
      
      ErrorHandler.createError('NOT_FOUND', 'Not found', context);
      
      expect(logger.warn).toHaveBeenCalledWith(
        'Not found (resource: Donor:donor789)'
      );
    });

    it('should include additional data in log message', () => {
      const context: ErrorContext = {
        operation: 'test',
        additionalData: { key: 'value', count: 42 },
      };
      
      ErrorHandler.createError('BAD_REQUEST', 'Bad request', context);
      
      expect(logger.warn).toHaveBeenCalledWith(
        'Bad request (operation: test) data: {"key":"value","count":42}'
      );
    });

    it('should include cause in log message', () => {
      const cause = new Error('Original error');
      ErrorHandler.createError('INTERNAL_SERVER_ERROR', 'Wrapped error', undefined, cause);
      
      expect(logger.error).toHaveBeenCalledWith('Wrapped error cause: Original error');
    });
  });

  describe('ErrorHandler.handleDatabaseError', () => {
    it('should handle duplicate key errors', () => {
      const dbError = new Error('duplicate key value violates unique constraint');
      const error = ErrorHandler.handleDatabaseError(dbError);
      
      expect(error.code).toBe('CONFLICT');
      expect(error.message).toBe('A record with this information already exists');
    });

    it('should handle unique constraint errors', () => {
      const dbError = new Error('unique constraint violation');
      const error = ErrorHandler.handleDatabaseError(dbError);
      
      expect(error.code).toBe('CONFLICT');
      expect(error.message).toBe('A record with this information already exists');
    });

    it('should handle foreign key errors', () => {
      const dbError = new Error('foreign key constraint fails');
      const error = ErrorHandler.handleDatabaseError(dbError);
      
      expect(error.code).toBe('BAD_REQUEST');
      expect(error.message).toBe('This operation would violate data integrity constraints');
    });

    it('should handle not found errors', () => {
      const dbError = new Error('record not found');
      const error = ErrorHandler.handleDatabaseError(dbError);
      
      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('The requested resource was not found');
    });

    it('should handle unknown database errors', () => {
      const dbError = new Error('unknown database error');
      const error = ErrorHandler.handleDatabaseError(dbError);
      
      expect(error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(error.message).toBe('A database error occurred');
    });

    it('should preserve context in database errors', () => {
      const context: ErrorContext = { userId: 'user123' };
      const dbError = new Error('duplicate key');
      
      ErrorHandler.handleDatabaseError(dbError, context);
      
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('userId: user123'));
    });
  });

  describe('ErrorHandler.handleNotFoundError', () => {
    it('should create proper not found error message', () => {
      const error = ErrorHandler.handleNotFoundError('Donor', '123');
      
      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('Donor with ID 123 not found');
    });

    it('should include resource information in context', () => {
      ErrorHandler.handleNotFoundError('Project', 456);
      
      expect(logger.warn).toHaveBeenCalledWith(
        'Project with ID 456 not found (resource: Project:456)'
      );
    });
  });

  describe('ErrorHandler.wrapOperation', () => {
    it('should return result when operation succeeds', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const result = await ErrorHandler.wrapOperation(operation);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalled();
    });

    it('should re-throw TRPCError as-is', async () => {
      const trpcError = new TRPCError({ code: 'NOT_FOUND', message: 'Not found' });
      const operation = jest.fn().mockRejectedValue(trpcError);
      
      await expect(ErrorHandler.wrapOperation(operation)).rejects.toBe(trpcError);
    });

    it('should handle database errors', async () => {
      const dbError = new Error('duplicate key value');
      const operation = jest.fn().mockRejectedValue(dbError);
      
      await expect(ErrorHandler.wrapOperation(operation)).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'A record with this information already exists',
      });
    });

    it('should handle generic errors with custom message', async () => {
      const error = new Error('Something failed');
      const operation = jest.fn().mockRejectedValue(error);
      
      await expect(
        ErrorHandler.wrapOperation(operation, undefined, 'Custom error message')
      ).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Custom error message',
      });
    });

    it('should handle non-Error objects', async () => {
      const operation = jest.fn().mockRejectedValue('string error');
      
      await expect(ErrorHandler.wrapOperation(operation)).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      });
    });

    it('should pass context through to error creation', async () => {
      const context: ErrorContext = { operation: 'testOp' };
      const error = new Error('Test error');
      const operation = jest.fn().mockRejectedValue(error);
      
      await expect(ErrorHandler.wrapOperation(operation, context)).rejects.toThrow();
      
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('operation: testOp'));
    });
  });

  describe('Convenience functions', () => {
    it('createNotFoundError should create proper error', () => {
      const error = createNotFoundError('User', 'user123');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('User with ID user123 not found');
    });

    it('createAuthorizationError should create proper error', () => {
      const error = createAuthorizationError('Access denied');
      expect(error.code).toBe('FORBIDDEN');
      expect(error.message).toBe('Access denied');
    });

    it('createAuthenticationError should create proper error', () => {
      const error = createAuthenticationError('Invalid token');
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.message).toBe('Invalid token');
    });

    it('createValidationError should create proper error', () => {
      const error = createValidationError('Invalid email format');
      expect(error.code).toBe('BAD_REQUEST');
      expect(error.message).toBe('Invalid email format');
    });

    it('wrapDatabaseOperation should wrap operations correctly', async () => {
      const operation = jest.fn().mockResolvedValue('result');
      const result = await wrapDatabaseOperation(operation);
      expect(result).toBe('result');
    });
  });

  describe('Database error detection', () => {
    const databaseErrorKeywords = [
      'duplicate key',
      'unique constraint',
      'foreign key',
      'violates constraint',
      'relation does not exist',
      'column not found',
      'table missing',
      'database connection failed',
      'connection timeout',
    ];

    databaseErrorKeywords.forEach(keyword => {
      it(`should detect "${keyword}" as database error`, async () => {
        const error = new Error(`Error: ${keyword} in operation`);
        const operation = jest.fn().mockRejectedValue(error);
        
        await expect(ErrorHandler.wrapOperation(operation)).rejects.toThrow();
        
        // Should be handled as database error, not generic internal error
        const logCall = logger.warn.mock.calls[0] || logger.error.mock.calls[0];
        expect(logCall).toBeDefined();
        expect(logCall[0]).toContain('cause:');
      });
    });
  });
});