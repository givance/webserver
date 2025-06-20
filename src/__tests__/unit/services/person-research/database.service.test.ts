import { PersonResearchDatabaseService } from '@/app/lib/services/person-research/database.service';
import { db } from '@/app/lib/db';
import { logger } from '@/app/lib/logger';
import type {
  SavePersonResearchInput,
  GetPersonResearchInput,
  PersonResearchDBRecord,
  PersonResearchResult,
} from '@/app/lib/services/person-research/types';

// Mock dependencies
jest.mock('@/app/lib/db');
jest.mock('@/app/lib/logger');
jest.mock('drizzle-orm', () => ({
  and: jest.fn((...conditions) => ({ type: 'and', conditions })),
  desc: jest.fn((column) => ({ type: 'desc', column })),
  eq: jest.fn((a, b) => ({ type: 'eq', a, b })),
}));

describe('PersonResearchDatabaseService', () => {
  let service: PersonResearchDatabaseService;

  const mockTransaction = jest.fn();
  const mockUpdate = jest.fn();
  const mockSet = jest.fn();
  const mockWhere = jest.fn();
  const mockSelect = jest.fn();
  const mockFrom = jest.fn();
  const mockOrderBy = jest.fn();
  const mockLimit = jest.fn();
  const mockInsert = jest.fn();
  const mockValues = jest.fn();
  const mockReturning = jest.fn();

  const mockResearchResult: PersonResearchResult = {
    answer: 'John Doe is a philanthropist',
    citations: [],
    summaries: [],
    totalLoops: 1,
    totalSources: 5,
    researchTopic: 'John Doe background',
    timestamp: new Date(),
    tokenUsage: {} as any,
    structuredData: {
      netWorth: '$1M',
      philanthropicFocus: ['Education'],
      notableContributions: [],
      highPotentialDonor: true,
    },
  };

  const mockDbRecord: PersonResearchDBRecord = {
    id: 100,
    donorId: 1,
    organizationId: 'org123',
    userId: 'user123',
    researchData: mockResearchResult,
    isLive: true,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PersonResearchDatabaseService();

    // Setup mock chains
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });
    mockWhere.mockResolvedValue([]);

    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere, orderBy: mockOrderBy });
    mockOrderBy.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue([]);
    mockWhere.mockReturnValue({ limit: mockLimit, orderBy: mockOrderBy });

    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ returning: mockReturning });
    mockReturning.mockResolvedValue([mockDbRecord]);

    // Setup transaction mock
    mockTransaction.mockImplementation(async (callback) => {
      const tx = {
        update: jest.fn().mockReturnValue({ set: mockSet }),
        select: jest.fn().mockReturnValue({ from: mockFrom }),
        insert: jest.fn().mockReturnValue({ values: mockValues }),
      };
      return callback(tx);
    });

    (db.transaction as jest.Mock).mockImplementation(mockTransaction);
    (db.update as jest.Mock).mockImplementation(mockUpdate);
    (db.select as jest.Mock).mockImplementation(mockSelect);
    (db.insert as jest.Mock).mockImplementation(mockInsert);
  });

  describe('savePersonResearch', () => {
    const mockInput: SavePersonResearchInput = {
      donorId: 1,
      organizationId: 'org123',
      userId: 'user123',
      researchResult: mockResearchResult,
      setAsLive: true,
    };

    it('should save new research as version 1 when no existing research', async () => {
      // No existing research
      mockLimit.mockResolvedValueOnce([]);

      const result = await service.savePersonResearch(mockInput);

      expect(result).toEqual(mockDbRecord);
      expect(mockTransaction).toHaveBeenCalled();
      
      // Inside transaction
      const txCallback = mockTransaction.mock.calls[0][0];
      const mockTx = {
        update: jest.fn().mockReturnValue({ set: mockSet }),
        select: jest.fn().mockReturnValue({ from: mockFrom }),
        insert: jest.fn().mockReturnValue({ values: mockValues }),
      };
      await txCallback(mockTx);

      // Should unmark existing live research
      expect(mockTx.update).toHaveBeenCalledWith(expect.any(Object));
      
      // Should check for existing versions
      expect(mockTx.select).toHaveBeenCalledWith({ version: expect.any(Object) });
      
      // Should insert new record
      expect(mockTx.insert).toHaveBeenCalledWith(expect.any(Object));
      expect(mockValues).toHaveBeenCalledWith({
        donorId: 1,
        organizationId: 'org123',
        userId: 'user123',
        researchTopic: 'John Doe background',
        researchData: mockResearchResult,
        isLive: true,
        version: 1,
      });

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Successfully saved person research for donor 1, version 1, live: true')
      );
    });

    it('should increment version when existing research exists', async () => {
      // Mock existing research with version 3
      mockLimit.mockResolvedValueOnce([{ version: 3 }]);

      await service.savePersonResearch(mockInput);

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 4,
        })
      );
    });

    it('should not unmark live research when setAsLive is false', async () => {
      const inputNotLive = { ...mockInput, setAsLive: false };
      
      await service.savePersonResearch(inputNotLive);

      const txCallback = mockTransaction.mock.calls[0][0];
      const mockTx = {
        update: jest.fn().mockReturnValue({ set: mockSet }),
        select: jest.fn().mockReturnValue({ from: mockFrom }),
        insert: jest.fn().mockReturnValue({ values: mockValues }),
      };
      await txCallback(mockTx);

      // Should not call update to unmark live
      expect(mockTx.update).not.toHaveBeenCalled();
      
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          isLive: false,
        })
      );
    });

    it('should handle transaction errors', async () => {
      mockTransaction.mockRejectedValue(new Error('Transaction failed'));

      await expect(service.savePersonResearch(mockInput)).rejects.toThrow(
        'Failed to save person research: Transaction failed'
      );

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to save person research for donor 1')
      );
    });
  });

  describe('getPersonResearch', () => {
    it('should get live version when no version specified', async () => {
      const input: GetPersonResearchInput = {
        donorId: 1,
        organizationId: 'org123',
      };

      mockLimit.mockResolvedValue([mockDbRecord]);

      const result = await service.getPersonResearch(input);

      expect(result).toEqual(mockDbRecord);
      expect(mockWhere).toHaveBeenCalledWith({
        type: 'and',
        conditions: [
          { type: 'eq', a: expect.any(Object), b: 1 },
          { type: 'eq', a: expect.any(Object), b: 'org123' },
          { type: 'eq', a: expect.any(Object), b: true },
        ],
      });
      expect(logger.info).toHaveBeenCalledWith(
        'Retrieving person research for donor 1 in organization org123 (live version)'
      );
    });

    it('should get specific version when specified', async () => {
      const input: GetPersonResearchInput = {
        donorId: 1,
        organizationId: 'org123',
        version: 2,
      };

      mockLimit.mockResolvedValue([{ ...mockDbRecord, version: 2 }]);

      const result = await service.getPersonResearch(input);

      expect(result?.version).toBe(2);
      expect(mockWhere).toHaveBeenCalledWith({
        type: 'and',
        conditions: [
          { type: 'eq', a: expect.any(Object), b: 1 },
          { type: 'eq', a: expect.any(Object), b: 'org123' },
          { type: 'eq', a: expect.any(Object), b: 2 },
        ],
      });
      expect(logger.info).toHaveBeenCalledWith(
        'Retrieving person research for donor 1 in organization org123 (version 2)'
      );
    });

    it('should return null when no research found', async () => {
      mockLimit.mockResolvedValue([]);

      const result = await service.getPersonResearch({
        donorId: 999,
        organizationId: 'org123',
      });

      expect(result).toBeNull();
      expect(logger.info).toHaveBeenCalledWith(
        'No person research found for donor 999 (live version)'
      );
    });

    it('should handle database errors', async () => {
      mockLimit.mockRejectedValue(new Error('Database error'));

      await expect(
        service.getPersonResearch({ donorId: 1, organizationId: 'org123' })
      ).rejects.toThrow('Failed to retrieve person research: Database error');

      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getAllPersonResearchVersions', () => {
    it('should get all versions ordered by version desc', async () => {
      const mockVersions = [
        { ...mockDbRecord, version: 3 },
        { ...mockDbRecord, version: 2 },
        { ...mockDbRecord, version: 1 },
      ];
      mockOrderBy.mockResolvedValue(mockVersions);

      const result = await service.getAllPersonResearchVersions(1, 'org123');

      expect(result).toEqual(mockVersions);
      expect(mockWhere).toHaveBeenCalledWith({
        type: 'and',
        conditions: [
          { type: 'eq', a: expect.any(Object), b: 1 },
          { type: 'eq', a: expect.any(Object), b: 'org123' },
        ],
      });
      expect(mockOrderBy).toHaveBeenCalledWith({ type: 'desc', column: expect.any(Object) });
      expect(logger.info).toHaveBeenCalledWith('Found 3 research versions for donor 1');
    });

    it('should handle empty results', async () => {
      mockOrderBy.mockResolvedValue([]);

      const result = await service.getAllPersonResearchVersions(1, 'org123');

      expect(result).toEqual([]);
      expect(logger.info).toHaveBeenCalledWith('Found 0 research versions for donor 1');
    });

    it('should handle database errors', async () => {
      mockOrderBy.mockRejectedValue(new Error('Database error'));

      await expect(
        service.getAllPersonResearchVersions(1, 'org123')
      ).rejects.toThrow('Failed to retrieve research versions: Database error');
    });
  });

  describe('setResearchAsLive', () => {
    it('should set research as live successfully', async () => {
      const updatedRecord = { ...mockDbRecord, isLive: true };

      mockTransaction.mockImplementation(async (callback) => {
        const tx = {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue([mockDbRecord]),
              }),
            }),
          }),
          update: jest.fn().mockReturnValue({
            set: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([]),
            }),
          }),
        };
        
        // For the final update that returns the record
        tx.update.mockReturnValueOnce({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([]),
          }),
        }).mockReturnValueOnce({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([updatedRecord]),
            }),
          }),
        });
        
        return callback(tx);
      });

      const result = await service.setResearchAsLive(100, 1);

      expect(result).toEqual(updatedRecord);
      expect(logger.info).toHaveBeenCalledWith(
        'Successfully set research 100 as live for donor 1'
      );
    });

    it('should throw error if research not found', async () => {
      mockTransaction.mockImplementation(async (callback) => {
        const tx = {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue([]),
              }),
            }),
          }),
        };
        return callback(tx);
      });

      await expect(service.setResearchAsLive(999, 1)).rejects.toThrow(
        'Research record 999 not found for donor 1'
      );
    });

    it('should handle transaction errors', async () => {
      mockTransaction.mockRejectedValue(new Error('Transaction failed'));

      await expect(service.setResearchAsLive(100, 1)).rejects.toThrow(
        'Failed to set research as live: Transaction failed'
      );

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to set research 100 as live')
      );
    });
  });
});