import { WhatsAppQueryToolsService } from '@/app/lib/services/whatsapp/whatsapp-query-tools.service';
import { db } from '@/app/lib/db';
import { logger } from '@/app/lib/logger';

// Mock dependencies
jest.mock('@/app/lib/db');
jest.mock('@/app/lib/logger');

describe('WhatsAppQueryToolsService', () => {
  let service: WhatsAppQueryToolsService;
  let mockDb: any;

  const testOrganizationId = 'org123';

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WhatsAppQueryToolsService();

    // Create mock query builder
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      having: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([])
    };

    (db.select as jest.Mock).mockReturnValue(mockDb);
  });

  describe('findDonorsByName', () => {
    it('should find donors by name with fuzzy matching', async () => {
      const mockDonors = [
        {
          id: 1,
          firstName: 'John',
          lastName: 'Doe',
          displayName: 'John Doe',
          email: 'john@example.com',
          phone: '+1234567890',
          isCouple: false,
          totalDonations: 50000,
          donationCount: 5
        },
        {
          id: 2,
          firstName: 'Johnny',
          lastName: 'Smith',
          displayName: null,
          email: 'johnny@example.com',
          phone: null,
          isCouple: false,
          totalDonations: 10000,
          donationCount: 2
        }
      ];

      mockDb.limit.mockResolvedValue(mockDonors);

      const result = await service.findDonorsByName({
        name: 'John',
        organizationId: testOrganizationId
      });

      expect(result).toEqual(mockDonors);
      expect(mockDb.where).toHaveBeenCalled();
      expect(mockDb.groupBy).toHaveBeenCalled();
      expect(mockDb.orderBy).toHaveBeenCalled();
      expect(mockDb.limit).toHaveBeenCalledWith(10);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Finding donors by name: "John"')
      );
    });

    it('should respect custom limit', async () => {
      mockDb.limit.mockResolvedValue([]);

      await service.findDonorsByName({
        name: 'Test',
        organizationId: testOrganizationId,
        limit: 25
      });

      expect(mockDb.limit).toHaveBeenCalledWith(25);
    });

    it('should handle search by email', async () => {
      const mockDonors = [{
        id: 1,
        firstName: 'User',
        lastName: 'Test',
        displayName: null,
        email: 'test@example.com',
        phone: null,
        isCouple: false,
        totalDonations: 0,
        donationCount: 0
      }];

      mockDb.limit.mockResolvedValue(mockDonors);

      const result = await service.findDonorsByName({
        name: 'test@example.com',
        organizationId: testOrganizationId
      });

      expect(result).toEqual(mockDonors);
    });

    it('should handle errors', async () => {
      const error = new Error('Database error');
      mockDb.limit.mockRejectedValue(error);

      await expect(service.findDonorsByName({
        name: 'Test',
        organizationId: testOrganizationId
      })).rejects.toThrow(error);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error finding donors by name: Database error')
      );
    });

    it('should return empty array when no donors found', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await service.findDonorsByName({
        name: 'NonExistent',
        organizationId: testOrganizationId
      });

      expect(result).toEqual([]);
    });
  });

  describe('getDonorDetails', () => {
    it('should get complete donor details', async () => {
      const mockDonorData = [{
        id: 1,
        firstName: 'John',
        lastName: 'Doe',
        displayName: 'John Doe',
        email: 'john@example.com',
        phone: '+1234567890',
        address: '123 Main St',
        state: 'NY',
        isCouple: false,
        hisFirstName: null,
        hisLastName: null,
        herFirstName: null,
        herLastName: null,
        notes: [{ createdAt: '2024-01-01', createdBy: 'Admin', content: 'VIP donor' }],
        currentStageName: 'Major Donor',
        highPotentialDonor: true,
        staffId: 1,
        staffFirstName: 'Jane',
        staffLastName: 'Admin',
        staffEmail: 'jane@example.com',
        totalDonations: 100000,
        donationCount: 10,
        lastDonationDate: new Date('2024-01-01')
      }];

      mockDb.groupBy.mockResolvedValue(mockDonorData);

      const result = await service.getDonorDetails({
        donorId: 1,
        organizationId: testOrganizationId
      });

      expect(result).toMatchObject({
        id: 1,
        firstName: 'John',
        lastName: 'Doe',
        displayName: 'John Doe',
        email: 'john@example.com',
        assignedStaff: {
          id: 1,
          firstName: 'Jane',
          lastName: 'Admin',
          email: 'jane@example.com'
        },
        totalDonations: 100000,
        donationCount: 10
      });

      expect(mockDb.leftJoin).toHaveBeenCalledTimes(2); // staff and donations
      expect(mockDb.where).toHaveBeenCalled();
    });

    it('should handle donors without assigned staff', async () => {
      const mockDonorData = [{
        id: 1,
        firstName: 'John',
        lastName: 'Doe',
        displayName: null,
        email: 'john@example.com',
        phone: null,
        address: null,
        state: null,
        isCouple: false,
        hisFirstName: null,
        hisLastName: null,
        herFirstName: null,
        herLastName: null,
        notes: null,
        currentStageName: null,
        highPotentialDonor: null,
        staffId: null,
        staffFirstName: null,
        staffLastName: null,
        staffEmail: null,
        totalDonations: 0,
        donationCount: 0,
        lastDonationDate: null
      }];

      mockDb.groupBy.mockResolvedValue(mockDonorData);

      const result = await service.getDonorDetails({
        donorId: 1,
        organizationId: testOrganizationId
      });

      expect(result?.assignedStaff).toBeNull();
    });

    it('should return null when donor not found', async () => {
      mockDb.groupBy.mockResolvedValue([]);

      const result = await service.getDonorDetails({
        donorId: 999,
        organizationId: testOrganizationId
      });

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        'Donor 999 not found in organization org123'
      );
    });

    it('should handle couple donors', async () => {
      const mockCoupleData = [{
        id: 1,
        firstName: 'John & Jane',
        lastName: 'Doe',
        displayName: 'The Doe Family',
        email: 'doe@example.com',
        phone: null,
        address: null,
        state: null,
        isCouple: true,
        hisFirstName: 'John',
        hisLastName: 'Doe',
        herFirstName: 'Jane',
        herLastName: 'Doe',
        notes: null,
        currentStageName: null,
        highPotentialDonor: null,
        staffId: null,
        staffFirstName: null,
        staffLastName: null,
        staffEmail: null,
        totalDonations: 50000,
        donationCount: 5,
        lastDonationDate: null
      }];

      mockDb.groupBy.mockResolvedValue(mockCoupleData);

      const result = await service.getDonorDetails({
        donorId: 1,
        organizationId: testOrganizationId
      });

      expect(result).toMatchObject({
        isCouple: true,
        hisFirstName: 'John',
        hisLastName: 'Doe',
        herFirstName: 'Jane',
        herLastName: 'Doe'
      });
    });
  });

  describe('getDonationHistory', () => {
    it('should get donation history for valid donor', async () => {
      const mockDonations = [
        {
          id: 1,
          date: new Date('2024-01-01'),
          amount: 10000,
          currency: 'USD',
          projectName: 'Education Fund',
          projectId: 1
        },
        {
          id: 2,
          date: new Date('2023-12-01'),
          amount: 5000,
          currency: 'USD',
          projectName: 'Building Fund',
          projectId: 2
        }
      ];

      // Mock donor exists check
      mockDb.limit.mockResolvedValueOnce([{ id: 1 }]);
      // Mock donations query
      mockDb.limit.mockResolvedValueOnce(mockDonations);

      const result = await service.getDonationHistory({
        donorId: 1,
        organizationId: testOrganizationId
      });

      expect(result).toEqual(mockDonations);
      expect(mockDb.innerJoin).toHaveBeenCalled();
      expect(mockDb.orderBy).toHaveBeenCalled();
    });

    it('should return empty array when donor not found', async () => {
      // Mock donor exists check - returns empty
      mockDb.limit.mockResolvedValueOnce([]);

      const result = await service.getDonationHistory({
        donorId: 999,
        organizationId: testOrganizationId
      });

      expect(result).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        'Donor 999 not found in organization org123'
      );
    });

    it('should respect custom limit', async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: 1 }]);
      mockDb.limit.mockResolvedValueOnce([]);

      await service.getDonationHistory({
        donorId: 1,
        organizationId: testOrganizationId,
        limit: 100
      });

      expect(mockDb.limit).toHaveBeenNthCalledWith(2, 100);
    });
  });

  describe('getDonorStatistics', () => {
    it('should calculate donor statistics correctly', async () => {
      const mockStats = [{
        totalDonors: 150,
        totalDonations: 500,
        totalDonationAmount: 1500000, // $15,000
        averageDonationAmount: 3000, // $30
        highPotentialDonors: 25,
        couplesCount: 40,
        individualsCount: 110
      }];

      mockDb.where.mockResolvedValue(mockStats);

      const result = await service.getDonorStatistics({
        organizationId: testOrganizationId
      });

      expect(result).toEqual(mockStats[0]);
      expect(mockDb.leftJoin).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Retrieved statistics for organization org123: 150 donors, 500 donations')
      );
    });

    it('should handle organization with no data', async () => {
      const mockStats = [{
        totalDonors: 0,
        totalDonations: 0,
        totalDonationAmount: 0,
        averageDonationAmount: 0,
        highPotentialDonors: 0,
        couplesCount: 0,
        individualsCount: 0
      }];

      mockDb.where.mockResolvedValue(mockStats);

      const result = await service.getDonorStatistics({
        organizationId: testOrganizationId
      });

      expect(result.totalDonors).toBe(0);
      expect(result.totalDonationAmount).toBe(0);
    });
  });

  describe('getTopDonors', () => {
    it('should get top donors by donation amount', async () => {
      const mockTopDonors = [
        {
          id: 1,
          firstName: 'Major',
          lastName: 'Donor',
          displayName: 'Major Donor',
          email: 'major@example.com',
          totalDonations: 500000,
          donationCount: 20,
          lastDonationDate: new Date('2024-01-01')
        },
        {
          id: 2,
          firstName: 'Big',
          lastName: 'Giver',
          displayName: null,
          email: 'big@example.com',
          totalDonations: 250000,
          donationCount: 15,
          lastDonationDate: new Date('2023-12-01')
        }
      ];

      mockDb.limit.mockResolvedValue(mockTopDonors);

      const result = await service.getTopDonors({
        organizationId: testOrganizationId
      });

      expect(result).toEqual(mockTopDonors);
      expect(mockDb.having).toHaveBeenCalled();
      expect(mockDb.orderBy).toHaveBeenCalled();
      expect(mockDb.limit).toHaveBeenCalledWith(10);
    });

    it('should respect custom limit', async () => {
      mockDb.limit.mockResolvedValue([]);

      await service.getTopDonors({
        organizationId: testOrganizationId,
        limit: 20
      });

      expect(mockDb.limit).toHaveBeenCalledWith(20);
    });

    it('should return empty array when no donors with donations', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await service.getTopDonors({
        organizationId: testOrganizationId
      });

      expect(result).toEqual([]);
    });
  });

  describe('executeFlexibleQuery', () => {
    describe('donor-donations-by-project', () => {
      it('should find donations by donor and project', async () => {
        const mockResults = [{
          donorId: 1,
          donorFirstName: 'John',
          donorLastName: 'Doe',
          donorDisplayName: null,
          donationId: 1,
          donationDate: new Date('2024-01-01'),
          donationAmount: 10000,
          donationCurrency: 'USD',
          projectId: 1,
          projectName: 'Education Fund',
          projectDescription: 'Supporting education'
        }];

        mockDb.limit.mockResolvedValue(mockResults);

        const result = await service.executeFlexibleQuery({
          type: 'donor-donations-by-project',
          organizationId: testOrganizationId,
          filters: {
            donorName: 'John',
            projectName: 'Education'
          }
        });

        expect(result).toEqual(mockResults);
        expect(mockDb.innerJoin).toHaveBeenCalledTimes(2); // donors and projects
      });

      it('should work without filters', async () => {
        mockDb.limit.mockResolvedValue([]);

        await service.executeFlexibleQuery({
          type: 'donor-donations-by-project',
          organizationId: testOrganizationId,
          filters: {}
        });

        expect(mockDb.where).toHaveBeenCalled();
      });
    });

    describe('donor-donations-by-date', () => {
      it('should find donations within date range', async () => {
        const mockResults = [{
          donorId: 1,
          donorFirstName: 'John',
          donorLastName: 'Doe',
          donorDisplayName: null,
          donationId: 1,
          donationDate: new Date('2024-01-15'),
          donationAmount: 5000,
          donationCurrency: 'USD',
          projectId: 1,
          projectName: 'General Fund'
        }];

        mockDb.limit.mockResolvedValue(mockResults);

        const result = await service.executeFlexibleQuery({
          type: 'donor-donations-by-date',
          organizationId: testOrganizationId,
          filters: {
            donorName: 'John',
            startDate: '2024-01-01',
            endDate: '2024-01-31'
          }
        });

        expect(result).toEqual(mockResults);
      });

      it('should handle only start date', async () => {
        mockDb.limit.mockResolvedValue([]);

        await service.executeFlexibleQuery({
          type: 'donor-donations-by-date',
          organizationId: testOrganizationId,
          filters: {
            startDate: '2024-01-01'
          }
        });

        expect(mockDb.where).toHaveBeenCalled();
      });

      it('should handle only end date', async () => {
        mockDb.limit.mockResolvedValue([]);

        await service.executeFlexibleQuery({
          type: 'donor-donations-by-date',
          organizationId: testOrganizationId,
          filters: {
            endDate: '2024-12-31'
          }
        });

        expect(mockDb.where).toHaveBeenCalled();
      });
    });

    describe('project-donations', () => {
      it('should find all donations to a project', async () => {
        const mockResults = [{
          donorId: 1,
          donorFirstName: 'John',
          donorLastName: 'Doe',
          donorDisplayName: null,
          donorEmail: 'john@example.com',
          donationId: 1,
          donationDate: new Date('2024-01-01'),
          donationAmount: 10000,
          donationCurrency: 'USD',
          projectId: 1,
          projectName: 'Building Fund',
          projectDescription: 'New building project'
        }];

        mockDb.limit.mockResolvedValue(mockResults);

        const result = await service.executeFlexibleQuery({
          type: 'project-donations',
          organizationId: testOrganizationId,
          filters: {
            projectName: 'Building'
          }
        });

        expect(result).toEqual(mockResults);
      });
    });

    describe('donor-project-history', () => {
      it('should get complete donor project history', async () => {
        const mockResults = [{
          donorId: 1,
          donorFirstName: 'John',
          donorLastName: 'Doe',
          donorDisplayName: null,
          donationId: 1,
          donationDate: new Date('2024-01-01'),
          donationAmount: 10000,
          donationCurrency: 'USD',
          projectId: 1,
          projectName: 'Education Fund',
          projectDescription: 'Supporting education',
          projectTotalFromDonor: 50000,
          projectDonationCount: 5
        }];

        mockDb.limit.mockResolvedValue(mockResults);

        const result = await service.executeFlexibleQuery({
          type: 'donor-project-history',
          organizationId: testOrganizationId,
          filters: {
            donorName: 'John'
          }
        });

        expect(result).toEqual(mockResults);
      });
    });

    describe('custom-donor-search', () => {
      it('should search donors with multiple criteria', async () => {
        const mockResults = [{
          id: 1,
          firstName: 'John',
          lastName: 'Doe',
          displayName: null,
          email: 'john@example.com',
          phone: '+1234567890',
          address: '123 Main St',
          state: 'NY',
          isCouple: false,
          highPotentialDonor: true,
          currentStageName: 'Major Donor',
          assignedStaffId: 1,
          assignedStaffName: 'Jane Admin',
          totalDonations: 100000,
          donationCount: 10,
          lastDonationDate: new Date('2024-01-01')
        }];

        mockDb.limit.mockResolvedValue(mockResults);

        const result = await service.executeFlexibleQuery({
          type: 'custom-donor-search',
          organizationId: testOrganizationId,
          filters: {
            name: 'John',
            email: 'john',
            state: 'NY',
            isCouple: false,
            highPotential: true,
            assignedStaff: 'Jane'
          }
        });

        expect(result).toEqual(mockResults);
        expect(mockDb.groupBy).toHaveBeenCalled();
      });

      it('should handle partial filters', async () => {
        mockDb.limit.mockResolvedValue([]);

        await service.executeFlexibleQuery({
          type: 'custom-donor-search',
          organizationId: testOrganizationId,
          filters: {
            state: 'CA'
          }
        });

        expect(mockDb.where).toHaveBeenCalled();
      });
    });

    it('should handle unknown query type', async () => {
      await expect(service.executeFlexibleQuery({
        type: 'unknown-type' as any,
        organizationId: testOrganizationId,
        filters: {}
      })).rejects.toThrow('Unknown query type: unknown-type');
    });

    it('should handle database errors', async () => {
      const error = new Error('Database connection failed');
      mockDb.limit.mockRejectedValue(error);

      await expect(service.executeFlexibleQuery({
        type: 'donor-donations-by-project',
        organizationId: testOrganizationId,
        filters: {}
      })).rejects.toThrow(error);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error executing flexible query: Database connection failed')
      );
    });

    it('should respect custom limit in all query types', async () => {
      const queryTypes = [
        'donor-donations-by-project',
        'donor-donations-by-date',
        'project-donations',
        'donor-project-history',
        'custom-donor-search'
      ] as const;

      mockDb.limit.mockResolvedValue([]);

      for (const type of queryTypes) {
        await service.executeFlexibleQuery({
          type,
          organizationId: testOrganizationId,
          filters: {},
          limit: 75
        });
      }

      expect(mockDb.limit).toHaveBeenCalledWith(75);
      expect(mockDb.limit).toHaveBeenCalledTimes(queryTypes.length);
    });
  });
});