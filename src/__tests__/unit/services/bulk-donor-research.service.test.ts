import { BulkDonorResearchService, type StartBulkResearchInput } from '@/app/lib/services/bulk-donor-research.service';
import { TRPCError } from '@trpc/server';
import { db } from '@/app/lib/db';
import { logger } from '@/app/lib/logger';
import { bulkDonorResearchTask } from '@/trigger/jobs/bulkDonorResearch';

// Mock dependencies
jest.mock('@/app/lib/db');
jest.mock('@/app/lib/logger');
jest.mock('@/trigger/jobs/bulkDonorResearch');
jest.mock('drizzle-orm', () => ({
  eq: jest.fn((a, b) => ({ type: 'eq', a, b })),
  and: jest.fn((...conditions) => ({ type: 'and', conditions })),
  notExists: jest.fn((subquery) => ({ type: 'notExists', subquery })),
  count: jest.fn(() => ({ type: 'count' })),
  inArray: jest.fn((column, values) => ({ type: 'inArray', column, values })),
}));

describe('BulkDonorResearchService', () => {
  let service: BulkDonorResearchService;

  const mockSelect = jest.fn();
  const mockFrom = jest.fn();
  const mockWhere = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BulkDonorResearchService();

    // Setup mock chain
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockResolvedValue([{ count: 10 }]); // Default count

    (db.select as jest.Mock).mockImplementation(mockSelect);
  });

  describe('startBulkResearch', () => {
    const input: StartBulkResearchInput = {
      organizationId: 'org123',
      userId: 'user123',
    };

    beforeEach(() => {
      // Mock the count queries
      jest.spyOn(service, 'getUnresearchedDonorsCount').mockResolvedValue({
        totalDonors: 100,
        unresearchedDonors: 50,
        researchedDonors: 50,
      });

      // Mock the task trigger
      (bulkDonorResearchTask.trigger as jest.Mock).mockResolvedValue({
        id: 'job123',
      });
    });

    it('should start bulk research successfully', async () => {
      const result = await service.startBulkResearch(input);

      expect(result).toEqual({
        jobId: 'job123',
        donorsToResearch: 50,
      });

      expect(service.getUnresearchedDonorsCount).toHaveBeenCalledWith('org123', undefined);
      expect(bulkDonorResearchTask.trigger).toHaveBeenCalledWith({
        organizationId: 'org123',
        userId: 'user123',
        donorIds: undefined,
        limit: undefined,
      });
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Starting bulk donor research for organization org123 - 50 donors to research')
      );
    });

    it('should handle specific donor IDs', async () => {
      const inputWithDonors: StartBulkResearchInput = {
        ...input,
        donorIds: [1, 2, 3],
      };

      jest.spyOn(service, 'getUnresearchedDonorsCount').mockResolvedValue({
        totalDonors: 3,
        unresearchedDonors: 2,
        researchedDonors: 1,
      });

      const result = await service.startBulkResearch(inputWithDonors);

      expect(result.donorsToResearch).toBe(2);
      expect(service.getUnresearchedDonorsCount).toHaveBeenCalledWith('org123', [1, 2, 3]);
      expect(bulkDonorResearchTask.trigger).toHaveBeenCalledWith({
        organizationId: 'org123',
        userId: 'user123',
        donorIds: [1, 2, 3],
        limit: undefined,
      });
    });

    it('should apply limit when specified', async () => {
      const inputWithLimit: StartBulkResearchInput = {
        ...input,
        limit: 10,
      };

      const result = await service.startBulkResearch(inputWithLimit);

      expect(result.donorsToResearch).toBe(10);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('10 donors to research (limited from 50)')
      );
      expect(bulkDonorResearchTask.trigger).toHaveBeenCalledWith({
        organizationId: 'org123',
        userId: 'user123',
        donorIds: undefined,
        limit: 10,
      });
    });

    it('should handle limit larger than unresearched donors', async () => {
      const inputWithLimit: StartBulkResearchInput = {
        ...input,
        limit: 100,
      };

      const result = await service.startBulkResearch(inputWithLimit);

      expect(result.donorsToResearch).toBe(50); // Should use actual count, not limit
    });

    it('should throw error when no donors need research', async () => {
      jest.spyOn(service, 'getUnresearchedDonorsCount').mockResolvedValue({
        totalDonors: 100,
        unresearchedDonors: 0,
        researchedDonors: 100,
      });

      await expect(service.startBulkResearch(input)).rejects.toThrow(TRPCError);
      await expect(service.startBulkResearch(input)).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'No donors found that need research',
      });
    });

    it('should handle task trigger failures', async () => {
      (bulkDonorResearchTask.trigger as jest.Mock).mockRejectedValue(new Error('Task trigger failed'));

      await expect(service.startBulkResearch(input)).rejects.toThrow(TRPCError);
      await expect(service.startBulkResearch(input)).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to start bulk donor research',
      });
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to start bulk donor research: Task trigger failed')
      );
    });

    it('should rethrow TRPCError as is', async () => {
      const customError = new TRPCError({
        code: 'FORBIDDEN',
        message: 'Custom error',
      });
      jest.spyOn(service, 'getUnresearchedDonorsCount').mockRejectedValue(customError);

      await expect(service.startBulkResearch(input)).rejects.toThrow(customError);
    });
  });

  describe('getUnresearchedDonorsCount', () => {
    beforeEach(() => {
      // Restore original implementation
      jest.restoreAllMocks();
      
      // Setup default mock responses
      mockWhere.mockResolvedValueOnce([{ count: 100 }]) // Total donors
        .mockResolvedValueOnce([{ count: 30 }]); // Unresearched donors
    });

    it('should get unresearched donors count for organization', async () => {
      const result = await service.getUnresearchedDonorsCount('org123');

      expect(result).toEqual({
        totalDonors: 100,
        unresearchedDonors: 30,
        researchedDonors: 70,
      });

      expect(db.select).toHaveBeenCalledTimes(2);
      expect(mockFrom).toHaveBeenCalledTimes(2);
      expect(mockWhere).toHaveBeenCalledTimes(2);
    });

    it('should filter by specific donor IDs when provided', async () => {
      const result = await service.getUnresearchedDonorsCount('org123', [1, 2, 3]);

      expect(result).toEqual({
        totalDonors: 100,
        unresearchedDonors: 30,
        researchedDonors: 70,
      });

      // Verify inArray was used in the where conditions
      const whereCalls = mockWhere.mock.calls;
      expect(whereCalls[0][0]).toMatchObject({
        type: 'and',
        conditions: expect.arrayContaining([
          expect.objectContaining({ type: 'inArray' }),
        ]),
      });
    });

    it('should handle empty results', async () => {
      mockWhere.mockReset();
      mockWhere.mockResolvedValueOnce([]) // No total donors
        .mockResolvedValueOnce([]); // No unresearched donors

      const result = await service.getUnresearchedDonorsCount('org123');

      expect(result).toEqual({
        totalDonors: 0,
        unresearchedDonors: 0,
        researchedDonors: 0,
      });
    });

    it('should handle database errors', async () => {
      mockWhere.mockRejectedValue(new Error('Database error'));

      await expect(service.getUnresearchedDonorsCount('org123')).rejects.toThrow(TRPCError);
      await expect(service.getUnresearchedDonorsCount('org123')).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get donor research statistics',
      });
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to get unresearched donors count: Database error')
      );
    });

    it('should use notExists to check for research', async () => {
      await service.getUnresearchedDonorsCount('org123');

      // Check that notExists was used in the unresearched query
      const whereCalls = mockWhere.mock.calls;
      expect(whereCalls[1][0]).toMatchObject({
        type: 'and',
        conditions: expect.arrayContaining([
          expect.objectContaining({ type: 'notExists' }),
        ]),
      });
    });
  });

  describe('getResearchStatistics', () => {
    it('should calculate research statistics correctly', async () => {
      jest.spyOn(service, 'getUnresearchedDonorsCount').mockResolvedValue({
        totalDonors: 100,
        unresearchedDonors: 25,
        researchedDonors: 75,
      });

      const result = await service.getResearchStatistics('org123');

      expect(result).toEqual({
        totalDonors: 100,
        unresearchedDonors: 25,
        researchedDonors: 75,
        researchPercentage: 75,
      });
    });

    it('should handle zero total donors', async () => {
      jest.spyOn(service, 'getUnresearchedDonorsCount').mockResolvedValue({
        totalDonors: 0,
        unresearchedDonors: 0,
        researchedDonors: 0,
      });

      const result = await service.getResearchStatistics('org123');

      expect(result.researchPercentage).toBe(0);
    });

    it('should round percentage correctly', async () => {
      jest.spyOn(service, 'getUnresearchedDonorsCount').mockResolvedValue({
        totalDonors: 100,
        unresearchedDonors: 67,
        researchedDonors: 33,
      });

      const result = await service.getResearchStatistics('org123');

      expect(result.researchPercentage).toBe(33);
    });

    it('should propagate errors from getUnresearchedDonorsCount', async () => {
      jest.spyOn(service, 'getUnresearchedDonorsCount').mockRejectedValue(
        new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Database error',
        })
      );

      await expect(service.getResearchStatistics('org123')).rejects.toThrow(TRPCError);
    });
  });
});