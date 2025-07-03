import { WhatsAppQueryEngineService } from '@/app/lib/services/whatsapp/whatsapp-query-engine.service';
import { db } from '@/app/lib/db';
import { donors, donations, projects, staff } from '@/app/lib/db/schema';
import { logger } from '@/app/lib/logger';
import { eq, and, desc, asc, sql } from 'drizzle-orm';

// Mock dependencies
jest.mock('@/app/lib/db');
jest.mock('@/app/lib/logger');

describe('WhatsAppQueryEngineService', () => {
  let service: WhatsAppQueryEngineService;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WhatsAppQueryEngineService();

    // Create a mock query builder
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([])
    };

    (db.select as jest.Mock).mockReturnValue(mockDb);
  });

  describe('executeFlexibleQuery', () => {
    const baseParams = {
      queryType: 'findDonors' as const,
      organizationId: 'org123'
    };

    describe('parameter validation', () => {
      it('should validate required parameters', async () => {
        const invalidParams = {
          queryType: 'invalid' as any,
          organizationId: 'org123'
        };

        await expect(service.executeFlexibleQuery(invalidParams)).rejects.toThrow(
          'Invalid query parameters'
        );
      });

      it('should validate filter operations', async () => {
        const params = {
          ...baseParams,
          filters: [{
            field: 'firstName',
            operation: 'invalid_op' as any,
            value: 'John'
          }]
        };

        await expect(service.executeFlexibleQuery(params)).rejects.toThrow(
          'Invalid query parameters'
        );
      });
    });

    describe('findDonors query', () => {
      it('should execute basic donor search', async () => {
        const mockDonors = [
          { id: '1', firstName: 'John', lastName: 'Doe', totalDonations: 1000 },
          { id: '2', firstName: 'Jane', lastName: 'Smith', totalDonations: 2000 }
        ];

        mockDb.limit.mockResolvedValue(mockDonors);

        const result = await service.executeFlexibleQuery(baseParams);

        expect(db.select).toHaveBeenCalled();
        expect(mockDb.from).toHaveBeenCalledWith(donors);
        expect(mockDb.leftJoin).toHaveBeenCalledWith(donations, expect.any(Object));
        expect(mockDb.where).toHaveBeenCalled();
        expect(mockDb.groupBy).toHaveBeenCalled();
        expect(mockDb.limit).toHaveBeenCalledWith(100);
        expect(result).toEqual(mockDonors);
      });

      it('should apply donor filters correctly', async () => {
        const params = {
          ...baseParams,
          filters: [
            { field: 'firstName', operation: 'contains' as const, value: 'John' },
            { field: 'highPotentialDonor', operation: 'equals' as const, value: true }
          ]
        };

        await service.executeFlexibleQuery(params);

        expect(mockDb.where).toHaveBeenCalled();
        expect(logger.info).toHaveBeenCalledWith(
          expect.stringContaining('Executing flexible query type: findDonors')
        );
      });

      it('should handle combined name search', async () => {
        const params = {
          ...baseParams,
          filters: [{
            field: 'name',
            operation: 'contains' as const,
            value: 'John Doe'
          }]
        };

        await service.executeFlexibleQuery(params);

        expect(mockDb.where).toHaveBeenCalled();
      });

      it('should apply sorting correctly', async () => {
        const params = {
          ...baseParams,
          sortBy: 'totalDonations',
          sortDirection: 'desc' as const
        };

        await service.executeFlexibleQuery(params);

        expect(mockDb.orderBy).toHaveBeenCalled();
      });

      it('should respect limit parameter', async () => {
        const params = {
          ...baseParams,
          limit: 50
        };

        await service.executeFlexibleQuery(params);

        expect(mockDb.limit).toHaveBeenCalledWith(50);
      });
    });

    describe('donorDetails query', () => {
      it('should get detailed donor information', async () => {
        const mockDonorDetails = [{
          id: '1',
          firstName: 'John',
          lastName: 'Doe',
          staffFirstName: 'Staff',
          staffLastName: 'Member',
          totalDonations: 5000
        }];

        mockDb.limit.mockResolvedValue(mockDonorDetails);

        const params = {
          queryType: 'donorDetails' as const,
          organizationId: 'org123',
          filters: [{ field: 'id', operation: 'equals' as const, value: '1' }]
        };

        const result = await service.executeFlexibleQuery(params);

        expect(mockDb.leftJoin).toHaveBeenCalledWith(staff, expect.any(Object));
        expect(mockDb.leftJoin).toHaveBeenCalledWith(donations, expect.any(Object));
        expect(mockDb.limit).toHaveBeenCalledWith(100); // Default limit
        expect(result).toEqual(mockDonorDetails);
      });
    });

    describe('findDonations query', () => {
      it('should find donations with joins', async () => {
        const mockDonations = [{
          id: '1',
          amount: 100,
          donorFirstName: 'John',
          projectName: 'Education Fund'
        }];

        mockDb.limit.mockResolvedValue(mockDonations);

        const params = {
          queryType: 'findDonations' as const,
          organizationId: 'org123',
          filters: [{ field: 'amount', operation: 'greater_than' as const, value: 50 }]
        };

        const result = await service.executeFlexibleQuery(params);

        expect(mockDb.innerJoin).toHaveBeenCalledWith(donors, expect.any(Object));
        expect(mockDb.innerJoin).toHaveBeenCalledWith(projects, expect.any(Object));
        expect(result).toEqual(mockDonations);
      });

      it('should handle donation date filters', async () => {
        const params = {
          queryType: 'findDonations' as const,
          organizationId: 'org123',
          filters: [{
            field: 'date',
            operation: 'between' as const,
            values: ['2024-01-01', '2024-12-31']
          }]
        };

        await service.executeFlexibleQuery(params);

        expect(mockDb.where).toHaveBeenCalled();
      });
    });

    describe('findProjects query', () => {
      it('should find projects with statistics', async () => {
        const mockProjects = [{
          id: '1',
          name: 'Education Fund',
          totalDonations: 50000,
          donationCount: 100
        }];

        mockDb.limit.mockResolvedValue(mockProjects);

        const params = {
          queryType: 'findProjects' as const,
          organizationId: 'org123',
          filters: [{ field: 'active', operation: 'equals' as const, value: true }]
        };

        const result = await service.executeFlexibleQuery(params);

        expect(mockDb.leftJoin).toHaveBeenCalledWith(donations, expect.any(Object));
        expect(result).toEqual(mockProjects);
      });
    });

    describe('findStaff query', () => {
      it('should find staff with assigned donor counts', async () => {
        const mockStaff = [{
          id: '1',
          firstName: 'Jane',
          lastName: 'Admin',
          assignedDonorCount: 25
        }];

        mockDb.limit.mockResolvedValue(mockStaff);

        const params = {
          queryType: 'findStaff' as const,
          organizationId: 'org123',
          filters: [{ field: 'isPrimary', operation: 'equals' as const, value: true }]
        };

        const result = await service.executeFlexibleQuery(params);

        expect(mockDb.leftJoin).toHaveBeenCalledWith(donors, expect.any(Object));
        expect(result).toEqual(mockStaff);
      });
    });

    describe('donorStats query', () => {
      it('should calculate overall donor statistics', async () => {
        const mockStats = [{
          totalDonors: 100,
          totalDonations: 500,
          totalDonationAmount: 150000,
          averageDonationAmount: 300,
          highPotentialDonors: 20,
          couplesCount: 30,
          individualsCount: 70
        }];

        // Mock the query chain that doesn't end with limit
        mockDb.where.mockResolvedValue(mockStats);

        const params = {
          queryType: 'donorStats' as const,
          organizationId: 'org123'
        };

        const result = await service.executeFlexibleQuery(params);

        expect(result).toEqual(mockStats);
      });
    });

    describe('projectStats query', () => {
      it('should calculate project statistics', async () => {
        const mockStats = [{
          totalProjects: 10,
          activeProjects: 8,
          totalDonations: 1000,
          totalDonationAmount: 500000
        }];

        // Mock the query chain that doesn't end with limit
        mockDb.where.mockResolvedValue(mockStats);

        const params = {
          queryType: 'projectStats' as const,
          organizationId: 'org123'
        };

        const result = await service.executeFlexibleQuery(params);

        expect(result).toEqual(mockStats);
      });
    });

    describe('filter operations', () => {
      it('should handle "in" operation', async () => {
        const params = {
          ...baseParams,
          filters: [{
            field: 'state',
            operation: 'in' as const,
            values: ['NY', 'CA', 'TX']
          }]
        };

        await service.executeFlexibleQuery(params);

        expect(mockDb.where).toHaveBeenCalled();
      });

      it('should handle "is_null" operation', async () => {
        const params = {
          ...baseParams,
          filters: [{
            field: 'assignedToStaffId',
            operation: 'is_null' as const
          }]
        };

        await service.executeFlexibleQuery(params);

        expect(mockDb.where).toHaveBeenCalled();
      });

      it('should handle "between" operation with proper values', async () => {
        const params = {
          queryType: 'findDonations' as const,
          organizationId: 'org123',
          filters: [{
            field: 'amount',
            operation: 'between' as const,
            values: [100, 1000]
          }]
        };

        await service.executeFlexibleQuery(params);

        expect(mockDb.where).toHaveBeenCalled();
      });

      it('should ignore filters with missing required values', async () => {
        const params = {
          ...baseParams,
          filters: [{
            field: 'firstName',
            operation: 'in' as const,
            values: [] // Empty array should be ignored
          }]
        };

        await service.executeFlexibleQuery(params);

        // Filter should be ignored due to empty values
        expect(mockDb.where).toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should handle database errors', async () => {
        const dbError = new Error('Database connection failed');
        mockDb.limit.mockRejectedValue(dbError);

        await expect(service.executeFlexibleQuery(baseParams)).rejects.toThrow(dbError);

        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining('Error executing flexible query')
        );
      });

      it('should handle unsupported query types', async () => {
        const params = {
          queryType: 'unsupportedQuery' as any,
          organizationId: 'org123'
        };

        await expect(service.executeFlexibleQuery(params)).rejects.toThrow(
          'Invalid query parameters'
        );
      });
    });

    describe('sorting behavior', () => {
      it('should apply default sorting when no sortBy specified', async () => {
        await service.executeFlexibleQuery(baseParams);

        expect(mockDb.orderBy).toHaveBeenCalled();
      });

      it('should handle custom sorting fields', async () => {
        const params = {
          ...baseParams,
          sortBy: 'firstName',
          sortDirection: 'asc' as const
        };

        await service.executeFlexibleQuery(params);

        expect(mockDb.orderBy).toHaveBeenCalled();
      });

      it('should handle sorting for different query types', async () => {
        const donationParams = {
          queryType: 'findDonations' as const,
          organizationId: 'org123',
          sortBy: 'amount',
          sortDirection: 'desc' as const
        };

        await service.executeFlexibleQuery(donationParams);

        expect(mockDb.orderBy).toHaveBeenCalled();
      });
    });

    describe('complex filter scenarios', () => {
      it('should handle multiple filters of different types', async () => {
        const params = {
          ...baseParams,
          filters: [
            { field: 'state', operation: 'equals' as const, value: 'NY' },
            { field: 'email', operation: 'ends_with' as const, value: '@gmail.com' },
            { field: 'notes', operation: 'is_not_null' as const }
          ]
        };

        await service.executeFlexibleQuery(params);

        expect(mockDb.where).toHaveBeenCalled();
      });

      it('should handle special character escaping in filters', async () => {
        const params = {
          ...baseParams,
          filters: [{
            field: 'firstName',
            operation: 'contains' as const,
            value: "O'Brien" // Name with apostrophe
          }]
        };

        await service.executeFlexibleQuery(params);

        expect(mockDb.where).toHaveBeenCalled();
      });
    });
  });
});